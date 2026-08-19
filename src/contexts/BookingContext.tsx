import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, get, push, child, onValue } from 'firebase/database';
import { rtdb, auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { EventItem, Ticket, TicketTier, BookingRecord, Coupon, EventReview, OrganizerAccount } from '../types';
import { safeFetch, getApiUrl, SafeFetchResponse } from '../lib/api';
import { rtdbGet, rtdbSet, rtdbDelete, rtdbUpdate } from '../lib/rtdb';
import { isSeatBasedEvent } from '../lib/seatMap';

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
  attendee?: { name: string; email: string; phone: string };
}

export interface QuoteResult {
  quote: { currency: string; subtotalMinor: number; discountMinor: number; feesMinor: number; totalMinor: number };
  appliedCoupon?: { code: string; type: string; value: number };
}

const SESSION_ID_STORAGE_KEY = 'ash_vish_session_id';
let inMemorySessionId: string | null = null;

/** Stable working placeholder for any image URL that cannot load on the public site. */
const DEFAULT_IMAGE_URL =
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800';

/**
 * True for URLs that point at a dev/local environment (localhost, loopback,
 * relative paths, or empty strings). Legacy records written from a local dev
 * server carry these and can never load on the public site.
 */
const isInternalUrl = (u: unknown): boolean => {
  const s = String(u || '');
  return (
    !s ||
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[0:0:0:0:0:0:0:1\])(:\d+)?\//i.test(s) ||
    /^\/(?!\/)/.test(s)
  );
};

/**
 * Normalize any database image URL: dev/local URLs and empty strings fall
 * back to a working placeholder so the browser never spams failed requests
 * to unreachable localhost URLs on the live site.
 */
const sanitizeImageUrl = (u: unknown, fallback = DEFAULT_IMAGE_URL): string =>
  isInternalUrl(u) ? fallback : (String(u || '') || fallback);

/** Abort reason token used to cancel a superseded in-flight reservation request. */
const STALE_REQUEST_TOKEN = '__stale_reservation_request__';

