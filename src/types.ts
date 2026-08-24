export type EventCategory = 'concert' | 'comedy' | 'sports' | 'theatre' | 'festival';
export type EventStatus = 'draft' | 'published' | 'sold_out' | 'cancelled';

export interface Artist {
  id: string;
  name: string;
  role: string;
  image: string;
}

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  description: string;
  totalInventory: number;
  remainingInventory: number;
  perks: string[];
  popular?: boolean;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface EventScheduleItem {
  time: string;
  title: string;
  description: string;
}

export interface SeatSection {
  id: string;
  name: string;
  color?: string;
  price: number;
  rowsCount: number;
  seatsPerRow: number;
  startRowIndex?: number;
}

export interface SeatMapConfig {
  rows: number;
  cols: number;
  aisleAfterCols?: number[];
  tierByRow?: Record<string, string>; // e.g. { "1-2": "VIP", "3-8": "General" }
  sections?: SeatSection[];
}

export type SeatType = 'regular' | 'premium' | 'accessible' | 'obstructed-view';

export interface SeatNode {
  id: string; // e.g. "R1-C1" or "SEC_1-R1-S1"
  seatId?: string;
  section?: string;
  row: number | string;
  col: number;
  number?: number | string;
  price?: number;
  status: 'available' | 'held' | 'booked';
  heldBy?: string;
  heldAt?: number;
  holdExpiresAt?: number;
  seatType?: SeatType;
  pricingTierId?: string;
  seatIdLabel?: string; // human-readable row/label override for the event
}

export interface EventItem {
  id: string;
  title: string;
  subtitle: string;
  category: EventCategory;
  date: string;
  time: string;
  venue: string;
  address: string;
  city: string;
  startingPrice: number;
  posterUrl: string;
  coverUrl: string;
  cardImageUrl?: string;
  organizer: string;
  description: string;
  artists: Artist[];
  ticketTiers: TicketTier[];
  gallery: string[];
  faqs: FAQ[];
  schedule?: EventScheduleItem[];
  seatMap?: SeatMapConfig;
  /** Event-level perks/features shown beside the seat map and on the event detail page. */
  perks?: string[];
  /**
   * Admin-controlled toggle. When explicitly `false`, the event runs a
   * general-admission (walk-up) flow: no seat selection step, no seat map.
   * `undefined`/`true` keeps the classic seat-based flow whenever a seat
   * map is configured. Default: true.
   */
  usesSeatMap?: boolean;
  /**
   * Admin-controlled toggle. When true, this event's ONLINE bookings are
   * created without collecting payment (walk-in counter sales are
   * unaffected and keep collecting payment as normal). The online guest
   * receives a Reservation Pass instead of a Digital Pass; payment is
   * collected later via the Pay-at-Counter panel. Default: false.
   */
  cashOnCounterOnly?: boolean;
  isFeatured?: boolean;
  isTrending?: boolean;
  isPopularThisWeek?: boolean;
  rating: number;
  reviewsCount: number;
  status?: EventStatus;
  totalCapacity?: number;
  organizerId?: string;
  organizerName?: string;
  /** ISO-8601 timestamp at which a draft event is auto-published by the scheduler. */
  scheduledPublishAt?: string | null;
  /** ISO-8601 timestamp at which a published event is auto-unpublished (taken down) by the scheduler. */
  scheduledUnpublishAt?: string | null;
  /** Optional flag surfaced by the public portal once an event's sales have closed. */
  isEventPublic?: boolean;
  /** Event ID of the original listing this event was cloned from. */
  clonedFrom?: string;
  /** Custom Google Maps URL override (falls back to an address-based query when unset). */
  mapsUrl?: string;
  /** Human-readable presenter/organizer line shown on the event detail page. */
  presentedBy?: string;
  /**
   * When true, this event is advertised on the public portal for viewing,
   * but local online checkout is disabled. If externalBookingUrl is present,
   * the public event page sends guests to that external booking provider.
   */
  isAdvertiseOnly?: boolean;
  /** External booking destination used by advertisement-only event listings. */
  externalBookingUrl?: string;
  /** Explicitly controls whether the external booking option is shown publicly. */
  externalBookingEnabled?: boolean;
  /** Controls whether external-event ticket prices, tiers, and availability are shown publicly. */
  externalBookingShowTicketInfo?: boolean;
  /** Optional ticket counter location details */
  counterLocation?: string;
  counterTimingText?: string;
  counterContactPhone?: string;
  assignedCounterIds?: string[];
}

