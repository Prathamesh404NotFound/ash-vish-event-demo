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
  organizer: string;
  description: string;
  artists: Artist[];
  ticketTiers: TicketTier[];
  gallery: string[];
  faqs: FAQ[];
  schedule?: EventScheduleItem[];
  seatMap?: SeatMapConfig;
  isFeatured?: boolean;
  isTrending?: boolean;
  isPopularThisWeek?: boolean;
  rating: number;
  reviewsCount: number;
  status?: EventStatus;
  totalCapacity?: number;
  organizerId?: string;
  organizerName?: string;
}

export type UserRole = 'customer' | 'admin' | 'ticket_counter' | 'organizer';
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

