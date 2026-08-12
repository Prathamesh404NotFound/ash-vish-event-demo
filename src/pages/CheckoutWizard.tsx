import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Lock, Clock, RefreshCw, ShieldCheck, CreditCard } from 'lucide-react';
import { useBooking, ReservationState, QuoteResult, getSessionId } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { CountdownTimer } from '../components/CountdownTimer';
import { formatINR } from '../utils/formatters';
import { ref, get } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { SeatMap } from '../components/SeatMap';
import { useRazorpay } from '../hooks/useRazorpay';
import { safeFetch, getApiUrl } from '../lib/api';

interface CheckoutWizardProps {
  onBack: () => void;
  onSuccess: () => void;
}

/** Wizard steps:
 *  1 – Tickets (event + tier + quantity)
 *  2 – Seats (only when event has a seat map)
 *  3 – Attendee details
 *  4 – Review (summary before payment; requires explicit confirmation)
 *  5 – Payment
 */
const FIRST_STEP = 1;

export const CheckoutWizard: React.FC<CheckoutWizardProps> = ({ onBack, onSuccess }) => {
  const ctx = useBooking();
  const {
    currentCheckout, bookingStep, setBookingStep,
    seatProjection, seatsConnected, reservation, quote, setQuote,
    reviewConfirmed, setReviewConfirmed, pendingSeatCount, reservationError,
    createReservation, refreshReservation, cancelReservation, setAttendeeDetails,
    confirmPurchase, confirmServerPurchasedTicket, selectTicketsForCheckout, releaseHeldSeats, validateCouponServer,
  } = ctx;
  const { user } = useAuth();

  const {
    processRazorpayPayment, isLoading: isRazorpayLoading, error: razorpayError,
  } = useRazorpay();

  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  // Coupon state (local until payment; server quote is the payment authority)
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Form state — seeded from the restored server reservation so a page reload
  // keeps the attendee details the user already entered; falls back to the
  // logged-in user and (only as a last resort) demo placeholders.
  const [attendeeName, setAttendeeName] = useState(user?.name || reservation?.attendee?.name || '');
  const [attendeeEmail, setAttendeeEmail] = useState(user?.email || reservation?.attendee?.email || '');
  const [attendeePhone, setAttendeePhone] = useState(user?.phone || reservation?.attendee?.phone || '');
  const [attendeeDirty, setAttendeeDirty] = useState(false);

  // Sync form with the restored reservation's attendee details on load.
  useEffect(() => {
    if (reservation?.attendee && !attendeeDirty) {
      const a = reservation.attendee;
      if (a.name && a.name !== attendeeName) setAttendeeName(a.name);
      if (a.email && a.email !== attendeeEmail) setAttendeeEmail(a.email);
      if (a.phone && a.phone !== attendeePhone) setAttendeePhone(a.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingActionRef = useRef(false);
  const inFlightSeatsRef = useRef<string | null>(null);

  if (!currentCheckout) {
    return (
      <div className="pt-24 pb-12 max-w-lg mx-auto text-center px-4 space-y-4">
        <h2 className="font-heading font-bold text-2xl text-white">No Active Checkout Session</h2>
        <p className="text-xs text-gray-400">Please select an event and ticket tier first.</p>
        <button onClick={onBack} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-xs cursor-pointer">
          Browse Events
        </button>
      </div>
    );
  }

  const { event, tier, quantity, selectedSeats } = currentCheckout;
  const hasSeatMap = Boolean(event.seatMap);
  const seatSelectionStep = hasSeatMap ? 2 : 1;
  const attendeeStep = seatSelectionStep + 1;
  const reviewStep = attendeeStep + 1;
  const paymentStep = reviewStep + 1;

  const originalTotalPrice = tier.price * quantity;
  // If the server returned a quote, it is the payment authority (includes coupon).
  const serverSubtotalMinor = quote?.quote.subtotalMinor;
  const serverTotalMinor = quote?.quote.totalMinor;
  const serverDiscountMinor = quote?.quote.discountMinor;
  const quoteAppliedCoupon = quote?.appliedCoupon;
  const serverTotal = serverTotalMinor !== undefined ? Math.round(serverTotalMinor / 100) : Math.max(0, originalTotalPrice - discountAmount);
  const serverDiscount = serverDiscountMinor !== undefined ? Math.round(serverDiscountMinor / 100) : discountAmount;
  const serverSubtotal = serverSubtotalMinor !== undefined ? Math.round(serverSubtotalMinor / 100) : originalTotalPrice;

  // ------------------------------------------------------------------
  // Reservation lifecycle effects
  // ------------------------------------------------------------------

  // When moving to the seat step, auto-create/refresh a reservation if seats change.
  useEffect(() => {
    if (bookingStep !== seatSelectionStep) return;
    const seats = (selectedSeats || []).slice();
    if (seats.length === 0 || pendingActionRef.current) return;
    (async () => {
      pendingActionRef.current = true;
      try {
        if (reservation && reservation.seatIds.length > 0 && reservation.seatIds.join(',') === seats.sort().join(',') && reservation.status === 'active') {
          await refreshReservation();
        } else {
          await createReservation(seats);
        }
      } catch (err) {
        // error already surfaced in context; stay on seats and let user retry
      } finally {
        pendingActionRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingStep]);

  // Refresh reservation when seats change on the seat step.
  // A ref tracks attempts so a transient failure (e.g. a dev-only StrictMode unmount race or a brief server blip)
  // does not strand the UI on "holding" — the effect will retry once after a short delay when the reservation
  // still hasn't materialized.
  const createAttemptsRef = useRef(0);
  useEffect(() => {
    if (bookingStep !== seatSelectionStep) return;
    const seats = (selectedSeats || []).slice();
    if (seats.length === 0 || pendingActionRef.current) return;
    // StrictMode guard: a synchronous re-invocation (second mount within the same tick)
    // should run against the fresh mount's state — but the first invocation already
    // fired the request with identical idempotency. Track the in-flight seat-set so the
    // duplicate StrictMode run refreshes instead of creating a second reservation.
    const key = JSON.stringify([...seats].sort());
    if (inFlightSeatsRef.current === key) return;
    inFlightSeatsRef.current = key;
    (async () => {
      try {
        if (reservation && reservation.status === 'active' && JSON.stringify([...reservation.seatIds].sort()) === key) {
          await refreshReservation();
          createAttemptsRef.current = 0;
        } else {
          await createReservation(seats);
          createAttemptsRef.current = 0;
        }
      } catch (err) {
        /* error already surfaced via reservationError */
      } finally {
        pendingActionRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeats, bookingStep]);

  // Retry guard: if seats were requested but no active reservation exists after the effects ran,
  // retry the create once (idempotency key makes duplicates safe). Covers dev StrictMode races and
  // brief network/server blips.
  useEffect(() => {
    const seats = (selectedSeats || []).slice();
    if (bookingStep !== seatSelectionStep || seats.length === 0) return;
    if (reservation && reservation.status === 'active') {
      createAttemptsRef.current = 0;
      return;
    }
    if (createAttemptsRef.current >= 1 || pendingActionRef.current) return;
    const t = setTimeout(() => {
      createAttemptsRef.current += 1;
      createReservation(seats).catch(() => {/* surfaced via reservationError */});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingStep, selectedSeats, reservation?.status]);

  // Expire the review confirmation when the reservation is recreated (selection changed).
  useEffect(() => {
    if (reviewConfirmed && reservation) {
      const same = reservation.seatIds.length === (selectedSeats || []).length &&
        [...reservation.seatIds].sort().join(',') === [...(selectedSeats || [])].sort().join(',');
      if (!same) setReviewConfirmed(false);
    }
  }, [reservation, selectedSeats, reviewConfirmed, setReviewConfirmed]);

  // Clean up reservation when leaving checkout entirely.
  // Guard: React 18 StrictMode (dev only) double-invokes effects, so a synthetic
  // unmount happens immediately after mount. Only release when unmount occurs at
  // least 400ms after mount — a real navigation away takes the user time.
  const mountAtRef = useRef<number>(Date.now());
  useEffect(() => {
    return () => {
      if (Date.now() - mountAtRef.current < 400) return; // StrictMode synthetic unmount
      if (reservation?.status === 'active') {
        cancelReservation();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Coupon -> server quote
  // ------------------------------------------------------------------
  const handleApplyCoupon = async () => {
    const code = couponCodeInput.trim();
    if (!code) return;
    if (!reservation) {
      setCouponError('Select your seats first, then apply the coupon.');
      return;
    }
    setCouponError(null);
    setIsValidatingCoupon(true);
    try {
      const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
        body: JSON.stringify({ couponCode: code }),
      });
      const data = res.data || {};
      setIsValidatingCoupon(false);
      if (!res.ok || !data.success) {
        setAppliedCoupon(null);
        setDiscountAmount(0);
        setQuote(null);
        setCouponError(data.error || res.error || 'Invalid or expired coupon code.');
        return;
      }
      const qr: QuoteResult = { quote: data.quote, appliedCoupon: data.appliedCoupon };
      setQuote(qr);
      setAppliedCoupon(data.appliedCoupon || { code });
      setDiscountAmount(Math.round((qr.quote.subtotalMinor - qr.quote.totalMinor) / 100));
      setCouponError(null);
    } catch {
      setIsValidatingCoupon(false);
      setCouponError('Network error while validating coupon.');
    }
  };

  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setCouponCodeInput('');
    setCouponError(null);
    if (reservation) {
      try {
        const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
          body: JSON.stringify({ couponCode: '' }),
        });
        const data = res.data || {};
        if (res.ok && data.success) {
          setQuote({ quote: data.quote });
        }
      } catch {
        /* ignore */
      }
    } else {
      setQuote(null);
    }
  };

  // ------------------------------------------------------------------
  // Step navigation
  // ------------------------------------------------------------------
  const canAdvanceFromSeats = () => {
    if (!hasSeatMap) return true;
    return (selectedSeats || []).length >= quantity;
  };

  const handleAdvanceSeats = async () => {
    setSubmitError('');
    const seats = (selectedSeats || []).slice();
    if (seats.length < quantity) {
      setSubmitError(`Select ${quantity - seats.length} more seat(s) to continue.`);
      return;
    }
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    try {
      // Ensure server-side holds exist for the selection before advancing.
      const res = await createReservation(seats);
      if (res.status !== 'active') {
        setSubmitError('Your seat hold expired. Please confirm the seats and continue again.');
        return;
      }
      // Persist attendee draft for convenience.
      await saveAttendeeDraft();
      setBookingStep(attendeeStep);
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not hold the seats. Please try again.');
    } finally {
      pendingActionRef.current = false;
    }
  };

  const saveAttendeeDraft = async () => {
    if (attendeeDirty && reservation) {
      await setAttendeeDetails({ name: attendeeName, email: attendeeEmail, phone: attendeePhone });
      setAttendeeDirty(false);
    }
  };

  const handleAdvanceAttendee = async () => {
    setSubmitError('');
    if (!attendeeName.trim() || !attendeeEmail.trim() || !attendeePhone.trim()) {
      setSubmitError('Please fill in all attendee details to continue.');
      return;
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmail);
    if (!validEmail) {
      setSubmitError('Please enter a valid email address.');
      return;
    }
    const phoneDigits = attendeePhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setSubmitError('Please enter a valid 10-digit mobile number.');
      return;
    }
    // Save attendee to server reservation before review.
    const saved = await setAttendeeDetails({ name: attendeeName, email: attendeeEmail, phone: attendeePhone });
    setAttendeeDirty(false);
    if (!saved) {
      setSubmitError('Could not save attendee details. Check your connection and try again.');
      return;
    }
    // Refresh the reservation AND fetch the server-authoritative quote so the
    // review totals can never fall back to a stale client-side price.
    await refreshReservation();
    await refreshServerQuote();
    setBookingStep(reviewStep);
  };

  /** Fetch the live server quote for the active reservation (payment authority). */
  const refreshServerQuote = async () => {
    if (!reservation) return;
    try {
      const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': getSessionId() },
        body: JSON.stringify({ refresh: true }),
      });
      const data = res.data || {};
      if (res.ok && data.success && data.quote) {
        setQuote({ quote: data.quote, appliedCoupon: data.appliedCoupon || null });
      }
    } catch {
      /* quote refresh is best-effort; payment handler re-verifies on the server */
    }
  };

  // Re-fetch the server quote whenever the review step is entered (covers direct
  // navigation and page reloads where no quote has been fetched yet).
  useEffect(() => {
    if (bookingStep === reviewStep && reservation) {
      refreshServerQuote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingStep]);

  const handleBack = () => {
    setSubmitError('');
    if (bookingStep <= FIRST_STEP) {
      onBack();
      return;
    }
    if (bookingStep === paymentStep && reservation?.status === 'active') {
      // Payment step back -> return to review (reservation keeps the holds alive).
      setBookingStep(reviewStep);
      return;
    }
    if (bookingStep === reviewStep) {
      setBookingStep(attendeeStep);
      return;
    }
    if (bookingStep === attendeeStep) {
      setBookingStep(seatSelectionStep);
      return;
    }
    if (bookingStep === seatSelectionStep) {
      // Back from seats to tickets: release server holds and go back.
      cancelReservation();
      setBookingStep(FIRST_STEP);
      return;
    }
    setBookingStep(Math.max(FIRST_STEP, bookingStep - 1));
  };

  // ------------------------------------------------------------------
  // Payment
  // ------------------------------------------------------------------
  const handlePaymentFailure = async (errMsg?: string) => {
    setIsProcessing(false);
    setSubmitError(errMsg || 'Payment was cancelled or failed. Your seats are still held until the timer expires.');
  };

  const sendConfirmationEmail = async (confirmedTicket: any) => {
    try {
      await safeFetch('/api/tickets/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeEmail,
          attendeeName,
          ticketNumber: confirmedTicket.ticketNumber,
          eventTitle: event.title,
        }),
      });
    } catch (e) {
      console.warn('Email notice trigger:', e);
    }
  };

  const handlePayment = async () => {
    setSubmitError('');

    // Gate: explicit review confirmation required.
    if (!reviewConfirmed) {
      setSubmitError('Please check "I confirm my selection" before paying.');
      return;
    }
    // Gate: reservation must be active and match the current selection.
    if (!reservation || reservation.status !== 'active') {
      setSubmitError('Your seat hold has expired. Please re-select your seats.');
      return;
    }
    const seatsMatch =
      reservation.seatIds.length === (selectedSeats || []).length &&
      [...reservation.seatIds].sort().join(',') === [...(selectedSeats || [])].sort().join(',');
    if (!seatsMatch) {
      setSubmitError('Your seats have changed since the last review. Please review your selection again.');
      return;
    }

    try {
      await processRazorpayPayment({
        amount: serverTotal,
        eventId: event.id,
        tierId: tier.id,
        seatIds: reservation.seatIds,
        quantity,
        reservationId: reservation.reservationId,
        userId: user?.id || 'anon_user',
        couponCode: quoteAppliedCoupon?.code || undefined,
        customerDetails: { name: attendeeName, email: attendeeEmail, phone: attendeePhone },
        onSuccess: async (result) => {
          try {
            setIsProcessing(true);
            // The server verified the Razorpay signature and finalized the seat
            // claim atomically in the verify-payment handler.
            let confirmedTicket;
            if (result.ticket && result.booking) {
              confirmedTicket = confirmServerPurchasedTicket(result.ticket, result.booking);
            } else {
              confirmedTicket = await confirmPurchase(
                { name: attendeeName, email: attendeeEmail, phone: attendeePhone },
                'razorpay',
                user?.id
              );
            }

            await sendConfirmationEmail(confirmedTicket);
            setIsProcessing(false);
            onSuccess();
          } catch (confirmErr) {
            console.error('Error confirming purchase after payment:', confirmErr);
            setSubmitError('Payment succeeded, but ticket registration failed. Please contact support.');
            setIsProcessing(false);
          }
        },
        onFailure: (errMsg) => handlePaymentFailure(errMsg),
      });
    } catch (err: any) {
      console.error('Razorpay process error:', err);
      handlePaymentFailure(err?.message || 'Payment execution failed.');
    }
  };

  // ------------------------------------------------------------------
  // Derived UI helpers
  // ------------------------------------------------------------------
  const isBusy = isProcessing || isRazorpayLoading;
  const stepsMeta = useMemo(
    () => [
      { n: FIRST_STEP, label: 'Tickets' },
      ...(hasSeatMap ? [{ n: 2, label: 'Seats' }] : []),
      { n: attendeeStep, label: 'Attendee' },
      { n: reviewStep, label: 'Review' },
      { n: paymentStep, label: 'Payment' },
    ],
    [hasSeatMap, attendeeStep, reviewStep, paymentStep]
  );

  const seatLabelFor = (seatIds: string[]) =>
    seatIds
      .map((s) => {
        const parts = s.split('-');
        const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
        const c = parts[1].replace('C', '');
        return `${r}-${c}`;
      })
      .join(', ');

  const minutesRemaining = reservation && reservation.status === 'active'
    ? Math.max(0, Math.ceil((reservation.expiresAt - Date.now()) / 60000))
    : 0;

  // Only surface the "hold gone" banner on the seat-selection step, and only
  // for genuinely terminal (non-success) statuses. 'confirmed' means payment
  // completed — the success path renders below, not an error banner.
  const isTerminalBad = reservation && (reservation.status === 'expired' || reservation.status === 'cancelled' || reservation.status === 'released');
  const reservationBannerExpired = isTerminalBad && bookingStep === seatSelectionStep;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="pb-24 pt-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      {/* Header with step progress */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2.5 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-white">
              Secure Checkout
            </h1>
            <p className="text-xs text-gray-400">One step at a time — review before you pay</p>
          </div>
        </div>

        {/* Step indicator pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {stepsMeta.map((s) => {
            const active = bookingStep === s.n;
            const done = bookingStep > s.n;
            return (
              <span
                key={s.n}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black border-[#D4AF37]'
                    : done
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-[#141414] text-gray-500 border-white/10'
                }`}
              >
                {done ? <CheckCircle2 className="inline w-3 h-3 mr-1" /> : `${s.n}. `}{s.label}
              </span>
            );
          })}
        </div>

        {reservation && minutesRemaining > 0 && bookingStep <= reviewStep && (
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <Clock className="w-4 h-4 text-[#D4AF37]" />
            <span className="font-bold text-[#D4AF37]">{minutesRemaining} min</span>
            <span className="text-gray-400">holds remaining</span>
          </div>
        )}
      </div>

      {reservationBannerExpired && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Your seat hold has expired or been released.</p>
            <p className="text-xs text-red-300/80 mt-1">Please go back and re-select your seats. Another buyer may have taken them.</p>
          </div>
        </div>
      )}

      {reservationError && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{reservationError}</span>
        </div>
      )}

      {!seatsConnected && hasSeatMap && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          <span>Seat map is reconnecting — updates from other buyers may be delayed.</span>
        </div>
      )}

      {/* ================= STEP 1: Tickets ================= */}
      {bookingStep === FIRST_STEP && (
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-6 animate-in fade-in">
          <h3 className="font-heading font-bold text-lg text-white">1. Confirm Your Tickets</h3>
          <div className="flex gap-4">
            <img src={event.posterUrl} alt={event.title} className="w-24 h-32 rounded-xl object-cover border border-white/10" />
            <div className="space-y-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">{tier.name}</span>
              <h4 className="font-heading font-bold text-base text-white">{event.title}</h4>
              <p className="text-xs text-gray-400">{event.date} • {event.venue}</p>
              <p className="text-sm font-bold text-[#D4AF37]">{quantity} × {formatINR(tier.price)} = {formatINR(originalTotalPrice)}</p>
            </div>
          </div>
          <button
            onClick={() => setBookingStep(seatSelectionStep)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            Continue to {hasSeatMap ? 'Seat Selection' : 'Attendee Details'} <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ================= STEP 2: Seats ================= */}
      {bookingStep === seatSelectionStep && hasSeatMap && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-heading font-bold text-lg text-white">2. Choose Your Seats</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="inline-block w-3 h-3 rounded bg-emerald-500" /> Available
                <span className="inline-block w-3 h-3 rounded bg-amber-500" /> Held (others)
                <span className="inline-block w-3 h-3 rounded bg-[#D4AF37]" /> Yours
                <span className="inline-block w-3 h-3 rounded bg-gray-600" /> Sold
              </div>
            </div>
            <p className="text-xs text-gray-400">
              The map updates live — if another buyer takes a seat, you will see it instantly. Select {quantity} seat(s) to hold them.
            </p>
            <SeatMap
              eventId={event.id}
              seatMapConfig={event.seatMap}
              requiredQuantity={quantity}
              selectedSeatIds={selectedSeats || []}
              onSeatsSelected={(seats) => selectTicketsForCheckout(event, tier, quantity, seats)}
              currentUserId={user?.id || 'anon_user'}
              ticketTiers={tier ? [tier] : event.ticketTiers}
              eventDate={event.date}
              eventTime={event.time}
              seatProjection={seatProjection}
              onReservationError={(msg) => setSubmitError(msg)}
              reservationStatus={reservation?.status}
              reservationOwnerId={reservation?.ownerId}
            />
            <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="text-gray-400">
                Required: <span className="text-white font-bold">{quantity}</span> seat(s) •
                Selected: <span className="text-white font-bold">{(selectedSeats || []).length}</span>
                {pendingSeatCount > 0 ? ` • ${pendingSeatCount} awaiting confirmation` : ''}
              </div>
              <div className="text-right text-[#D4AF37] font-bold">
                {(selectedSeats || []).length > 0 ? seatLabelFor(selectedSeats || []) : 'No seats selected yet'}
              </div>
            </div>
          </div>

          <button
            onClick={handleAdvanceSeats}
            disabled={!canAdvanceFromSeats() || pendingActionRef.current}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {pendingActionRef.current ? (
              <>Holding seats... <RefreshCw className="w-5 h-5 animate-spin" /></>
            ) : (
              <>Confirm Selection <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
          {submitError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 3: Attendee ================= */}
      {bookingStep === attendeeStep && (
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4 animate-in fade-in">
          <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-black text-xs font-bold flex items-center justify-center">{attendeeStep}</span>
            Attendee Contact Information
          </h3>
          {reservation && (
            <p className="text-xs text-gray-400">
              Your {reservation.seatIds.length} seat(s) are held for <span className="text-[#D4AF37] font-bold">{Math.max(0, Math.ceil((reservation.expiresAt - Date.now()) / 60000))} min</span>.{' '}
              {reservation.seatIds.length > 0 && `Seats: ${seatLabelFor(reservation.seatIds)}.`}
            </p>
          )}
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">Full Name (Appears on Gate Pass)</label>
              <input type="text" required value={attendeeName}
                onChange={(e) => { setAttendeeName(e.target.value); setAttendeeDirty(true); }}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Email Address (For QR Pass Delivery)</label>
                <input type="email" required value={attendeeEmail}
                  onChange={(e) => { setAttendeeEmail(e.target.value); setAttendeeDirty(true); }}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Mobile Number (10-Digit Indian)</label>
                <input type="tel" required value={attendeePhone} placeholder="+91 98200 12345"
                  onChange={(e) => { setAttendeePhone(e.target.value); setAttendeeDirty(true); }}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
          </div>
          <button
            onClick={handleAdvanceAttendee}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer"
          >
            Continue to Review <ArrowRight className="w-5 h-5" />
          </button>
          {submitError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 4: Review ================= */}
      {bookingStep === reviewStep && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 space-y-5">
            <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Review Your Selection Before Payment
            </h3>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1C1C1C] rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Event</p>
                  <p className="font-bold text-white">{event.title}</p>
                  <p className="text-xs text-gray-400">{event.date} • {event.time} • {event.venue}</p>
                </div>
                <div className="bg-[#1C1C1C] rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tier & Quantity</p>
                  <p className="font-bold text-white">{tier.name} — {quantity} ticket(s)</p>
                  <p className="text-xs text-gray-400">{formatINR(tier.price)} per ticket</p>
                </div>
                {hasSeatMap && reservation && (
                  <div className="bg-[#1C1C1C] rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Seats Held For You</p>
                    <p className="font-bold text-[#D4AF37]">{seatLabelFor(reservation.seatIds)}</p>
                    <p className="text-xs text-gray-400">Held until {new Date(reservation.expiresAt).toLocaleTimeString()} (auto-release)</p>
                  </div>
                )}
                <div className="bg-[#1C1C1C] rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Attendee</p>
                  <p className="font-bold text-white">{attendeeName || reservation?.attendee?.name || '—'}</p>
                  <p className="text-xs text-gray-400">{attendeeEmail || reservation?.attendee?.email || '—'}</p>
                  <p className="text-xs text-gray-400">{attendeePhone || reservation?.attendee?.phone || '—'}</p>
                </div>
              </div>

              {/* Totals (server-authoritative) */}
              <div className="border-t border-white/10 pt-4 space-y-2 text-xs text-gray-300">
                <div className="flex justify-between">
                  <span>{tier.name} × {quantity}</span>
                  <span className="font-semibold text-white">{formatINR(serverSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST & Service Charge</span>
                  <span className="font-semibold text-emerald-400">INCLUDED</span>
                </div>
                <div className="flex justify-between">
                  <span>Digital QR Pass Delivery</span>
                  <span className="font-semibold text-emerald-400">FREE</span>
                </div>
                {serverDiscount > 0 && quoteAppliedCoupon && (
                  <div className="flex justify-between text-emerald-400 font-bold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                    <span>Coupon Discount ({quoteAppliedCoupon.code})</span>
                    <span>-{formatINR(serverDiscount)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="font-heading font-bold text-base text-white">Total Amount</span>
                  <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">{formatINR(serverTotal)}</span>
                </div>
                <p className="text-[10px] text-gray-500">Final amount is verified by the payment server at checkout. Coupon {quoteAppliedCoupon ? 'applied on server' : 'not applied'}.</p>
              </div>

              {/* Coupon entry (still allowed from review) */}
              <div className="border-t border-white/10 pt-4 space-y-2">
                <label className="text-xs font-bold text-gray-300 block">Have a Coupon or Promo Code?</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <div>
                        <p className="font-bold uppercase">{appliedCoupon.code} Applied</p>
                        <p className="text-[10px] text-emerald-300/80">
                          {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}% Discount` : `₹${appliedCoupon.value} Flat Discount`}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={handleRemoveCoupon} className="text-xs underline text-emerald-300 hover:text-white cursor-pointer ml-2">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g. WELCOME20" value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-[#D4AF37]" />
                    <button type="button" onClick={handleApplyCoupon} disabled={isValidatingCoupon || !couponCodeInput.trim()}
                      className="px-4 py-2 bg-white/10 hover:bg-[#D4AF37] hover:text-black text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer">
                      {isValidatingCoupon ? 'Validating...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{couponError}</span>
                  </p>
                )}
              </div>

              {/* Explicit confirmation gate */}
              <label className="flex items-start gap-3 p-4 rounded-2xl bg-[#1C1C1C] border border-white/10 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#D4AF37]"
                />
                <span className="text-xs text-gray-300 leading-relaxed">
                  <span className="font-bold text-white">I confirm my selection.</span> I understand the total amount is{' '}
                  <span className="font-bold text-[#D4AF37]">{formatINR(serverTotal)}</span>, that my seats are held{' '}
                  <span className="font-bold">{minutesRemaining > 0 ? `${minutesRemaining} min` : 'until'}</span> and will be released if I do not pay, and that this cannot be refunded by the box office after confirmation except as per the event policy.
                </span>
              </label>
            </div>
          </div>

          <button
            onClick={() => setBookingStep(paymentStep)}
            disabled={!reviewConfirmed}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Lock className="w-5 h-5" /> Continue to Payment <ArrowRight className="w-5 h-5" />
          </button>
          {!reviewConfirmed && (
            <p className="text-center text-[11px] text-gray-500">Check the confirmation box above to enable payment.</p>
          )}
        </div>
      )}

      {/* ================= STEP 5: Payment ================= */}
      {bookingStep === paymentStep && (
        <div className="space-y-6 animate-in fade-in">
          {/* Sticky mini summary */}
          <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Paying for</p>
                <p className="font-bold text-white text-sm">{event.title} • {tier.name} • {quantity} ticket(s)</p>
                {hasSeatMap && reservation && <p className="text-xs text-[#D4AF37] font-bold mt-0.5">Seats: {seatLabelFor(reservation.seatIds)}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{attendeeName} • {attendeeEmail} • {attendeePhone}</p>
              </div>
              <div className="text-right">
                <p className="font-heading font-extrabold text-2xl text-[#D4AF37]">{formatINR(serverTotal)}</p>
                {serverDiscount > 0 && <p className="text-[10px] text-emerald-400">-{formatINR(serverDiscount)} coupon applied</p>}
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Seats auto-release in {minutesRemaining > 0 ? `${minutesRemaining} min` : 'under a minute'} if payment is not completed.
            </p>
          </div>

          <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-white">Select Payment Gateway</h3>
            <div className="p-4 rounded-2xl border border-[#D4AF37] bg-[#1C1C1C] flex flex-col gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" /> Razorpay
              </span>
              <p className="text-[11px] text-gray-400">Razorpay — UPI, Cards, Netbanking &amp; Wallets</p>
            </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={isBusy || !reviewConfirmed || reservation?.status !== 'active'}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 shadow-xl shadow-[#D4AF37]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isBusy ? (
              <span className="animate-pulse flex items-center gap-2"><Lock className="w-5 h-5 animate-spin" /> Processing Payment...</span>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                <span>Pay Now — {formatINR(serverTotal)}</span>
              </>
            )}
          </button>
          {submitError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400 text-center">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Secured Payments • 100% Guaranteed Pass</span>
          </div>
        </div>
      )}

      {/* Razorpay Gateway Test Mode Notice */}
      {razorpayError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{razorpayError}</span>
        </div>
      )}
    </div>
  );
};
