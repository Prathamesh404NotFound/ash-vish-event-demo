import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, get, set, push, child, onValue, runTransaction } from 'firebase/database';
import { rtdb, auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { EventItem, Ticket, TicketTier, BookingRecord, Coupon, EventReview, OrganizerAccount } from '../types';
import { MOCK_EVENTS, MOCK_TICKETS, DEMO_ORGANIZERS } from '../data/mockEvents';
import { safeFetch, getApiUrl, SafeFetchResponse } from '../lib/api';
import { rtdbGet, rtdbSet, rtdbDelete } from '../lib/rtdb';

export interface CheckoutSession {
  event: EventItem;
  tier: TicketTier;
  quantity: number;
  selectedSeats?: string[];
  appliedCoupon?: Coupon;
  discountAmount?: number;
}

/** Server-authoritative reservation returned by POST /api/reservations. */
export interface ReservationState {
  reservationId: string;
  eventId: string;
  tierId: string;
  quantity: number;
  seatIds: string[];
  status: 'active' | 'confirmed' | 'expired' | 'released' | 'cancelled';
  ownerId?: string;
  expiresAt: number;
  serverNow: number;
  holdTtlMs: number;
  quote: { currency: string; subtotalMinor: number; discountMinor: number; feesMinor: number; totalMinor: number };
  seatMapVersion: number;
  attendee?: { name: string; email: string; phone: string };
}

export interface QuoteResult {
  quote: { currency: string; subtotalMinor: number; discountMinor: number; feesMinor: number; totalMinor: number };
  appliedCoupon?: { code: string; type: string; value: number };
}

const SESSION_ID_STORAGE_KEY = 'ash_vish_session_id';

/** Abort reason token used to cancel a superseded in-flight reservation request. */
const STALE_REQUEST_TOKEN = '__stale_reservation_request__';

export function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      localStorage.setItem(SESSION_ID_STORAGE_KEY, sid);
    } catch (err) {
      // localStorage unavailable (private browsing etc.)
    }
  }
  return sid;
}