export interface CounterSubUser {
  id: string;
  name: string;
  phone: string;
  pinHash: string;
  status: 'active' | 'inactive';
}

export interface PublicCounter {
  id: string;
  name: string;
  venue?: string;
  address?: string;
  city?: string;
  mapsUrl?: string;
  operatingHours?: string;
  phone?: string;
  status: 'active' | 'inactive';
}

export interface Counter extends PublicCounter {
  merchantUpi?: { vpa?: string; name?: string };
  assignedStaffIds?: string[];
  subUsers?: CounterSubUser[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export type UserRole = 'customer' | 'admin' | 'ticket_counter' | 'organizer' | 'super_admin' | 'event_manager' | 'counter_staff' | 'auditor';
export type OrganizerStatus = 'pending' | 'approved' | 'rejected';

export interface OrganizerAccount {
  id: string;
  userId: string;
  name: string;
  email: string;
  organizationName: string;
  phone: string;
  description?: string;
  status: OrganizerStatus;
  appliedAt: string;
  approvedAt?: string;
  eventsCount?: number;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  eventId: string;
  eventTitle: string;
  eventPoster: string;
  venue: string;
  city: string;
  date: string;
  time: string;
  tierName: string;
  price: number;
  quantity: number;
  totalPaid: number;
  seatNumber: string;
  selectedSeats?: string[];
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  qrCodeValue: string;
  status: 'valid' | 'used' | 'redeemed' | 'cancelled' | 'void';
  purchasedAt: string;
  ownerId?: string;
  scannedBy?: string;
  scannedAt?: string;
  isWalkIn?: boolean;
  /** 'entry' = normal, gate-valid ticket. 'reservation' = Cash-on-Counter-Only
   *  event's unpaid pass; not valid at the gate until paymentStatus is 'paid'. */
  passType?: 'entry' | 'reservation';
  paymentStatus?: 'paid' | 'pending';
  /** Amount still owed in INR. 0 once paid. */
  amountDue?: number;
  issuedBySubUserId?: string;
  issuedBySubUserName?: string;
  passSlug?: {
    id: string;
    sig: string;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string;
  authProvider: 'google' | 'email';
  joinedDate: string;
  role: UserRole;
  rbacRole?: UserRole;
  termsAccepted?: boolean;
  organizerStatus?: OrganizerStatus;
  organizationName?: string;
  organizerPhone?: string;
  organizerDescription?: string;
}

export interface FilterOptions {
  searchQuery: string;
  category: EventCategory | 'all';
  city: string;
  priceMax: number;
  dateFilter: string;
  sortBy: 'featured' | 'price-asc' | 'price-desc' | 'date-asc';
}

export interface BookingRecord {
  bookingId: string;
  userId: string;
  eventId: string;
  seatIds: string[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
  paymentMethod?: string;
  attendeeName?: string;
  attendeePhone?: string;
  attendeeEmail?: string;
  ticketId?: string;
  isWalkIn?: boolean;
  paymentStatus?: 'paid' | 'pending';
  amountDue?: number;
  issuedBySubUserId?: string;
  issuedBySubUserName?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number; // e.g. 20 for 20% or 500 for INR 500
  validUntil: string;
  usageLimit?: number;
  usedCount: number;
  eventId?: string; // Optional event restriction
  isActive: boolean;
  createdAt: string;
}

export interface EventReview {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number; // 1 to 5
  comment: string;
  createdAt: string;
  status: 'published' | 'hidden';
  isVerifiedBuyer?: boolean;
}

