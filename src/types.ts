export type EventCategory = 'concert' | 'comedy' | 'sports' | 'theatre' | 'festival';
export type EventStatus = 'draft' | 'published' | 'sold_out' | 'cancelled' | 'completed';

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
  /**
   * When true, this tier is sold only at a physical ticket counter.
   * It will be hidden from the public website checkout and shown as
   * "Counter Only" on the event detail page.
   */
  counterOnly?: boolean;
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

/** Sponsor type categories — controls the badge label in the UI. */
export type SponsorType =
  | 'title'
  | 'presenting'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'media_partner'
  | 'associate';

/**
 * A single sponsor entry attached to an event.
 * The logo is hosted on Firebase Storage (or any CDN URL).
 */
export interface Sponsor {
  id: string;
  name: string;
  type: SponsorType;
  /** Publicly accessible image URL for the sponsor logo. */
  logoUrl?: string;
  /** Optional click-through link shown on the event page. */
  website?: string;
}

/** Time-boxed Early Bird discount configured per event in the admin panel. */
export interface EarlyBirdConfig {
  /** Master switch for the promotion. */
  enabled: boolean;
  /** 'percent' takes off `discountValue`% of each ticket; 'flat' takes off ₹`discountValue` per ticket. */
  discountType: 'percent' | 'flat';
  /** Percentage (0-100) or flat amount in ₹ per ticket, depending on discountType. */
  discountValue: number;
  /** ISO-8601 timestamp when the promotion window opens (empty/absent = open now). */
  startsAt?: string | null;
  /** ISO-8601 timestamp when the promotion window closes (empty/absent = runs until the event ends). */
  endsAt?: string | null;
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
  /** Early Bird time-boxed discount; applied server-side while the window is active. */
  earlyBird?: EarlyBirdConfig | null;
  /**
   * Sponsors for this event. Each entry carries a type (title / gold / silver / …)
   * and an optional logo URL. Displayed subtly on the event page and embedded
   * as a small overlay in the QR code and PDF ticket.
   */
  sponsors?: Sponsor[];
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
  entryMethod?: 'manual' | 'automatic';
  counterId?: string;
  counterName?: string;
  holdAtCounter?: boolean;
  locationPlacement?: string;
  isUnnecessaryLocation?: boolean;
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
  /** ── Partial / multi-entry check-in fields ───────────────────── */
  /** Guests already admitted (server-maintained transactionally). */
  checkedInQuantity?: number;
  /** UNUSED | PARTIALLY_CHECKED_IN | FULLY_CHECKED_IN | INVALID | CANCELLED | EXPIRED */
  entryStatus?: string;
  lastScanAt?: string;
  lastScannedBy?: string;
  lastScanCounter?: string;
}

export interface ComplianceCheckResult {
  status: 'Compliant' | 'Non-compliant';
  violationsCount: number;
  details: string[];
}

export interface EventComplianceReport {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventCity: string;
  eventStatus: string;
  totalTickets: number;
  checks: {
    manualEntry: ComplianceCheckResult;
    counterPlacement: ComplianceCheckResult;
    unnecessaryPlacement: ComplianceCheckResult;
  };
  overallStatus: 'Compliant' | 'Non-compliant';
  lastAuditedAt: string;
}

export interface ComplianceSummary {
  totalCompletedEvents: number;
  compliantEventsCount: number;
  nonCompliantEventsCount: number;
  manualEntryViolationsCount: number;
  counterPlacementViolationsCount: number;
  unnecessaryPlacementViolationsCount: number;
}

export type EntryOutcome = 'UNUSED' | 'PARTIALLY_CHECKED_IN' | 'FULLY_CHECKED_IN' | 'INVALID' | 'CANCELLED' | 'EXPIRED';

export interface EntryRecord {
  id: string;
  ticketId: string;
  quantityEntered: number;
  scannedAt: string;
  scannedBy: string;
  counterId?: string;
  note?: string;
  totalAfter?: number;
}

export interface EntryStatusResponse {
  found: boolean;
  ticketId?: string;
  ticket?: Ticket;
  outcome?: EntryOutcome;
  entryStatus?: string;
  ticketQuantity?: number;
  checkedInQuantity?: number;
  remainingQuantity?: number;
  allowPartialEntry?: boolean;
  canEnter?: boolean;
  reason?: string;
  lastScanAt?: string;
  lastScannedBy?: string;
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

export interface CounterShiftLiveTotals {
  expectedCash: number;
  cashSalesCount: number;
  totalSales: number;
  byMethod: Record<string, number>;
  ticketsSold?: number;
}

export interface CounterShiftRecord {
  shiftId: string;
  staffId: string;
  staffName: string;
  staffRole?: string;
  counterId?: string;
  counterName?: string;
  subUserId?: string;
  subUserName?: string;
  startTime: string;
  endTime?: string | null;
  startingCash: number;
  countedCash?: number | null;
  expectedCash?: number | null;
  discrepancy?: number | null;
  cashSalesCount?: number;
  totalSales?: number;
  ticketsSold?: number;
  byMethod?: Record<string, number>;
  autoReconciled?: boolean;
  status: 'open' | 'closed';
  closedBy?: string;
  liveTotals?: CounterShiftLiveTotals;
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

export interface WhatsAppTemplate {
  id: string;
  name: string;
  /** Template body with {{variable}} placeholders. Supported variables:
   *  {{eventTitle}}, {{attendeeName}}, {{quantity}}, {{date}}, {{time}},
   *  {{venue}}, {{city}}, {{tierName}}, {{seatLabel}}, {{ticketRef}},
   *  {{passUrl}}, {{mapsUrl}}, {{totalPaid}}, {{attendeePhone}},
   *  {{attendeeEmail}}, {{bookingId}}
   */
  body: string;
  /** Assigned event IDs. Empty array = default template for all events. */
  assignedEventIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalize ticketTiers from RTDB.
 * RTDB stores arrays as objects with numeric keys { "0": {...}, "1": {...} }.
 * This utility safely converts any shape into a proper filtered array.
 */
export function normalizeTiers(ticketTiers: any): TicketTier[] {
  if (!ticketTiers) return [];
  if (Array.isArray(ticketTiers)) return ticketTiers.filter(Boolean) as TicketTier[];
  if (typeof ticketTiers === 'object') {
    return Object.values(ticketTiers).filter(Boolean) as TicketTier[];
  }
  return [];
}
