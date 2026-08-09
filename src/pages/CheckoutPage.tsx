import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Lock, AlertCircle, CreditCard, CheckCircle2 } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { CountdownTimer } from '../components/CountdownTimer';
import { formatINR } from '../utils/formatters';
import { ref, get } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { SeatMap } from '../components/SeatMap';
import { useCashfree } from '../hooks/useCashfree';
import { useRazorpay } from '../hooks/useRazorpay';
import { safeFetch } from '../lib/api';

interface CheckoutPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onBack, onSuccess }) => {
  const { currentCheckout, confirmPurchase, confirmServerPurchasedTicket, selectTicketsForCheckout, releaseHeldSeats, validateCouponServer } = useBooking();
  const { user } = useAuth();
  const {
    payWithCashfree,
    isLoading: isCashfreeLoading,
    error: cashfreeError,
    pendingOrder,
    confirmPendingOrder,
    cancelPendingOrder,
  } = useCashfree();

  const {
    processRazorpayPayment,
    isLoading: isRazorpayLoading,
  } = useRazorpay();

  const [paymentGateway, setPaymentGateway] = useState<'razorpay' | 'cashfree'>('razorpay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Form state
  const [attendeeName, setAttendeeName] = useState(user?.name || 'Alex Rivera');
  const [attendeeEmail, setAttendeeEmail] = useState(user?.email || 'alex.rivera@example.com');
  const [attendeePhone, setAttendeePhone] = useState(user?.phone || '+91 98200 12345');

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
  const originalTotalPrice = tier.price * quantity;
  const finalTotalPrice = Math.max(0, originalTotalPrice - discountAmount);

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim()) return;
    setCouponError(null);
    setIsValidatingCoupon(true);

    const result = await validateCouponServer(couponCodeInput.trim(), event.id, originalTotalPrice);
    setIsValidatingCoupon(false);

    if (result.valid) {
      setAppliedCoupon(result.coupon);
      setDiscountAmount(result.discountAmount);
    } else {
      setAppliedCoupon(null);
      setDiscountAmount(0);
      setCouponError(result.error || 'Invalid or expired coupon code.');
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setCouponCodeInput('');
    setCouponError(null);
  };