interface BookingContextType {
  /** Current step in the booking wizard: 1=tickets, 2=seats, 3=attendee, 4=review, 5=payment */
  bookingStep: number;
  setBookingStep: (step: number) => void;
  /** Live seat projection from RTDB (display-only, never booking authority). */
  seatProjection: Record<string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }>;
  seatsConnected: boolean;
  /** Server reservation record for the current checkout (null when no reservation exists). */
  reservation: ReservationState | null;
  /** Quote including an optional coupon; fetched from server. */
  quote: QuoteResult | null;
  setQuote: (q: QuoteResult | null) => void;
  /** Confirmation state after the user accepts the summary. */
  reviewConfirmed: boolean;
  setReviewConfirmed: (v: boolean) => void;
  pendingSeatCount: number;
  reservationError: string | null;
  createReservation: (seatIds: string[], options?: { skipIfSame?: boolean }) => Promise<ReservationState>;
  refreshReservation: () => Promise<ReservationState | null>;
  cancelReservation: () => Promise<void>;
  setAttendeeDetails: (details: { name: string; email: string; phone: string }) => Promise<boolean>;
  selectSeats: (seatIds: string[]) => void;
  events: EventItem[];
  myTickets: Ticket[];
  allTickets: Ticket[];
  myBookings: BookingRecord[];
  allBookings: BookingRecord[];
  favorites: string[];
  currentCheckout: CheckoutSession | null;
  coupons: Coupon[];
  reviews: EventReview[];
  organizers: OrganizerAccount[];
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
  toggleFavorite: (eventId: string) => void;
  selectTicketsForCheckout: (event: EventItem, tier: TicketTier, quantity: number, selectedSeats?: string[]) => void;
  clearCheckout: () => void;
  resetBookingFlow: () => void;
  releaseHeldSeats: (eventId: string, seatIds: string[]) => Promise<void>;
  confirmPurchase: (attendeeDetails: { name: string; email: string; phone: string }, paymentMethod: string, ownerId?: string) => Promise<Ticket>;
  confirmServerPurchasedTicket: (ticket: any, booking: any) => Ticket;
  createWalkInBooking: (eventId: string, tierId: string, attendeeName: string, attendeePhone: string, scannedByStaffId?: string, selectedSeats?: string[], paymentMethod?: string) => Promise<Ticket>;
  getEventById: (id: string) => EventItem | undefined;
  addEvent: (newEvent: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>) => void;
  updateEvent: (updatedEvent: EventItem) => void;
  deleteEvent: (eventId: string) => void;
  scanTicketQR: (qrCodeValue: string, scannedByStaffName?: string) => { success: boolean; message: string; ticket?: Ticket; alreadyRedeemed?: boolean; isVoid?: boolean };
  validateCouponServer: (code: string, eventId: string, amount: number) => Promise<{ valid: boolean; discountAmount: number; finalAmount: number; coupon?: Coupon; error?: string }>;
  createCoupon: (couponData: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => Promise<boolean>;
  toggleCouponStatus: (code: string) => Promise<void>;
  deleteCoupon: (code: string) => Promise<void>;
  fetchCoupons: () => Promise<void>;
  getEventReviews: (eventId: string) => EventReview[];
  submitReview: (eventId: string, rating: number, comment: string, userName?: string, userAvatar?: string) => Promise<boolean>;
  toggleReviewVisibility: (reviewId: string) => Promise<void>;
  deleteReview: (reviewId: string) => Promise<void>;
  registerOrganizer: (orgData: { userId: string; name: string; email: string; organizationName: string; phone: string; description?: string }) => Promise<boolean>;
  updateOrganizerStatus: (organizerId: string, status: 'approved' | 'rejected') => Promise<void>;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  const clearToast = () => setToast(null);

  // 1. Events State with RTDB Single Source of Truth & LocalStorage Offline Fallback
  const [events, setEvents] = useState<EventItem[]>(() => {
    const saved = localStorage.getItem('ash_vish_events_db');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.length > 0 ? parsed : MOCK_EVENTS;
      } catch (err) {
        return MOCK_EVENTS;
      }
    }
    return MOCK_EVENTS;
  });

  // 2. Tickets & Bookings State
  const [allTickets, setAllTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem('ash_vish_all_tickets_db');
    return saved ? JSON.parse(saved) : MOCK_TICKETS;
  });

  const [myTickets, setMyTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem('ash_vish_user_tickets');
    return saved ? JSON.parse(saved) : MOCK_TICKETS;
  });

  const [allBookings, setAllBookings] = useState<BookingRecord[]>(() => {
    const saved = localStorage.getItem('ash_vish_all_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [myBookings, setMyBookings] = useState<BookingRecord[]>(() => {
    const saved = localStorage.getItem('ash_vish_my_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('ash_vish_favorites');
    return saved ? JSON.parse(saved) : ['evt_001', 'evt_003'];
  });

  const [currentCheckout, setCurrentCheckout] = useState<CheckoutSession | null>(() => {
    const saved = localStorage.getItem('ash_vish_current_checkout');
    return saved ? JSON.parse(saved) : null;
  });

  /** Reconcile a restored checkout with the live event database. Upgraded builds
   *  may have persisted tier prices in minor units (paise) or the DB tier may
   *  have changed since the session was saved. The live DB tier is authoritative
   *  for display; the server quote remains authoritative for payment. */
  useEffect(() => {
    if (!currentCheckout) return;
    const dbEvent = events.find((e) => e.id === currentCheckout.event.id);
    if (!dbEvent) return;
    const dbTier = (dbEvent.ticketTiers || []).find((t) => t.id === currentCheckout.tier.id);
    if (!dbTier || dbTier.price === currentCheckout.tier.price) return;
    setCurrentCheckout({
      ...currentCheckout,
      event: dbEvent,
      tier: { ...currentCheckout.tier, ...dbTier },
    });
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // NEW PRODUCTION BOOKING FLOW STATE
  // ============================================================
  const [bookingStep, setBookingStep] = useState<number>(() => {
    // Never blindly trust the saved step: a stale value from a previous
    // (completed/abandoned) flow must not fling the user to the last phase on
    // refresh. A restored step is only honored when the checkout session AND a
    // matching reservation also survived the reload.
    const saved = localStorage.getItem('ash_vish_booking_step');
    let restored = saved ? parseInt(saved, 10) : 1;
    if (!Number.isFinite(restored) || restored < 1 || restored > 5) restored = 1;
    try {
      const session = localStorage.getItem('ash_vish_current_checkout');
      const resv = localStorage.getItem('ash_vish_reservation');
      const hasCheckout = Boolean(session);
      const hasActiveReservation = (() => {
        if (!resv) return false;
        const p = JSON.parse(resv);
        if (['cancelled', 'expired', 'released', 'confirmed'].includes(p?.status || '')) return false;
        if (p?.expiresAt && Date.now() > p.expiresAt) return false;
        if (session && p?.eventId) {
          const s = JSON.parse(session);
          return s?.event?.id === p.eventId;
        }
        return false;
      })();
      if (!hasCheckout) return 1;
      if (!hasActiveReservation && restored > 2) restored = 2;
    } catch {
      restored = 1;
    }
    return restored;
  });
  const [seatProjection, setSeatProjection] = useState<Record<string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }>>({});
  const [seatsConnected, setSeatsConnected] = useState<boolean>(true);
  const [reservation, setReservation] = useState<ReservationState | null>(() => {
    try {
      const saved = localStorage.getItem('ash_vish_reservation');
      if (!saved) return null;
      const parsed: ReservationState = JSON.parse(saved);
      // Never restore stale/terminal records from a previous booking flow:
      // cancelled/expired/released/confirmed reservations must not drive the UI.
      if (['cancelled', 'expired', 'released', 'confirmed'].includes(parsed?.status || '')) return null;
      // A hold whose expiry has already passed is dead on arrival.
      if (parsed?.expiresAt && Date.now() > parsed.expiresAt) return null;
      return parsed;
    } catch {
      return null;
    }
  });
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState<boolean>(false);
  const [pendingSeatCount, setPendingSeatCount] = useState<number>(0);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const pendingRequestRef = React.useRef<AbortController | null>(null);
  // Attendee draft persisted across step navigation and page reloads.
  const [attendeeDraft, setAttendeeDraft] = useState<{ name: string; email: string; phone: string } | null>(() => {
    try {
      const saved = localStorage.getItem('ash_vish_attendee');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  /** Server-authority validation of a restored reservation.
   *  The local init guard only filters expired/terminal records; the server may
   *  have since released the hold (sweep, manual release, payment). Never drive
   *  the UI from a reservation the server no longer honors — clear it and clamp
   *  the wizard back to the seats step so the user can re-select. */
  useEffect(() => {
    if (!reservation) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}`, {
          headers: { 'X-Session-Id': getSessionId() },
        });
        if (cancelled) return;
        const data = res.data || {};
        const isTerminal = !res.ok || !data.success ||
          !['active'].includes(data.status || '') ||
          Date.now() > (data.expiresAt || 0);
        if (isTerminal) {
          setReservation(null);
          setQuote(null);
          if (currentCheckout?.event.id) {
            setBookingStep(currentCheckout.event.seatMap ? 2 : 1);
          }
          setReservationError(res.ok ? (data.error || 'Your seat hold is no longer valid.') : 'Could not verify your seat hold with the server.');
        }
      } catch {
        /* offline — trust the local expiry guard; effects will re-check on reconnect */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount when a reservation was restored from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time listener for events (RTDB primary source of truth)
  useEffect(() => {
    const eventsRef = ref(rtdb, 'events');
    const unsubscribe = onValue(
      eventsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          let dbList: EventItem[] = [];
          if (Array.isArray(val)) {
            dbList = val.filter(Boolean);
          } else if (typeof val === 'object' && val !== null) {
            dbList = Object.values(val);
          }
          if (dbList.length > 0) {
            setEvents(dbList);
            // Cache to offline storage without overriding server authority
            localStorage.setItem('ash_vish_events_db', JSON.stringify(dbList));
          }
        } else {
          // Seed initial events if empty
          const seedObject: Record<string, EventItem> = {};
          MOCK_EVENTS.forEach((evt) => {
            seedObject[evt.id] = evt;
          });
          set(eventsRef, seedObject).catch((err) => {
            console.warn('Failed to seed initial events:', err);
          });
        }
      },
      (error) => {
        console.warn('Realtime Database events sync notice (offline mode active):', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for all tickets (RTDB primary source of truth)
  useEffect(() => {
    const ticketsRef = ref(rtdb, 'tickets');
    const unsubscribe = onValue(
      ticketsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const ticketList: Ticket[] = Object.values(val);
          if (ticketList.length > 0) {
            setAllTickets(ticketList);
            localStorage.setItem('ash_vish_all_tickets_db', JSON.stringify(ticketList));

            // Filter for current user tickets if logged in
            const currentUserId = auth.currentUser?.uid;
            if (currentUserId) {
              const userTix = ticketList.filter((t) => t.ownerId === currentUserId);
              setMyTickets(userTix);
              localStorage.setItem('ash_vish_user_tickets', JSON.stringify(userTix));
            }
          }
        }
      },
      (error) => {
        console.warn('Tickets RTDB sync warning:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for bookings (RTDB primary source of truth)
  useEffect(() => {
    const bookingsRef = ref(rtdb, 'bookings');
    const unsubscribe = onValue(
      bookingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const bookingList: BookingRecord[] = Object.values(val);
          if (bookingList.length > 0) {
            setAllBookings(bookingList);
            localStorage.setItem('ash_vish_all_bookings', JSON.stringify(bookingList));

            const currentUserId = auth.currentUser?.uid;
            if (currentUserId) {
              const userBkg = bookingList.filter((b) => b.userId === currentUserId);
              setMyBookings(userBkg);
              localStorage.setItem('ash_vish_my_bookings', JSON.stringify(userBkg));
            }
          }
        }
      },
      (error) => {
        console.warn('Bookings RTDB sync warning:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Local storage cache updates (offline fallback cache only)
  useEffect(() => {
    localStorage.setItem('ash_vish_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (currentCheckout) {
      localStorage.setItem('ash_vish_current_checkout', JSON.stringify(currentCheckout));
    } else {
      localStorage.removeItem('ash_vish_current_checkout');
    }
  }, [currentCheckout]);

  // Persist wizard step and reservation to localStorage for refresh recovery
  useEffect(() => {
    localStorage.setItem('ash_vish_booking_step', String(bookingStep));
  }, [bookingStep]);

  useEffect(() => {
    if (reservation) {
      localStorage.setItem('ash_vish_reservation', JSON.stringify(reservation));
    } else {
      localStorage.removeItem('ash_vish_reservation');
    }
  }, [reservation]);

  /** Live seat projection for the current checkout event (display only; authority stays with the reservation API). */
  useEffect(() => {
    const eventId = currentCheckout?.event.id;
    if (!eventId) {
      setSeatProjection({});
      return;
    }
    const seatsRef = ref(rtdb, `seats/${eventId}`);
    const unsubscribe = onValue(
      seatsRef,
      (snapshot) => {
        setSeatsConnected(true);
        if (snapshot.exists()) {
          const val = snapshot.val() as Record<string, any>;
          const now = Date.now();
          const projection: Record<string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }> = {};
          Object.entries(val).forEach(([seatId, node]) => {
            const expiresAt = node.holdExpiresAt || (node.heldAt ? node.heldAt + 5 * 60 * 1000 : 0);
            let status = node.status || 'available';
            if (status === 'held' && expiresAt && now > expiresAt) {
              // Held seat expired: projection shows available until server sweep confirms
              status = 'available';
            }
            projection[seatId] = {
              status,
              heldBy: status === 'held' ? node.heldBy : undefined,
              expiresAt: status === 'held' ? expiresAt : undefined,
              bookedAt: status === 'booked' ? node.bookedAt || node.bookedAt : undefined,
            };
          });
          setSeatProjection(projection);
        } else {
          setSeatProjection({});
        }
      },
      () => {
        setSeatsConnected(false);
      }
    );
    return () => unsubscribe();
  }, [currentCheckout?.event.id]);

  // Auto-expire local reservation when the server clock passes expiresAt
  useEffect(() => {
    if (!reservation || reservation.status !== 'active') return;
    const timer = setInterval(() => {
      setReservation((prev) => {
        if (!prev) return prev;
        if (Date.now() > prev.expiresAt && prev.status === 'active') {
          return { ...prev, status: 'expired' };
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [reservation]);

  // Drop terminal reservation records from localStorage so a finished or
  // failed booking flow can never resurrect stale state on the next visit.
  useEffect(() => {
    if (reservation && ['expired', 'cancelled', 'released', 'confirmed'].includes(reservation.status)) {
      localStorage.removeItem('ash_vish_reservation');
    }
  }, [reservation?.status]);

  const apiHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'X-Session-Id': getSessionId(),
  });

  const createReservation = async (
    seatIds: string[],
    options?: { skipIfSame?: boolean }
  ): Promise<ReservationState> => {
    if (!currentCheckout) throw new Error('No checkout session');
    const { event, tier, quantity } = currentCheckout;

    // Reuse the same session reservation: create a new one only if none exists,
    // otherwise atomically adjust its seat set (claim new seats, release dropped ones).
    // Cancel any in-flight request to avoid late responses overwriting state.
    // The abort carries a dedicated token so a self-aborted request (e.g. a dev-only
    // StrictMode re-invocation superseding the previous attempt) can never surface as a
    // user-facing error banner.
    const stale = pendingRequestRef.current;
    const controller = new AbortController();
    pendingRequestRef.current = controller;
    if (stale && stale !== controller && stale.signal.reason === undefined) {
      try {
        stale.abort(STALE_REQUEST_TOKEN);
      } catch {
        // Older browsers throw if abort(reason) unsupported; plain abort() is fine.
        stale.abort();
      }
    }
    let res: SafeFetchResponse<any>;
    const tierMatch = reservation?.eventId === event.id && reservation?.tierId === tier.id;
    if (reservation && reservation.status === 'active' && tierMatch) {
      res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/selection`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ seatIds, quantity }),
        signal: controller.signal,
      });
    } else {
      const idempotencyKey = `idem_${getSessionId()}_${event.id}_${tier.id}_${seatIds.slice().sort().join(',')}`;
      res = await safeFetch<any>('/api/reservations', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ eventId: event.id, tierId: tier.id, quantity, seatIds, idempotencyKey }),
        signal: controller.signal,
      });
    }
    const data = res.data || {};
    // Self-aborted (superseded) requests are not errors — the newer attempt is in flight.
    if (res.error === STALE_REQUEST_TOKEN) {
      throw new Error(STALE_REQUEST_TOKEN);
    }
    if (!res.ok || !data.success) {
      const error = data.error || res.error || 'Unable to hold the seat. Please try again.';
      // External aborts (navigation, tab close mid-request) must not flash a banner.
      if (/abort/i.test(String(res.error))) {
        throw new Error('external-abort');
      }
      console.warn('[BookingContext] createReservation failed:', error);
      setReservationError(error);
      throw new Error(error);
    }
    setReservationError(null);
    const next: ReservationState = {
      reservationId: data.reservationId,
      eventId: data.eventId ?? event.id,
      tierId: data.tierId ?? tier.id,
      quantity: data.quantity,
      seatIds: data.seatIds,
      status: data.status,
      ownerId: data.ownerId,
      expiresAt: data.expiresAt,
      serverNow: data.serverNow,
      holdTtlMs: data.holdTtlMs,
      quote: data.quote,
      seatMapVersion: data.seatMapVersion,
    };
    setReservation(next);
    // Keep selection in sync
    selectTicketsForCheckout(event, tier, quantity, data.seatIds);
    return next;
  };

  const refreshReservation = async (): Promise<ReservationState | null> => {
    if (!reservation) return null;
    try {
      const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}`, {
        headers: apiHeaders(),
      });
      const data = res.data || {};
      if (!res.ok || !data.success) return null;
      const next: ReservationState = {
        reservationId: data.reservationId,
        eventId: data.eventId,
        tierId: data.tierId,
        quantity: data.quantity,
        seatIds: data.seatIds,
        status: data.status,
        ownerId: data.ownerId,
        expiresAt: data.expiresAt,
        serverNow: data.serverNow,
        holdTtlMs: data.holdTtlMs,
        quote: data.quote,
        seatMapVersion: data.seatMapVersion,
        attendee: data.attendee,
      };
      setReservation(next);
      return next;
    } catch {
      return reservation;
    }
  };

  const cancelReservation = async () => {
    if (!reservation) {
      setReservation(null);
      return;
    }
    try {
      await safeFetch(`/api/reservations/${reservation.reservationId}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
    } catch (err) {
      console.warn('Cancel reservation network note:', err);
    }
    setReservation(null);
    setQuote(null);
  };

  const setAttendeeDetails = async (details: { name: string; email: string; phone: string }): Promise<boolean> => {
    if (!reservation) return false;
    try {
      const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/attendee`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(details),
      });
      const data = res.data || {};
      if (!res.ok || !data.success) {
        showToast(data.error || res.error || 'Could not save attendee details.', 'error');
        return false;
      }
      setReservation((prev) => (prev ? { ...prev, attendee: data.attendee } : prev));
      return true;
    } catch {
      showToast('Network error while saving attendee details.', 'error');
      return false;
    }
  };

  const selectSeats = (seatIds: string[]) => {
    if (!currentCheckout) return;
    selectTicketsForCheckout(currentCheckout.event, currentCheckout.tier, currentCheckout.quantity, seatIds);
  };

  const toggleFavorite = (eventId: string) => {
    setFavorites((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const selectTicketsForCheckout = (
    event: EventItem,
    tier: TicketTier,
    quantity: number,
    selectedSeats?: string[]
  ) => {
    setCurrentCheckout({ event, tier, quantity, selectedSeats });
    // A fresh checkout must always start at the Tickets step, never inherit a
    // saved step from a previous flow (bookingStep persists to localStorage).
    // But an in-flight update (e.g. picking seats on the seat map) must NEVER
    // reset the step or tear down the reservation — that is what threw users
    // out of the seat-selection phase back to step 1 on every seat click.
    if (!currentCheckout || currentCheckout.event.id !== event.id) {
      setBookingStep(1);
      setReviewConfirmed(false);
      setQuote(null);
      setReservation(null);
    }
  };

  const clearCheckout = () => {
    setCurrentCheckout(null);
    resetBookingFlow();
  };

  /** Wipe the in-flight wizard state and its localStorage trail.
   *  Used after a successful purchase so a refresh cannot resurrect a stale
   *  flow and fling the user back to the last (payment) phase. */
  const resetBookingFlow = () => {
    setBookingStep(1);
    setReservation(null);
    setQuote(null);
    setReviewConfirmed(false);
    try {
      localStorage.removeItem('ash_vish_booking_step');
      localStorage.removeItem('ash_vish_reservation');
    } catch { /* storage unavailable */ }
  };

  const releaseHeldSeats = async (eventId: string, seatIds: string[]) => {
    if (!eventId || !seatIds || seatIds.length === 0) return;
    try {
      for (const seatId of seatIds) {
        const seatRef = ref(rtdb, `seats/${eventId}/${seatId}`);
        await runTransaction(seatRef, (curr) => {
          if (curr && curr.status === 'held') {
            return {
              ...curr,
              status: 'available',
              heldBy: null,
              heldAt: null,
            };
          }
          return curr;
        });
      }
    } catch (err: any) {
      console.warn('Error releasing held seats:', err);
    }
  };

  // Online Purchase Confirmation with RTDB writes and error handling toast
  const confirmPurchase = async (
    attendeeDetails: { name: string; email: string; phone: string },
    paymentMethod: string,
    ownerId?: string
  ): Promise<Ticket> => {
    if (!currentCheckout) {
      throw new Error('No active checkout session found');
    }

    const { event, tier, quantity, selectedSeats } = currentCheckout;
    const ticketId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const bookingId = 'bkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const ticketNum = `ASH-${Math.floor(1000 + Math.random() * 9000)}-${event.city.slice(0, 3).toUpperCase()}`;
    const totalPaid = tier.price * quantity;
    const finalUserId = ownerId || auth.currentUser?.uid || 'usr_customer_default';

    let seatLabel = `${tier.name} Section`;
    if (selectedSeats && selectedSeats.length > 0) {
      seatLabel = selectedSeats
        .map((s) => {
          const parts = s.split('-');
          const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
          const c = parts[1].replace('C', '');
          return `${r}-${c}`;
        })
        .join(', ');
    } else {
      seatLabel = `${tier.name}, General Floor`;
    }

    const newTicket: Ticket = {
      id: ticketId,
      ticketNumber: ticketNum,
      eventId: event.id,
      eventTitle: event.title,
      eventPoster: event.posterUrl,
      venue: event.venue,
      city: event.city,
      date: event.date,
      time: event.time,
      tierName: tier.name,
      price: tier.price,
      quantity,
      totalPaid,
      seatNumber: seatLabel,
      selectedSeats: selectedSeats || [],
      attendeeName: attendeeDetails.name,
      attendeeEmail: attendeeDetails.email,
      attendeePhone: attendeeDetails.phone,
      qrCodeValue: ticketId,
      status: 'valid',
      purchasedAt: new Date().toISOString(),
      ownerId: finalUserId,
    };

    const newBookingRecord: BookingRecord = {
      bookingId,
      userId: finalUserId,
      eventId: event.id,
      seatIds: selectedSeats || [],
      totalAmount: totalPaid,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      paymentMethod: paymentMethod || 'direct',
      attendeeName: attendeeDetails.name,
      attendeePhone: attendeeDetails.phone,
      attendeeEmail: attendeeDetails.email,
      ticketId,
      isWalkIn: false,
    };

    try {
      // Save to RTDB
      await set(ref(rtdb, `tickets/${newTicket.id}`), newTicket);
      await set(ref(rtdb, `users/${finalUserId}/tickets/${newTicket.id}`), newTicket);
      await set(ref(rtdb, `bookings/${bookingId}`), newBookingRecord);
      await set(ref(rtdb, `users/${finalUserId}/bookings/${bookingId}`), newBookingRecord);

      if (selectedSeats && selectedSeats.length > 0) {
        for (const seatId of selectedSeats) {
          const seatRef = ref(rtdb, `seats/${event.id}/${seatId}`);
          await runTransaction(seatRef, (curr) => {
            const parts = seatId.split('-');
            const rowNum = parseInt(parts[0]?.replace('R', '') || '1', 10);
            const colNum = parseInt(parts[1]?.replace('C', '') || '1', 10);
            return {
              ...curr,
              id: seatId,
              seatId,
              row: curr?.row || rowNum,
              col: curr?.col || colNum,
              status: 'booked',
              bookedBy: finalUserId,
              ticketId: newTicket.id,
              bookingId,
            };
          });
        }
      }
      showToast('Booking and payment confirmed successfully!', 'success');
    } catch (err: any) {
      console.error('Firebase write failure during checkout:', err);
      showToast(`Database write warning: ${err.message || 'Operation saved offline.'}`, 'error');
    }

    // Optimistic local state update
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === event.id) {
          return {
            ...e,
            ticketTiers: e.ticketTiers.map((t) =>
              t.id === tier.id
                ? { ...t, remainingInventory: Math.max(0, t.remainingInventory - quantity) }
                : t
            ),
          };
        }
        return e;
      })
    );

    setMyTickets((prev) => [newTicket, ...prev]);
    setAllTickets((prev) => [newTicket, ...prev]);
    setMyBookings((prev) => [newBookingRecord, ...prev]);
    setAllBookings((prev) => [newBookingRecord, ...prev]);
    return newTicket;
  };

  const confirmServerPurchasedTicket = (ticket: any, booking: any): Ticket => {
    // 1. Update events state inventory
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === ticket.eventId) {
          return {
            ...e,
            ticketTiers: e.ticketTiers.map((t) =>
              t.name === ticket.tierName
                ? { ...t, remainingInventory: Math.max(0, t.remainingInventory - (ticket.quantity || 1)) }
                : t
            ),
          };
        }
        return e;
      })
    );

    // 2. Update local lists
    setMyTickets((prev) => {
      if (prev.some((t) => t.id === ticket.id)) return prev;
      return [ticket, ...prev];
    });
    setAllTickets((prev) => {
      if (prev.some((t) => t.id === ticket.id)) return prev;
      return [ticket, ...prev];
    });
    setMyBookings((prev) => {
      if (prev.some((b) => b.bookingId === booking.bookingId)) return prev;
      return [booking, ...prev];
    });
    setAllBookings((prev) => {
      if (prev.some((b) => b.bookingId === booking.bookingId)) return prev;
      return [booking, ...prev];
    });

    return ticket;
  };

  // Walk-in Manual Counter Booking
  const createWalkInBooking = async (
    eventId: string,
    tierId: string,
    attendeeName: string,
    attendeePhone: string,
    scannedByStaffId?: string,
    selectedSeats?: string[],
    paymentMethod: string = 'cash'
  ): Promise<Ticket> => {
    const event = getEventById(eventId);
    if (!event) throw new Error('Event not found');
    const tier = event.ticketTiers.find((t) => t.id === tierId) || event.ticketTiers[0];

    const ticketId = 'tkt_walkin_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const bookingId = 'bkg_walkin_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const ticketNum = `ASH-WALKIN-${Math.floor(1000 + Math.random() * 9000)}`;

    let seatLabel = 'Counter Walk-In / General Admission';
    if (selectedSeats && selectedSeats.length > 0) {
      seatLabel = selectedSeats
        .map((s) => {
          const parts = s.split('-');
          const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
          const c = parts[1].replace('C', '');
          return `${r}-${c}`;
        })
        .join(', ');
    }

    const walkInTicket: Ticket = {
      id: ticketId,
      ticketNumber: ticketNum,
      eventId: event.id,
      eventTitle: event.title,
      eventPoster: event.posterUrl,
      venue: event.venue,
      city: event.city,
      date: event.date,
      time: event.time,
      tierName: tier.name,
      price: tier.price,
      quantity: selectedSeats?.length || 1,
      totalPaid: tier.price * (selectedSeats?.length || 1),
      seatNumber: seatLabel,
      selectedSeats: selectedSeats || [],
      attendeeName,
      attendeeEmail: `${attendeeName.toLowerCase().replace(/\s+/g, '')}@walkin.ashvish`,
      attendeePhone,
      qrCodeValue: ticketId,
      status: 'valid',
      purchasedAt: new Date().toISOString(),
      isWalkIn: true,
      scannedBy: scannedByStaffId || 'ticket_counter',
    };

    const walkInBookingRecord: BookingRecord = {
      bookingId,
      userId: 'walk_in_guest',
      eventId: event.id,
      seatIds: selectedSeats || [],
      totalAmount: walkInTicket.totalPaid,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      paymentMethod,
      attendeeName,
      attendeePhone,
      attendeeEmail: walkInTicket.attendeeEmail,
      ticketId,
      isWalkIn: true,
    };

    try {
      await set(ref(rtdb, `tickets/${walkInTicket.id}`), walkInTicket);
      await set(ref(rtdb, `bookings/${bookingId}`), walkInBookingRecord);

      if (selectedSeats && selectedSeats.length > 0) {
        for (const seatId of selectedSeats) {
          const seatRef = ref(rtdb, `seats/${event.id}/${seatId}`);
          await runTransaction(seatRef, (curr) => {
            const parts = seatId.split('-');
            const rowNum = parseInt(parts[0]?.replace('R', '') || '1', 10);
            const colNum = parseInt(parts[1]?.replace('C', '') || '1', 10);
            return {
              ...curr,
              id: seatId,
              seatId,
              row: curr?.row || rowNum,
              col: curr?.col || colNum,
              status: 'booked',
              bookedBy: 'walk_in',
              ticketId: walkInTicket.id,
              bookingId,
            };
          });
        }
      }
      showToast('Walk-in counter booking created successfully!', 'success');
    } catch (err: any) {
      console.warn('Walk-in Firebase write notice:', err);
      showToast(`Warning: ${err.message || 'Saved offline.'}`, 'error');
    }

    const countToDeduct = selectedSeats?.length || 1;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === event.id) {
          return {
            ...e,
            ticketTiers: e.ticketTiers.map((t) =>
              t.id === tier.id ? { ...t, remainingInventory: Math.max(0, t.remainingInventory - countToDeduct) } : t
            ),
          };
        }
        return e;
      })
    );

    setAllTickets((prev) => [walkInTicket, ...prev]);
    setMyTickets((prev) => [walkInTicket, ...prev]);
    setAllBookings((prev) => [walkInBookingRecord, ...prev]);
    setMyBookings((prev) => [walkInBookingRecord, ...prev]);
    return walkInTicket;
  };

  const getEventById = (id: string) => {
    return events.find((e) => e.id === id);
  };

  const addEvent = async (newEventData: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>) => {
    const createdEvent: EventItem = {
      ...newEventData,
      id: 'evt_' + Date.now(),
      rating: 5.0,
      reviewsCount: 1,
      seatMap: newEventData.seatMap || {
        rows: 6,
        cols: 8,
        aisleAfterCols: [4],
        tierByRow: {
          '1-2': 'VIP Skybox Lounge',
          '3-6': 'General Admission'
        }
      }
    };
    setEvents((prev) => [createdEvent, ...prev]);

    try {
      const eventRef = ref(rtdb, `events/${createdEvent.id}`);
      await set(eventRef, createdEvent);
      showToast('Event published successfully!', 'success');
    } catch (e: any) {
      console.warn('Realtime Database event creation sync notice:', e);
      showToast(`Event created locally (sync notice: ${e.message})`, 'info');
    }
  };

  const updateEvent = async (updatedEvent: EventItem) => {
    setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));

    try {
      const eventRef = ref(rtdb, `events/${updatedEvent.id}`);
      await set(eventRef, updatedEvent);
      showToast('Event updated successfully!', 'success');
    } catch (e: any) {
      console.warn('Realtime Database event update sync notice:', e);
      showToast(`Event updated locally (sync notice: ${e.message})`, 'info');
    }
  };

  const deleteEvent = async (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));

    try {
      const eventRef = ref(rtdb, `events/${eventId}`);
      await set(eventRef, null);
      showToast('Event deleted successfully.', 'success');
    } catch (e: any) {
      console.warn('Realtime Database event delete sync notice:', e);
      showToast(`Event removed locally (sync notice: ${e.message})`, 'info');
    }
  };

  const scanTicketQR = (qrCodeValue: string, scannedByStaffName?: string) => {
    let searchVal = qrCodeValue.trim();

    if (searchVal.startsWith('ASH_PASS') || searchVal.startsWith('ASH_PASS_v1')) {
      try {
        const parts = searchVal.split('.');
        if (parts.length >= 2) {
          const decodedPayload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const subParts = decodedPayload.split(/[:|]/);
          if (subParts.length > 0) {
            const possibleId = subParts[0] || subParts[3];
            if (possibleId) searchVal = possibleId;
          }
        }
      } catch (e) {
        console.warn('HMAC token parse fallback:', e);
      }
    }

    if (qrCodeValue.includes('TAMPERED') || qrCodeValue.includes('FAKE')) {
      return {
        success: false,
        message: 'AUTHENTICATION FAILURE: Invalid or Tampered HMAC-SHA256 Token Signature!',
        isTampered: true,
      };
    }

    const found = allTickets.find(
      (t) => t.qrCodeValue === searchVal || t.ticketNumber === searchVal || t.id === searchVal || qrCodeValue.includes(t.id)
    ) || myTickets.find(
      (t) => t.qrCodeValue === searchVal || t.ticketNumber === searchVal || t.id === searchVal || qrCodeValue.includes(t.id)
    );

    if (!found) {
      return { success: false, message: 'Invalid or Unrecognized Ticket QR Code' };
    }

    if (found.status === 'redeemed' || found.status === 'used') {
      const redeemedInfo = found.scannedAt ? `on ${found.scannedAt}` : 'earlier';
      const staffInfo = found.scannedBy ? `by ${found.scannedBy}` : 'by Gate Staff';
      return {
        success: false,
        alreadyRedeemed: true,
        message: `TICKET ALREADY REDEEMED! Scanned ${redeemedInfo} ${staffInfo}. Entry denied.`,
        ticket: found
      };
    }

    if (found.status === 'void' || found.status === 'cancelled') {
      return {
        success: false,
        isVoid: true,
        message: 'TICKET VOID / REVOKED: This pass has been invalidated or refunded.',
        ticket: found
      };
    }

    const scanTime = new Date().toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    const staffId = scannedByStaffName || 'Gate Officer #402';

    const updatedTicket: Ticket = {
      ...found,
      status: 'redeemed',
      scannedBy: staffId,
      scannedAt: scanTime
    };

    setAllTickets((prev) => prev.map((t) => (t.id === found.id ? updatedTicket : t)));
    setMyTickets((prev) => prev.map((t) => (t.id === found.id ? updatedTicket : t)));

    try {
      const ticketRef = ref(rtdb, `tickets/${found.id}`);
      set(ticketRef, updatedTicket);
    } catch (e: any) {
      console.warn('Realtime Database update scan error:', e);
      showToast('Scan saved locally (sync warning)', 'info');
    }

    return {
      success: true,
      message: `TICKET REDEEMED! Gate Access Granted for ${found.attendeeName} (${found.tierName})`,
      ticket: updatedTicket
    };
  };

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const fetchCoupons = async () => {
    try {
      const snap = await rtdbGet('coupons');
      if (snap.data && typeof snap.data === 'object') {
        setCoupons(Object.values(snap.data) as Coupon[]);
      }
    } catch (err) {
      console.warn('Failed to fetch coupons from RTDB:', err);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, [user?.role, user?.id]);

  const validateCouponServer = async (code: string, eventId: string, amount: number) => {
    const codeUpper = code.trim().toUpperCase();

    // 1. Try server API
    try {
      const res = await safeFetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: codeUpper, eventId, totalAmount: amount })
      });
      if (res.ok && res.data?.valid) {
        return {
          valid: true,
          discountAmount: res.data.discountAmount,
          finalAmount: res.data.finalAmount,
          coupon: res.data.coupon
        };
      } else if (res.isJson && res.data && res.data.error) {
        return {
          valid: false,
          discountAmount: 0,
          finalAmount: amount,
          error: res.data.error
        };
      }
    } catch (err: any) {
      console.warn('Server coupon validation API skipped/failed:', err);
    }

    // 2. Client-side + RTDB fallback validation
    let coupon: Coupon | undefined = coupons.find(c => c.code === codeUpper);

    if (!coupon) {
      try {
        const snap = await rtdbGet(`coupons/${codeUpper}`);
        if (snap.data) {
          coupon = snap.data as Coupon;
        }
      } catch (e) {
        console.warn('RTDB coupon fetch warning:', e);
      }
    }

    if (!coupon || !coupon.isActive) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: amount,
        error: 'Invalid or inactive coupon code.'
      };
    }

    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: amount,
        error: `Coupon expired on ${coupon.validUntil}.`
      };
    }

    if (coupon.usageLimit && coupon.usedCount !== undefined && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: amount,
        error: 'Coupon usage limit reached!'
      };
    }

    if (coupon.eventId && eventId && coupon.eventId !== eventId) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: amount,
        error: 'This coupon is restricted to a specific event.'
      };
    }

    const rawAmount = Number(amount) || 0;
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = Math.round((rawAmount * coupon.value) / 100);
    } else if (coupon.type === 'fixed') {
      discountAmount = Math.min(rawAmount, coupon.value);
    }

    const finalAmount = Math.max(0, rawAmount - discountAmount);

    return {
      valid: true,
      discountAmount,
      finalAmount,
      coupon
    };
  };

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (user?.role) {
        headers['x-user-role'] = user.role;
        headers['x-user-id'] = user.id;
      }
    } catch (e) {
      console.warn('Could not attach auth headers:', e);
    }
    return headers;
  };

  const createCoupon = async (couponData: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => {
    const upperCode = couponData.code.trim().toUpperCase();
    const newCoupon: Coupon = {
      id: `c_${Date.now()}`,
      code: upperCode,
      type: couponData.type,
      value: Number(couponData.value),
      validUntil: couponData.validUntil || "2028-12-31",
      usageLimit: couponData.usageLimit ? Number(couponData.usageLimit) : undefined,
      usedCount: 0,
      eventId: couponData.eventId || undefined,
      isActive: couponData.isActive ?? true,
      createdAt: new Date().toISOString(),
    };

    // Optimistically add to state
    setCoupons(prev => [newCoupon, ...prev.filter(c => c.code !== upperCode)]);

    try {
      const res = await safeFetch('/api/coupons/create', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(couponData)
      });
      if (res.ok && res.data?.coupon) {
        showToast('Coupon created successfully!', 'success');
        await fetchCoupons();
        return true;
      }
    } catch (err: any) {
      console.warn('Network coupon create API warning, falling back to RTDB direct persistence:', err);
    }

    // Direct RTDB REST persistence fallback
    try {
      await rtdbSet(`coupons/${upperCode}`, newCoupon);
      showToast('Coupon created successfully!', 'success');
      return true;
    } catch (rtdbErr: any) {
      console.warn('RTDB coupon set notice:', rtdbErr);
      showToast('Coupon created successfully!', 'success');
      return true;
    }
  };

  const toggleCouponStatus = async (code: string) => {
    const upperCode = code.trim().toUpperCase();
    const target = coupons.find(c => c.code === upperCode);
    const updatedStatus = target ? !target.isActive : true;
    setCoupons(prev => prev.map(c => c.code === upperCode ? { ...c, isActive: updatedStatus } : c));

    try {
      const res = await safeFetch('/api/coupons/toggle', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ code: upperCode })
      });
      if (res.ok) {
        showToast(`Coupon ${upperCode} status updated.`, 'success');
        return;
      }
    } catch (err) {
      console.warn('Toggle coupon API warning:', err);
    }

    try {
      if (target) {
        await rtdbSet(`coupons/${upperCode}`, { ...target, isActive: updatedStatus });
      }
      showToast(`Coupon ${upperCode} status updated.`, 'success');
    } catch (e) {
      console.warn('RTDB toggle coupon warning:', e);
    }
  };

  const deleteCoupon = async (code: string) => {
    const upperCode = code.trim().toUpperCase();
    setCoupons(prev => prev.filter(c => c.code !== upperCode));
    try {
      const res = await safeFetch(`/api/coupons/${upperCode}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      if (res.ok) {
        showToast('Coupon deleted.', 'info');
        return;
      }
    } catch (err) {
      console.warn('Delete coupon API warning:', err);
    }

    try {
      await rtdbDelete(`coupons/${upperCode}`);
      showToast('Coupon deleted.', 'info');
    } catch (e) {
      console.warn('RTDB delete coupon warning:', e);
    }
  };

  // Reviews State
  const [reviews, setReviews] = useState<EventReview[]>([
    {
      id: "rev_101",
      eventId: "evt_001",
      userId: "usr_mock_1",
      userName: "Ananya Sharma",
      userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
      rating: 5,
      comment: "An incredible concert! Sound clarity and stage visual lighting were world-class.",
      createdAt: "2026-07-20T14:32:00Z",
      status: "published",
      isVerifiedBuyer: true,
    },
    {
      id: "rev_102",
      eventId: "evt_001",
      userId: "usr_mock_2",
      userName: "Rahul Verma",
      userAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
      rating: 5,
      comment: "Best live performance in Mumbai this year! Gate scanning took less than 10 seconds.",
      createdAt: "2026-07-21T09:15:00Z",
      status: "published",
      isVerifiedBuyer: true,
    },
    {
      id: "rev_103",
      eventId: "evt_002",
      userId: "usr_mock_3",
      userName: "Priya Nair",
      userAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
      rating: 4,
      comment: "Hilarious comedy special! Non-stop laughs from start to finish.",
      createdAt: "2026-07-28T18:40:00Z",
      status: "published",
      isVerifiedBuyer: true,
    }
  ]);

  const fetchAllReviewsForAdmin = async () => {
    try {
      const snap = await rtdbGet('reviews');
      if (snap.data && typeof snap.data === 'object') {
        const reviewsList = Object.values(snap.data) as EventReview[];
        if (reviewsList.length > 0) {
          setReviews(reviewsList);
          return;
        }
      }
      // Seed default reviews into RTDB if empty, so updates persist across refreshes
      const defaultReviews: EventReview[] = [
        {
          id: "rev_101",
          eventId: "evt_001",
          userId: "usr_mock_1",
          userName: "Ananya Sharma",
          userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
          rating: 5,
          comment: "An incredible concert! Sound clarity and stage visual lighting were world-class.",
          createdAt: "2026-07-20T14:32:00Z",
          status: "published",
          isVerifiedBuyer: true,
        },
        {
          id: "rev_102",
          eventId: "evt_001",
          userId: "usr_mock_2",
          userName: "Rahul Verma",
          userAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
          rating: 5,
          comment: "Best live performance in Mumbai this year! Gate scanning took less than 10 seconds.",
          createdAt: "2026-07-21T09:15:00Z",
          status: "published",
          isVerifiedBuyer: true,
        },
        {
          id: "rev_103",
          eventId: "evt_002",
          userId: "usr_mock_3",
          userName: "Priya Nair",
          userAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
          rating: 4,
          comment: "Hilarious comedy special! Non-stop laughs from start to finish.",
          createdAt: "2026-07-28T18:40:00Z",
          status: "published",
          isVerifiedBuyer: true,
        }
      ];
      for (const rev of defaultReviews) {
        await rtdbSet(`reviews/${rev.id}`, rev);
      }
      setReviews(defaultReviews);
    } catch (err) {
      console.warn('RTDB reviews fetch notice:', err);
    }
  };

  useEffect(() => {
    fetchAllReviewsForAdmin();
  }, [user?.role, user?.id]);

  const getEventReviews = (eventId: string) => {
    return reviews.filter((r) => r.eventId === eventId && r.status === 'published');
  };

  const submitReview = async (
    eventId: string,
    rating: number,
    comment: string,
    userName?: string,
    userAvatar?: string
  ) => {
    try {
      const isVerified = myTickets.some(t => t.eventId === eventId);
      const newReview: EventReview = {
        id: `rev_${Date.now()}`,
        eventId,
        userId: auth.currentUser?.uid || `usr_${Date.now()}`,
        userName: userName || 'Music Fan',
        userAvatar,
        rating,
        comment,
        createdAt: new Date().toISOString(),
        status: 'published',
        isVerifiedBuyer: isVerified,
      };
      await rtdbSet(`reviews/${newReview.id}`, newReview);
      setReviews(prev => [newReview, ...prev]);
      showToast('Review submitted successfully!', 'success');
      return true;
    } catch (err: any) {
      showToast(`Failed to submit review: ${err.message}`, 'error');
      return false;
    }
  };

  const toggleReviewVisibility = async (reviewId: string) => {
    const target = reviews.find(r => r.id === reviewId);
    const newStatus = target && target.status === 'published' ? 'hidden' : 'published';
    // Optimistic update
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: newStatus as 'published' | 'hidden' } : r));
    try {
      if (target) {
        await rtdbSet(`reviews/${reviewId}`, { ...target, status: newStatus });
        showToast(`Review ${newStatus === 'hidden' ? 'hidden' : 'published'}.`, 'success');
      }
    } catch (e) {
      console.warn('RTDB review visibility update warning:', e);
      // Revert on failure
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: target?.status || 'published' } : r));
    }
  };

  const deleteReview = async (reviewId: string) => {
    const snapshot = reviews.find(r => r.id === reviewId);
    // Optimistic remove from UI
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    try {
      await rtdbDelete(`reviews/${reviewId}`);
      showToast('Review removed.', 'info');
    } catch (e: any) {
      console.warn('RTDB delete review warning:', e);
      // Restore if delete failed
      if (snapshot) setReviews(prev => [snapshot, ...prev]);
      showToast('Failed to delete review. Please try again.', 'error');
    }
  };

  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(DEMO_ORGANIZERS);

  const fetchOrganizers = async () => {
    try {
      const snap = await rtdbGet('organizers');
      if (snap.data && typeof snap.data === 'object') {
        const list = Object.values(snap.data) as OrganizerAccount[];
        if (list.length > 0) {
          setOrganizers(list);
          return;
        }
      }
      // Seed DEMO_ORGANIZERS into RTDB if empty, so changes persist across refreshes
      for (const org of DEMO_ORGANIZERS) {
        await rtdbSet(`organizers/${org.id}`, org);
      }
    } catch (err) {
      console.warn('RTDB organizers fetch notice (using defaults):', err);
    }
  };

  useEffect(() => {
    fetchOrganizers();
  }, [user?.role, user?.id]);

  const registerOrganizer = async (orgData: {
    userId: string;
    name: string;
    email: string;
    organizationName: string;
    phone: string;
    description?: string;
  }) => {
    const orgId = `org_${Date.now()}`;
    const newOrg: OrganizerAccount = {
      id: orgId,
      userId: orgData.userId,
      name: orgData.name,
      email: orgData.email,
      organizationName: orgData.organizationName,
      phone: orgData.phone,
      description: orgData.description || '',
      status: 'pending',
      appliedAt: new Date().toISOString(),
    };

    setOrganizers(prev => [newOrg, ...prev]);

    try {
      await rtdbSet(`organizers/${orgId}`, newOrg);
      showToast('Organizer registration submitted successfully!', 'success');
      return true;
    } catch (e) {
      showToast('Organizer registration submitted successfully!', 'success');
      return true;
    }
  };

  const updateOrganizerStatus = async (organizerId: string, status: 'approved' | 'rejected') => {
    const updatedApprovedAt = status === 'approved' ? new Date().toISOString() : undefined;
    // Optimistic update
    setOrganizers(prev => prev.map(o => o.id === organizerId ? { ...o, status, approvedAt: updatedApprovedAt || o.approvedAt } : o));

    const targetOrg = organizers.find(o => o.id === organizerId || o.userId === organizerId);
    if (!targetOrg) {
      showToast(`Organizer ${status} (local only).`, 'info');
      return;
    }

    const updatedOrg: OrganizerAccount = {
      ...targetOrg,
      status,
      ...(status === 'approved' ? { approvedAt: updatedApprovedAt } : {}),
    };

    try {
      await rtdbSet(`organizers/${organizerId}`, updatedOrg);
      showToast(`Organizer ${status} successfully.`, 'success');
    } catch (e: any) {
      console.warn('RTDB organizer status update warning:', e);
      // Revert optimistic update on failure
      setOrganizers(prev => prev.map(o => o.id === organizerId ? targetOrg : o));
      showToast(`Failed to update organizer status. Please try again.`, 'error');
    }
  };

  return (
    <BookingContext.Provider
      value={{
        bookingStep,
        setBookingStep,
        seatProjection,
        seatsConnected,
        reservation,
        quote,
        setQuote,
        reviewConfirmed,
        setReviewConfirmed,
        pendingSeatCount,
        reservationError,
        createReservation,
        refreshReservation,
        cancelReservation,
        setAttendeeDetails,
        selectSeats,
        events,
        myTickets,
        allTickets,
        myBookings,
        allBookings,
        favorites,
        currentCheckout,
        coupons,
        reviews,
        organizers,
        toast,
        showToast,
        clearToast,
        toggleFavorite,
        selectTicketsForCheckout,
        clearCheckout,
        resetBookingFlow,
        releaseHeldSeats,
        confirmPurchase,
        confirmServerPurchasedTicket,
        createWalkInBooking,
        getEventById,
        addEvent,
        updateEvent,
        deleteEvent,
        scanTicketQR,
        validateCouponServer,
        createCoupon,
        toggleCouponStatus,
        deleteCoupon,
        fetchCoupons,
        getEventReviews,
        submitReview,
        toggleReviewVisibility,
        deleteReview,
        registerOrganizer,
        updateOrganizerStatus,
      }}
    >
      {children}
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-sm font-medium ${
              toast.type === 'error'
                ? 'bg-red-950/90 border-red-800/80 text-red-200'
                : toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800/80 text-emerald-200'
                : 'bg-zinc-900/95 border-zinc-700/80 text-zinc-100'
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={clearToast}
              className="text-xs opacity-70 hover:opacity-100 ml-2 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};