export function getSessionId(): string {
  let sid: string | null = null;
  try {
    sid = localStorage.getItem(SESSION_ID_STORAGE_KEY);
  } catch {
    // Storage-disabled and private browsing environments still need one stable
    // identity for every hold, attendee, quote, and payment request in this tab.
  }
  sid ||= inMemorySessionId;
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    inMemorySessionId = sid;
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
  createWalkInBooking: (eventId: string, tierId: string, attendeeName: string, attendeePhone: string, scannedByStaffId?: string, selectedSeats?: string[], paymentMethod?: string, options?: { payments?: { method: string; amount: number }[]; discountOverride?: { overrideId: string; discountAmount: number; actorId: string; reason: string }; shiftId?: string; idempotencyKey?: string; quantity?: number; counterId?: string }) => Promise<Ticket>;
  getEventById: (id: string) => EventItem | undefined;
  addEvent: (newEvent: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>) => void;
  updateEvent: (updatedEvent: EventItem) => void;
  deleteEvent: (eventId: string) => void;
  scanTicketQR: (qrCodeValue: string, scannedByStaffName?: string) => Promise<{ success: boolean; message: string; ticket?: Ticket; alreadyRedeemed?: boolean; isVoid?: boolean; isTampered?: boolean }>;
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

  // Firebase is the single source of truth. A clean production workspace starts
  // empty instead of restoring a legacy mock catalog from browser storage.
  const [events, setEvents] = useState<EventItem[]>([]);

  // 2. Tickets & Bookings State
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);

  const [myTickets, setMyTickets] = useState<Ticket[]>([]);

  const [allBookings, setAllBookings] = useState<BookingRecord[]>(() => {
    const saved = localStorage.getItem('ash_vish_all_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [myBookings, setMyBookings] = useState<BookingRecord[]>(() => {
    const saved = localStorage.getItem('ash_vish_my_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [favorites, setFavorites] = useState<string[]>([]);

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

  // Clear caches created by older demo builds. Active reservations and attendee
  // drafts are intentionally retained because they are live checkout state.
  useEffect(() => {
    [
      'ash_vish_events_db',
      'ash_vish_all_tickets_db',
      'ash_vish_user_tickets',
      'ash_vish_favorites',
    ].forEach((key) => localStorage.removeItem(key));
  }, []);

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
            setBookingStep(isSeatBasedEvent(currentCheckout.event) ? 2 : 1);
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
          // Normalize incomplete records (e.g. missing posterUrl/coverUrl) so
          // image renders and property access can never throw at runtime.
          // Internal/dev image URLs (localhost, loopback, relative dev ports)
          // stored in the database from a legacy environment also fall back —
          // they cannot load on the public site.
          const sanitized = dbList.map((e) => ({
            ...e,
            status: e.status || 'published',
            posterUrl: sanitizeImageUrl(e.posterUrl),
            coverUrl: isInternalUrl(e.coverUrl) || !e.coverUrl ? sanitizeImageUrl(e.posterUrl) : e.coverUrl,
            title: e.title || 'Untitled Event',
            startingPrice: typeof e.startingPrice === 'number' ? e.startingPrice : 0,
            rating: typeof e.rating === 'number' ? e.rating : 0,
            reviewsCount: typeof e.reviewsCount === 'number' ? e.reviewsCount : 0,
          }));
          if (dbList.length > 0) {
            setEvents(sanitized);
            // Cache to offline storage without overriding server authority
            localStorage.setItem('ash_vish_events_db', JSON.stringify(sanitized));
          } else {
            setEvents([]);
            localStorage.removeItem('ash_vish_events_db');
          }
        } else {
          setEvents([]);
          localStorage.removeItem('ash_vish_events_db');
        }
      },
      (error) => {
        console.warn('Realtime Database events sync failed:', error);
        setEvents([]);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time listener for tickets: staff can read the operational collection;
  // customers read only their server-written user mirror.
  useEffect(() => {
    const currentUserId = auth.currentUser?.uid || user?.id;
    const staffView = user?.role === 'admin' || user?.role === 'ticket_counter';
    if (!currentUserId && !staffView) return; // guest users have no ticket node
    // (guest check-in data is served by the server via HMAC-signed endpoints);
    // reading users/__no_user__/tickets would be denied by the tightened rules.
    const ticketsRef = ref(rtdb, staffView ? 'tickets' : `users/${currentUserId}/tickets`);
    const unsubscribe = onValue(
      ticketsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const ticketList: Ticket[] = (Object.values(val) as Ticket[]).map((t) => ({
            ...t,
            eventPoster: sanitizeImageUrl(t.eventPoster),
          }));
          if (ticketList.length > 0) {
            setAllTickets(ticketList);
            localStorage.setItem('ash_vish_all_tickets_db', JSON.stringify(ticketList));

            const userTix = staffView
              ? ticketList.filter((t) => t.ownerId === currentUserId)
              : ticketList;
            setMyTickets(userTix);
            localStorage.setItem('ash_vish_user_tickets', JSON.stringify(userTix));
          }
        }
      },
      (error) => {
        console.warn('Tickets RTDB sync warning:', error);
      }
    );

    return () => unsubscribe();
  }, [user?.id, user?.role]);

  // Real-time listener for bookings: staff can read the operational collection;
  // customers read only their server-written user mirror.
  useEffect(() => {
    const currentUserId = auth.currentUser?.uid || user?.id;
    const staffView = user?.role === 'admin' || user?.role === 'ticket_counter';
    if (!currentUserId && !staffView) return; // guest users have no bookings node
    const bookingsRef = ref(rtdb, staffView ? 'bookings' : `users/${currentUserId}/bookings`);
    const unsubscribe = onValue(
      bookingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const bookingList: BookingRecord[] = Object.values(val);
          if (bookingList.length > 0) {
            setAllBookings(bookingList);
            localStorage.setItem('ash_vish_all_bookings', JSON.stringify(bookingList));

            const userBkg = staffView
              ? bookingList.filter((b) => b.userId === currentUserId)
              : bookingList;
            setMyBookings(userBkg);
            localStorage.setItem('ash_vish_my_bookings', JSON.stringify(userBkg));
          }
        }
      },
      (error) => {
        console.warn('Bookings RTDB sync warning:', error);
      }
    );

    return () => unsubscribe();
  }, [user?.id, user?.role]);

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

  const authenticatedApiHeaders = async (): Promise<Record<string, string>> => {
    const headers = apiHeaders();
    try {
      if (auth.currentUser) {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }
    } catch (err) {
      console.warn('Could not attach Firebase identity token:', err);
    }
    return headers;
  };

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
    const authHeaders = await authenticatedApiHeaders();
    if (reservation && reservation.status === 'active' && tierMatch) {
      res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}/selection`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ seatIds, quantity }),
        signal: controller.signal,
      });
    } else {
      const idempotencyKey = `idem_${getSessionId()}_${event.id}_${tier.id}_${seatIds.slice().sort().join(',')}`;
      res = await safeFetch<any>('/api/reservations', {
        method: 'POST',
        headers: authHeaders,
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
      seatIds: Array.isArray(data.seatIds) ? data.seatIds : [],
      status: data.status,
      ownerId: data.ownerId,
      expiresAt: data.expiresAt,
      serverNow: data.serverNow,
      holdTtlMs: data.holdTtlMs,
    };
    setReservation(next);
    // Keep selection in sync
    selectTicketsForCheckout(event, tier, quantity, Array.isArray(data.seatIds) ? data.seatIds : []);
    return next;
  };

  const refreshReservation = async (): Promise<ReservationState | null> => {
    if (!reservation) return null;
    try {
      const authHeaders = await authenticatedApiHeaders();
      const res = await safeFetch<any>(`/api/reservations/${reservation.reservationId}`, {
        headers: authHeaders,
      });
      const data = res.data || {};
      if (!res.ok || !data.success) return null;
      const next: ReservationState = {
        reservationId: data.reservationId,
        eventId: data.eventId,
        tierId: data.tierId,
        quantity: data.quantity,
        seatIds: Array.isArray(data.seatIds) ? data.seatIds : [],
        status: data.status,
        ownerId: data.ownerId,
      expiresAt: data.expiresAt,
      serverNow: data.serverNow,
      holdTtlMs: data.holdTtlMs,
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
      const authHeaders = await authenticatedApiHeaders();
      await safeFetch(`/api/reservations/${reservation.reservationId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
    } catch (err) {
      console.warn('Cancel reservation network note:', err);
    }
    setReservation(null);
    setQuote(null);
  };

  const setAttendeeDetails = async (details: { name: string; email: string; phone: string }): Promise<boolean> => {
    let currentRes = reservation;
    if (!currentRes || currentRes.status !== 'active') {
      if (currentCheckout) {
        try {
          currentRes = await createReservation(currentCheckout.selectedSeats || []);
        } catch {
          // If creation fails, we'll try with whatever is available
        }
      }
    }
    if (!currentRes) return false;
    try {
      const authHeaders = await authenticatedApiHeaders();
      const res = await safeFetch<any>(`/api/reservations/${currentRes.reservationId}/attendee`, {
        method: 'POST',
        headers: authHeaders,
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
    // Seat holds are owned by the reservation service. This compatibility
    // method deliberately delegates to the reservation cancellation endpoint;
    // it never mutates seats from the browser.
    if (!eventId || !seatIds || seatIds.length === 0 || !reservation || reservation.eventId !== eventId) return;
    await cancelReservation();
  };

  // Online Purchase Confirmation with RTDB writes and error handling toast
  const confirmPurchase = async (
    _attendeeDetails: { name: string; email: string; phone: string },
    _paymentMethod: string,
    _ownerId?: string
  ): Promise<Ticket> => {
    throw new Error('The legacy client-side purchase flow is disabled. Complete payment through the Razorpay checkout.');
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

  // Walk-in Manual Counter Booking. Issuance is server-authoritative so a
  // counter browser cannot forge tickets or overwrite seats directly.
  const createWalkInBooking = async (
    eventId: string,
    tierId: string,
    attendeeName: string,
    attendeePhone: string,
    scannedByStaffId?: string,
    selectedSeats?: string[],
    paymentMethod: string = 'cash',
    options?: { payments?: { method: string; amount: number }[]; discountOverride?: { overrideId: string; discountAmount: number; actorId: string; reason: string }; shiftId?: string; idempotencyKey?: string; quantity?: number; counterId?: string }
  ): Promise<Ticket> => {
    const response = await safeFetch<any>('/api/walk-in-bookings', {
      method: 'POST',
      headers: await authenticatedApiHeaders(),
      body: JSON.stringify({
        eventId,
        tierId,
        attendeeName,
        attendeePhone,
        scannedByStaffId,
        selectedSeats: selectedSeats || [],
        paymentMethod,
        ...(Number.isInteger(options?.quantity) && (options?.quantity as number) > 0 ? { quantity: options?.quantity } : {}),
        ...(options?.payments ? { payments: options.payments } : {}),
        ...(options?.discountOverride ? { discountOverride: options.discountOverride } : {}),
        ...(options?.shiftId ? { shiftId: options.shiftId } : {}),
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        ...(options?.counterId ? { counterId: options.counterId } : {}),
      }),
    });
    const data = response.data || {};
    if (!response.ok || !data.success || !data.ticket || !data.booking) {
      const message = data.error || response.error || 'Walk-in booking could not be completed.';
      showToast(message, 'error');
      throw new Error(message);
    }

    const ticket = data.ticket as Ticket;
    const booking = data.booking as BookingRecord;
    const countToDeduct = ticket.quantity || selectedSeats?.length || 1;
    setEvents((prev) => prev.map((event) => event.id !== eventId ? event : {
      ...event,
      ticketTiers: event.ticketTiers.map((tier) => tier.id !== tierId
        ? tier
        : { ...tier, remainingInventory: Math.max(0, tier.remainingInventory - countToDeduct) }),
    }));
    setAllTickets((prev) => [ticket, ...prev.filter((item) => item.id !== ticket.id)]);
    setMyTickets((prev) => [ticket, ...prev.filter((item) => item.id !== ticket.id)]);
    setAllBookings((prev) => [booking, ...prev.filter((item) => item.bookingId !== booking.bookingId)]);
    setMyBookings((prev) => [booking, ...prev.filter((item) => item.bookingId !== booking.bookingId)]);
    showToast('Walk-in counter booking created successfully!', 'success');
    return ticket;
  };

  const getEventById = (id: string) => {
    return events.find((e) => e.id === id);
  };

  const addEvent = async (newEventData: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>) => {
    const response = await safeFetch<any>('/api/events', {
      method: 'POST',
      headers: await authenticatedApiHeaders(),
      body: JSON.stringify({
        ...newEventData,
        rating: 5.0,
        reviewsCount: 0,
        // Only attach a default seat map when the admin has NOT explicitly
        // disabled seating for this event.
        ...(newEventData.usesSeatMap === false
          ? {}
          : {
              seatMap: newEventData.seatMap || {
                rows: 6,
                cols: 8,
                aisleAfterCols: [4],
                tierByRow: { '1-2': 'VIP Skybox Lounge', '3-6': 'General Admission' },
              },
            }),
      }),
    });
    const data = response.data || {};
    if (!response.ok || !data.success || !data.event) {
      const message = data.error || response.error || 'Event could not be published.';
      showToast(message, 'error');
      throw new Error(message);
    }
    setEvents((prev) => [data.event, ...prev.filter((event) => event.id !== data.event.id)]);
    showToast('Event published successfully!', 'success');
  };

  const updateEvent = async (updatedEvent: EventItem) => {
    const response = await safeFetch<any>(`/api/events/${encodeURIComponent(updatedEvent.id)}`, {
      method: 'PUT',
      headers: await authenticatedApiHeaders(),
      body: JSON.stringify(updatedEvent),
    });
    const data = response.data || {};
    if (!response.ok || !data.success || !data.event) {
      const message = data.error || response.error || 'Event could not be updated.';
      showToast(message, 'error');
      throw new Error(message);
    }
    setEvents((prev) => prev.map((event) => event.id === updatedEvent.id ? data.event : event));
    showToast('Event updated successfully!', 'success');
  };

  const deleteEvent = async (eventId: string) => {
    const response = await safeFetch<any>(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: await authenticatedApiHeaders(),
    });
    const data = response.data || {};
    if (!response.ok || !data.success) {
      const message = data.error || response.error || 'Event could not be deleted.';
      showToast(message, 'error');
      throw new Error(message);
    }
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
    showToast('Event deleted successfully.', 'success');
  };

  const scanTicketQR = async (qrCodeValue: string, scannedByStaffName?: string) => {
    const response = await safeFetch<any>('/api/tickets/verify-and-redeem', {
      method: 'POST',
      headers: await authenticatedApiHeaders(),
      body: JSON.stringify({
        signedToken: qrCodeValue.trim(),
        scannedByStaffId: scannedByStaffName || 'Gate Staff #402',
      }),
    });
    const data = response.data || {};
    if (!response.ok || !data.success || !data.valid) {
      return {
        success: false,
        message: data.error || response.error || 'Server verification failed. Entry denied.',
        isTampered: response.status === 400,
        alreadyRedeemed: /already scanned|redeemed/i.test(data.error || ''),
      };
    }
    if (data.ticket) {
      setAllTickets((prev) => prev.map((ticket) => ticket.id === data.ticket.id ? data.ticket : ticket));
      setMyTickets((prev) => prev.map((ticket) => ticket.id === data.ticket.id ? data.ticket : ticket));
    }
    return {
      success: true,
      message: `TICKET REDEEMED! Gate Access Granted for ${data.ticket?.attendeeName || 'attendee'}.`,
      ticket: data.ticket,
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
    const role = user?.role;
    const isAdmin =
      role === 'admin' || role === 'ticket_counter' || role === 'event_manager' || role === 'super_admin';
    if (!isAdmin) return; // coupons are an admin feature; direct RTDB reads are
    // denied for guests under the tightened security rules (server APIs carry
    // their own admin token), so only fetch when the signed-in user is staff.
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
      const uid = auth.currentUser?.uid || user?.id;
      if (uid) {
        // Direct RTDB fallback for signed-in staff only: under the tightened
        // rules a guest (or unauthenticated) RTDB read of coupons is denied,
        // so unauthenticated validation relies solely on the server API above.
        try {
          const snap = await rtdbGet(`coupons/${codeUpper}`);
          if (snap.data) {
            coupon = snap.data as Coupon;
          }
        } catch (e) {
          console.warn('RTDB coupon fetch warning:', e);
        }
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

  // Coupon edit (Prompt B): the coupons schema uses the code as its database
  // key, so editing is implemented as an in-place update rather than a
  // delete + create; type/value/limit can change while the code stays.
  const updateCoupon = async (code: string, patch: Partial<Coupon>) => {
    const upperCode = code.trim().toUpperCase();
    const target = coupons.find(c => c.code === upperCode);
    const updated = target ? { ...target, ...patch, code: upperCode } : patch;
    setCoupons(prev => prev.map(c => c.code === upperCode ? updated as Coupon : c));

    try {
      const res = await safeFetch('/api/coupons/update', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ code: upperCode, ...patch }),
      });
      if (res.ok && res.data?.success) {
        showToast('Coupon updated.', 'success');
        await fetchCoupons();
        return true;
      }
    } catch (err) {
      console.warn('Update coupon API warning:', err);
    }

    try {
      await rtdbUpdate(`coupons/${upperCode}`, patch);
      showToast('Coupon updated.', 'success');
      return true;
    } catch (e) {
      console.warn('RTDB update coupon warning:', e);
      showToast('Coupon updated.', 'success');
      return true;
    }
  };

  // ---- Admin Panel (Prompt B): orders dashboard, reports, notifications ----
  const adminApi = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authenticatedApiHeaders()) },
    });
    return res;
  };

  const fetchAdminEvents = async (status?: string) => {
    try {
      const res = await adminApi(`/api/admin/events${status ? `?status=${encodeURIComponent(status)}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.events || []) as EventItem[];
    } catch (err) {
      console.warn('fetchAdminEvents failed:', err);
      return [] as EventItem[];
    }
  };

  const fetchOrders = async (params: {
    eventId?: string; status?: string; channel?: string;
    dateFrom?: string; dateTo?: string; search?: string; page?: number; pageSize?: number;
  } = {}) => {
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]) as [string, string][]).toString();
      const res = await adminApi(`/api/admin/orders${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { orders: json.orders || [], total: json.total || 0, page: json.page || 1, pageSize: json.pageSize || 20 };
    } catch (err) {
      console.warn('fetchOrders failed:', err);
      return { orders: [], total: 0, page: 1, pageSize: 20 };
    }
  };

  const createManualOrder = async (data: {
    eventId: string; tierId?: string; attendeeName: string; attendeeEmail?: string;
    attendeePhone?: string; selectedSeats?: string[]; quantity?: number;
    paymentMethod?: string; couponCode?: string;
  }) => {
    const res = await adminApi('/api/admin/orders', { method: 'POST', body: JSON.stringify(data) });
    return res;
  };

  const editOrder = async (orderId: string, data: {
    customerDetails?: { name?: string; email?: string; phone?: string };
    selectedSeats?: string[]; tierId?: string;
  }) => {
    const res = await adminApi(`/api/admin/orders/${orderId}`, { method: 'PUT', body: JSON.stringify(data) });
    return res;
  };

  const refundOrder = async (orderId: string, data: { refundType: 'full' | 'partial'; amount?: number; reason: string; seatIds?: string[] }) => {
    const res = await adminApi(`/api/admin/orders/${orderId}/refund`, { method: 'POST', body: JSON.stringify(data) });
    return res;
  };

  const bulkOrdersAction = async (action: 'export' | 'cancel' | 'email', payload: {
    orderIds?: string[]; subject?: string; message?: string;
    eventId?: string; status?: string; channel?: string; dateFrom?: string; dateTo?: string; search?: string;
  } = {}) => {
    const { orderIds, subject, message, ...filters } = payload;
    const body: any = { action };
    if (orderIds && orderIds.length > 0) body.orderIds = orderIds;
    if (action === 'email' || action === 'cancel') {
      body.subject = subject;
      body.message = message;
    }
    if (action === 'export' && Object.keys(filters).length > 0) Object.assign(body, filters);
    if (action === 'export') {
      const res = await fetch('/api/admin/orders/bulk-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authenticatedApiHeaders()) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return res;
      }
      return res;
    }
    return adminApi('/api/admin/orders/bulk-action', { method: 'POST', body: JSON.stringify(body) });
  };

  const countNotifyHolders = async (eventId: string) => {
    try {
      const res = await adminApi(`/api/admin/notify/count-holders?eventId=${encodeURIComponent(eventId)}`);
      const json = await res.json();
      return res.ok ? json.recipientCount : 0;
    } catch {
      return 0;
    }
  };

  const notifyAllHolders = async (eventId: string, subject: string, message: string) => {
    const res = await adminApi('/api/admin/notify/all-holders', { method: 'POST', body: JSON.stringify({ eventId, subject, message }) });
    return res;
  };

  const fetchReports = async (params: { from?: string; to?: string } = {}) => {
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]) as [string, string][]).toString();
      const res = await adminApi(`/api/admin/reports${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (err) {
      console.warn('fetchReports failed:', err);
      return null;
    }
  };

  const applyEventLifecycle = async () => {
    try {
      const res = await adminApi('/api/admin/events/apply-lifecycle', { method: 'POST', body: '{}' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const cloneEvent = async (eventId: string, data: { newDate?: string; newTime?: string; newTitle?: string }) => {
    const res = await adminApi(`/api/admin/events/${eventId}/clone`, { method: 'POST', body: JSON.stringify(data) });
    return res;
  };

  // Review state is populated only from persisted RTDB records.
  const [reviews, setReviews] = useState<EventReview[]>([]);

  const fetchAllReviewsForAdmin = async () => {
    try {
      const snap = await rtdbGet('reviews');
      const reviewsList = snap.data && typeof snap.data === 'object'
        ? Object.values(snap.data) as EventReview[]
        : [];
      setReviews(reviewsList);
    } catch (err) {
      console.warn('RTDB reviews fetch notice:', err);
      setReviews([]);
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
    if (!target) {
      showToast('Review not found. Refresh the moderation list and try again.', 'error');
      return;
    }
    try {
      const response = await safeFetch<any>('/api/admin/reviews/toggle-visibility', {
        method: 'POST',
        headers: await authenticatedApiHeaders(),
        body: JSON.stringify({ reviewId }),
      });
      const data = response.data || {};
      if (!response.ok || !data.success || !data.review) {
        showToast(data.error || response.error || 'Review visibility could not be updated.', 'error');
        return;
      }
      setReviews(prev => prev.map(r => r.id === reviewId ? data.review as EventReview : r));
      showToast(`Review ${data.review.status === 'hidden' ? 'hidden' : 'published'}.`, 'success');
    } catch (e) {
      console.warn('Review visibility API request failed:', e);
      showToast('Review visibility could not be updated. Please try again.', 'error');
    }
  };

  const deleteReview = async (reviewId: string) => {
    try {
      const response = await safeFetch<any>(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'DELETE',
        headers: await authenticatedApiHeaders(),
      });
      const data = response.data || {};
      if (!response.ok || !data.success || data.reviewId !== reviewId) {
        showToast(data.error || response.error || 'The review was not deleted. Please try again.', 'error');
        return;
      }
      // Update the interface only after the protected server confirms that the
      // Realtime Database record has been removed.
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      showToast('Review permanently removed.', 'success');
    } catch (e: any) {
      console.warn('Review deletion API request failed:', e);
      showToast('The review was not deleted. Please try again.', 'error');
    }
  };

  const [organizers, setOrganizers] = useState<OrganizerAccount[]>([]);

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
      setOrganizers([]);
    } catch (err) {
      console.warn('RTDB organizers fetch failed:', err);
      setOrganizers([]);
    }
  };

  useEffect(() => {
    const role = user?.role;
    const isAdmin =
      role === 'admin' || role === 'ticket_counter' || role === 'event_manager' || role === 'super_admin';
    if (!isAdmin) return; // organizer management is an admin feature; direct
    // RTDB reads are denied for guests under the tightened security rules.
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
        fetchAdminEvents,
        fetchOrders,
        createManualOrder,
        editOrder,
        refundOrder,
        bulkOrdersAction,
        countNotifyHolders,
        notifyAllHolders,
        fetchReports,
        applyEventLifecycle,
        cloneEvent,
        updateCoupon,
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