  const handlePaymentFailure = async (errMsg?: string) => {
    setIsProcessing(false);
    setSubmitError(errMsg || 'Payment was cancelled or failed. Held seats have been released.');
    if (selectedSeats && selectedSeats.length > 0) {
      await releaseHeldSeats(event.id, selectedSeats);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Verify seats if seatmap is enabled
    if (event.seatMap) {
      const selectedCount = (selectedSeats || []).length;
      if (selectedCount < quantity) {
        const diff = quantity - selectedCount;
        setSubmitError(`Please select ${diff} more seat${diff > 1 ? 's' : ''} to continue.`);
        return;
      }

      setIsProcessing(true);
      try {
        const seatsRef = ref(rtdb, `seats/${event.id}`);
        const snapshot = await get(seatsRef);
        const userId = user?.id || 'anon_user';
        const dbSeatsData = snapshot.exists() ? snapshot.val() : {};

        const lostSeats: string[] = [];
        for (const seatId of selectedSeats || []) {
          const seatNode = dbSeatsData[seatId];
          const now = Date.now();
          const HOLD_EXPIRY_MS = 10 * 60 * 1000;

          const isHeldByMe =
            seatNode &&
            seatNode.status === 'held' &&
            seatNode.heldBy === userId &&
            seatNode.heldAt &&
            now - seatNode.heldAt <= HOLD_EXPIRY_MS;

          if (!isHeldByMe) {
            lostSeats.push(seatId);
          }
        }

        if (lostSeats.length > 0) {
          const keptSeats = (selectedSeats || []).filter((s) => !lostSeats.includes(s));
          selectTicketsForCheckout(event, tier, quantity, keptSeats);

          const lostLabels = lostSeats
            .map((s) => {
              const parts = s.split('-');
              const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
              const c = parts[1].replace('C', '');
              return `${r}-${c}`;
            })
            .join(', ');

          setSubmitError(`Seat(s) ${lostLabels} were claimed by someone else or expired. Please select replacement seats.`);
          setIsProcessing(false);
          return;
        }
      } catch (err) {
        console.error('Error verifying seat claims:', err);
      }
    } else {
      setIsProcessing(true);
    }

    if (paymentGateway === 'razorpay') {
      // Process with Razorpay
      await processRazorpayPayment({
        amount: finalTotalPrice,
        eventId: event.id,
        tierId: tier.id,
        seatIds: selectedSeats,
        quantity,
        couponCode: appliedCoupon?.code,
        userId: user?.id || 'anon_user',
        customerDetails: {
          name: attendeeName,
          email: attendeeEmail,
          phone: attendeePhone,
        },
        onSuccess: async (result) => {
          try {
            let confirmedTicket;
            if (result.ticket && result.booking) {
              confirmedTicket = confirmServerPurchasedTicket(result.ticket, result.booking);
            } else {
              confirmedTicket = await confirmPurchase(
                { name: attendeeName, email: attendeeEmail, phone: attendeePhone },
                `razorpay_${result.paymentId}`,
                user?.id
              );
            }

            // Send confirmation e-ticket email notification
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

            setIsProcessing(false);
            onSuccess();
          } catch (confirmErr) {
            console.error('Error confirming purchase after payment:', confirmErr);
            setSubmitError('Payment signature verified, but ticket creation failed. Contact support.');
            setIsProcessing(false);
          }
        },
        onFailure: (errMsg) => {
          handlePaymentFailure(errMsg);
        },
        onCancel: () => {
          handlePaymentFailure('Payment cancelled by user. Held seats released.');
        },
      });
    } else {
      // Process with Cashfree
      try {
        await payWithCashfree({
          amount: finalTotalPrice,
          orderId: `cf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          customerDetails: {
            name: attendeeName,
            email: attendeeEmail,
            phone: attendeePhone,
          },
          eventId: event.id,
          tierId: tier.id,
          seatIds: selectedSeats || [],
          quantity,
          userId: user?.id || 'anon_user',
          couponCode: appliedCoupon?.code || undefined,
          onSuccess: async (result) => {
            try {
              setIsProcessing(true);
              const verifyRes = await safeFetch(`/api/cashfree/verify-order/${result.orderId}`);

              let confirmedTicket;
              if (verifyRes.ok && verifyRes.data?.success && verifyRes.data?.ticket && verifyRes.data?.booking) {
                confirmedTicket = confirmServerPurchasedTicket(verifyRes.data.ticket, verifyRes.data.booking);
              } else {
                confirmedTicket = await confirmPurchase(
                  { name: attendeeName, email: attendeeEmail, phone: attendeePhone },
                  'cashfree',
                  user?.id
                );
              }

              // Send confirmation email
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

              setIsProcessing(false);
              onSuccess();
            } catch (confirmErr) {
              console.error('Error confirming purchase after payment:', confirmErr);
              setSubmitError('Payment succeeded, but ticket registration failed. Please contact support.');
              setIsProcessing(false);
            }
          },
          onFailure: (errMsg) => {
            handlePaymentFailure(errMsg);
          },
        });
      } catch (err: any) {
        console.error('Cashfree process error:', err);
        handlePaymentFailure(err?.message || 'Payment execution failed.');
      }
    }
  };

  const isBusy = isProcessing || isCashfreeLoading || isRazorpayLoading;

  return (
    <div className="pb-24 pt-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading font-bold text-2xl sm:text-3xl text-white">
              Secure Checkout
            </h1>
            <p className="text-xs text-gray-400">Cashfree PG Encrypted Payment Gateway & Instant QR Pass Delivery</p>
          </div>
        </div>

        {/* Seat holding countdown timer */}
        <CountdownTimer initialMinutes={10} />
      </div>

      {/* Main Two Column Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Attendee Form & Cashfree Payment Banner */}
        <div className="lg:col-span-7 space-y-8">
          {/* Section 1: Attendee Information */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-black text-xs font-bold flex items-center justify-center">1</span>
              <span>Attendee Contact Information</span>
            </h3>

            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">
                  Full Name (Appears on Gate Pass)
                </label>
                <input
                  type="text"
                  required
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    Email Address (For QR Pass Delivery)
                  </label>
                  <input
                    type="email"
                    required
                    value={attendeeEmail}
                    onChange={(e) => setAttendeeEmail(e.target.value)}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">
                    Mobile Number (10-Digit Indian)
                  </label>
                  <input
                    type="tel"
                    required
                    value={attendeePhone}
                    placeholder="+91 98200 12345"
                    onChange={(e) => setAttendeePhone(e.target.value)}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Choose Your Seats */}
          {event.seatMap && (
            <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-black text-xs font-bold flex items-center justify-center">2</span>
                <span>Choose Your Seats</span>
              </h3>

              <div className="pt-2">
                <SeatMap
                  eventId={event.id}
                  seatMapConfig={event.seatMap}
                  requiredQuantity={quantity}
                  selectedSeatIds={selectedSeats || []}
                  onSeatsSelected={(seats) => selectTicketsForCheckout(event, tier, quantity, seats)}
                  currentUserId={user?.id || 'anon_user'}
                  ticketTiers={event.ticketTiers}
                  eventDate={event.date}
                  eventTime={event.time}
                />
              </div>

              {/* Running line of selected seats */}
              <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                <div className="text-gray-400">
                  Required quantity: <span className="text-white font-bold">{quantity}</span> seat(s)
                </div>
                <div className="text-right">
                  <span className="text-[#D4AF37] font-bold">
                    {selectedSeats && selectedSeats.length > 0 ? (
                      <>
                        Selected seats:{' '}
                        {selectedSeats
                          .map((s) => {
                            const parts = s.split('-');
                            const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
                            const c = parts[1].replace('C', '');
                            return `${r}-${c}`;
                          })
                          .join(', ')}
                      </>
                    ) : (
                      'No seats selected yet'
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Payment Gateway Selector (Razorpay or Cashfree) */}
          <div className="bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-black text-xs font-bold flex items-center justify-center">
                  {event.seatMap ? 3 : 2}
                </span>
                <span>Select Online Payment Gateway</span>
              </h3>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Server HMAC-SHA256 Verified
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaymentGateway('razorpay')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                  paymentGateway === 'razorpay'
                    ? 'bg-[#1C1C1C] border-[#D4AF37] ring-1 ring-[#D4AF37]'
                    : 'bg-[#181818] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#D4AF37]" /> Razorpay PG
                  </span>
                  {paymentGateway === 'razorpay' && (
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  )}
                </div>
                <p className="text-[11px] text-gray-400">Razorpay Checkout, UPI, Cards, NetBanking</p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentGateway('cashfree')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                  paymentGateway === 'cashfree'
                    ? 'bg-[#1C1C1C] border-[#D4AF37] ring-1 ring-[#D4AF37]'
                    : 'bg-[#181818] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" /> Cashfree PG
                  </span>
                  {paymentGateway === 'cashfree' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <p className="text-[11px] text-gray-400">Cashfree PG, Instant UPI & Wallets</p>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary Box */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl">
            <h3 className="font-heading font-bold text-lg text-white border-b border-white/10 pb-4">
              Order Summary
            </h3>

            <div className="flex gap-4">
              <img
                src={event.posterUrl}
                alt={event.title}
                className="w-20 h-24 rounded-xl object-cover border border-white/10"
              />
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                  {tier.name}
                </span>
                <h4 className="font-heading font-bold text-base text-white mt-1 line-clamp-2">
                  {event.title}
                </h4>
                <p className="text-xs text-gray-400 mt-1">{event.date} • {event.venue}</p>

                {selectedSeats && selectedSeats.length > 0 && (
                  <p className="text-xs text-[#D4AF37] font-bold mt-1">
                    Seats:{' '}
                    {selectedSeats
                      .map((s) => {
                        const parts = s.split('-');
                        const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
                        const c = parts[1].replace('C', '');
                        return `${r}-${c}`;
                      })
                      .join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Coupon Promo Code Entry */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <label className="text-xs font-bold text-gray-300 block">Have a Coupon or Promo Code?</label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <div>
                      <p className="font-bold uppercase">{appliedCoupon.code} Applied</p>
                      <p className="text-[10px] text-emerald-300/80">
                        {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}% Discount` : `₹${appliedCoupon.value} Flat Discount`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs underline text-emerald-300 hover:text-white cursor-pointer ml-2"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. WELCOME20"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCodeInput.trim()}
                    className="px-4 py-2 bg-white/10 hover:bg-[#D4AF37] hover:text-black text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isValidatingCoupon ? 'Validating...' : 'Apply'}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{couponError}</span>
                </p>
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>{tier.name} × {quantity}</span>
                <span className="font-semibold text-white">{formatINR(originalTotalPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST & Service Charge</span>
                <span className="font-semibold text-emerald-400">INCLUDED</span>
              </div>
              <div className="flex justify-between">
                <span>Digital QR Pass Delivery</span>
                <span className="font-semibold text-emerald-400">FREE</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-bold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  <span>Coupon Discount ({appliedCoupon?.code})</span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <span className="font-heading font-bold text-base text-white">Total Amount</span>
                <div className="text-right">
                  {discountAmount > 0 && (
                    <span className="text-xs text-gray-400 line-through mr-2 block">
                      {formatINR(originalTotalPrice)}
                    </span>
                  )}
                  <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                    {formatINR(finalTotalPrice)}
                  </span>
                </div>
              </div>
            </div>

            {(submitError || cashfreeError) && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError || cashfreeError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 active:scale-[0.99] text-black font-extrabold text-base flex items-center justify-center gap-2 shadow-xl shadow-[#D4AF37]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isBusy ? (
                <span className="animate-pulse flex items-center gap-2">
                  <Lock className="w-5 h-5 animate-spin" />
                  Processing Cashfree Payment...
                </span>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Pay Now — {formatINR(finalTotalPrice)}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400 text-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Secured by Cashfree Payments • 100% Guaranteed Pass</span>
            </div>
          </div>
        </div>
      </form>

      {/* Cashfree Gateway Sandbox Verification Modal */}
      {pendingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/40 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981] to-[#059669] flex items-center justify-center text-white font-black text-sm shadow-md">
                  CF
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cashfree PG Gateway</h3>
                  <p className="text-xs text-emerald-400 font-mono">Sandbox Verification Mode</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg">
                Active Session
              </span>
            </div>

            <div className="space-y-3 bg-[#121212] p-4 rounded-2xl border border-white/5 text-xs text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-400">Cashfree Order ID:</span>
                <span className="font-mono text-white font-semibold truncate max-w-[180px]">{pendingOrder.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Customer:</span>
                <span className="text-white font-semibold">{pendingOrder.customerDetails.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Phone:</span>
                <span className="text-white font-semibold">{pendingOrder.customerDetails.phone}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/10">
                <span className="text-gray-400 font-bold">Total Amount:</span>
                <span className="text-[#D4AF37] font-extrabold text-sm">{formatINR(pendingOrder.amount)}</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed text-center">
              Your Cashfree session ID <code className="text-[#D4AF37] font-mono">{pendingOrder.paymentSessionId.slice(0, 16)}...</code> was generated. Click below to confirm test payment and receive your instant digital pass.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  confirmPendingOrder();
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>Simulate Cashfree Success</span>
              </button>

              <button
                type="button"
                onClick={cancelPendingOrder}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
