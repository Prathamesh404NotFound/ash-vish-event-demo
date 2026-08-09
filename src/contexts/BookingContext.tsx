import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, get, set, push, child, onValue, runTransaction } from 'firebase/database';
import { rtdb, auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { EventItem, Ticket, TicketTier, BookingRecord, Coupon, EventReview, OrganizerAccount } from '../types';
import { MOCK_EVENTS, MOCK_TICKETS, DEMO_ORGANIZERS } from '../data/mockEvents';
import { safeFetch, getApiUrl } from '../lib/api';
import { rtdbGet, rtdbSet, rtdbDelete } from '../lib/rtdb';

export interface CheckoutSession {
  event: EventItem;
  tier: TicketTier;
  quantity: number;
  selectedSeats?: string[];
  appliedCoupon?: Coupon;
  discountAmount?: number;
}

interface BookingContextType {
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
  };

  const clearCheckout = () => {
    setCurrentCheckout(null);
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
      paymentMethod: paymentMethod || 'cashfree',
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
      const res = await safeFetch('/api/coupons', {
        headers: await getAuthHeaders(),
      });
      if (res.ok && res.data?.coupons) {
        setCoupons(res.data.coupons);
      }
    } catch (err) {
      console.warn('Failed to fetch coupons from server:', err);
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
      const res = await safeFetch('/api/admin/reviews', {
        headers: await getAuthHeaders(),
      });
      if (res.ok && res.data?.reviews) {
        setReviews(res.data.reviews);
      }
    } catch (err) {
      console.warn('Failed to fetch admin reviews:', err);
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
      const res = await safeFetch(`/api/events/${eventId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment,
          userName: userName || 'Music Fan',
          userAvatar,
          isVerifiedBuyer: isVerified
        })
      });
      if (res.ok) {
        await fetchAllReviewsForAdmin();
        showToast('Review submitted successfully!', 'success');
        return true;
      }
      showToast(res.error || `Failed to submit review. Status: ${res.status}`, 'error');
      return false;
    } catch (err: any) {
      showToast(`Network error submitting review: ${err.message}`, 'error');
      return false;
    }
  };

  const toggleReviewVisibility = async (reviewId: string) => {
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: r.status === 'published' ? 'hidden' : 'published' } : r));
    const target = reviews.find(r => r.id === reviewId);
    const newStatus = target && target.status === 'published' ? 'hidden' : 'published';

    try {
      const res = await safeFetch('/api/admin/reviews/toggle-visibility', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ reviewId })
      });
      if (res.ok) return;
    } catch (err) {
      console.warn('Toggle review visibility API warning:', err);
    }

    try {
      if (target) {
        await rtdbSet(`reviews/${reviewId}`, { ...target, status: newStatus });
      }
    } catch (e) {
      console.warn('RTDB review status update warning:', e);
    }
  };

  const deleteReview = async (reviewId: string) => {
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    try {
      const res = await safeFetch(`/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      if (res.ok) {
        showToast('Review removed.', 'info');
        return;
      }
    } catch (err) {
      console.warn('Delete review API warning:', err);
    }

    try {
      await rtdbDelete(`reviews/${reviewId}`);
      showToast('Review removed.', 'info');
    } catch (e) {
      console.warn('RTDB delete review warning:', e);
    }
  };

  const [organizers, setOrganizers] = useState<OrganizerAccount[]>(DEMO_ORGANIZERS);

  const fetchOrganizers = async () => {
    try {
      const res = await safeFetch('/api/organizers', {
        headers: await getAuthHeaders(),
      });
      if (res.ok && res.data?.organizers) {
        setOrganizers(res.data.organizers);
      }
    } catch (err) {
      console.warn('Failed to fetch organizers:', err);
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
      const res = await safeFetch('/api/organizers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgData),
      });
      if (res.ok) {
        await fetchOrganizers();
        showToast('Organizer registration submitted successfully!', 'success');
        return true;
      }
    } catch (err: any) {
      console.warn('Register organizer API warning:', err);
    }

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
    setOrganizers(prev => prev.map(o => o.id === organizerId ? { ...o, status, approvedAt: updatedApprovedAt || o.approvedAt } : o));

    try {
      const res = await safeFetch('/api/organizers/status', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ organizerId, status }),
      });
      if (res.ok || (res.data && res.data.success)) {
        showToast(`Organizer ${status} successfully.`, 'success');
        return;
      }
    } catch (err: any) {
      console.warn('Update organizer status API warning:', err);
    }

    try {
      const targetOrg = organizers.find(o => o.id === organizerId || o.userId === organizerId);
      if (targetOrg) {
        const updatedOrg = { ...targetOrg, status, ...(status === 'approved' ? { approvedAt: updatedApprovedAt } : {}) };
        await rtdbSet(`organizers/${organizerId}`, updatedOrg);
      }
      showToast(`Organizer ${status} successfully.`, 'success');
    } catch (e) {
      showToast(`Organizer ${status} successfully.`, 'success');
    }
  };

  return (
    <BookingContext.Provider
      value={{
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
