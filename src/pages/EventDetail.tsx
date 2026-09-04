import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Share2,
  Heart,
  Star,
  Sparkles,
  CheckCircle2,
  Ticket,
  ChevronDown,
  ChevronUp,
  Map,
  Users,
  Building2,
  HelpCircle,
  Phone,
  ShieldCheck,
  ExternalLink,
  Image,
} from 'lucide-react';
import { EventItem, TicketTier, PublicCounter } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { EventCard } from '../components/EventCard';
import { EventReviewsSection } from '../components/EventReviewsSection';
import { TicketCard } from '../components/TicketCard';
import { TicketCardSkeleton } from '../components/TicketCardSkeleton';
import { formatINR } from '../utils/formatters';
import { isSeatBasedEvent } from '../lib/seatMap';
import { useSEO } from '../hooks/useSEO';
import { generateEventSchema, generateOrganizationSchema } from '../utils/structuredData';
import { TicketLineItem, sumItemQuantities } from '../lib/ticketItems';

interface EventDetailProps {
  event: EventItem;
  onBack: () => void;
  /**
   * items (optional) carries a mixed ticket selection — e.g. 2 VIP + 3 Kids in
   * one transaction. Legacy single-type flows omit it.
   */
  onProceedToCheckout: (
    event: EventItem,
    tier: TicketTier,
    quantity: number,
    selectedSeats?: string[],
    items?: TicketLineItem[]
  ) => void;
  onSelectEvent: (event: EventItem) => void;
}

export const EventDetail: React.FC<EventDetailProps> = ({
  event,
  onBack,
  onProceedToCheckout,
  onSelectEvent,
}) => {
  const { events, favorites, toggleFavorite } = useBooking();
  const isFav = favorites.includes(event.id);
  const isLoadingTickets = !event.ticketTiers || event.ticketTiers.length === 0;
  const normalizedExternalBookingUrl = typeof event.externalBookingUrl === 'string'
    ? event.externalBookingUrl.trim()
    : '';
  const hasExternalBooking = event.externalBookingEnabled !== false &&
    /^https?:\/\//i.test(normalizedExternalBookingUrl) &&
    !['null', 'undefined'].includes(normalizedExternalBookingUrl.toLowerCase());
  const showPublicTicketInfo = !hasExternalBooking || event.externalBookingShowTicketInfo !== false;
  const ticketTiers = Array.isArray(event.ticketTiers) ? event.ticketTiers : [];

  const eventSchema = generateEventSchema(event);
  useSEO({
    title: `${event.title} - ${event.venue}, ${event.city}`,
    description: `${event.subtitle || event.description} | Date: ${event.date} @ ${event.time}. Book tickets online at Ash-vish Events.`,
    image: event.coverUrl || event.posterUrl,
    url: window.location.href,
    type: 'event',
    keywords: `${event.category} ${event.city}, ${event.title} tickets ${event.city}, ${event.venue} events kolhapur, book ${event.title} kolhapur`,
    structuredData: eventSchema ? [eventSchema, generateOrganizationSchema()] : generateOrganizationSchema(),
  });

  // Flat single-price ticket: same price for every seat.
  const [flatPrice] = useState<number>(() => {
    // Use the most popular tier's price as the single flat price, falling back
    // to the first tier when no tier is marked popular.
    const flat = ticketTiers.find((t) => t.popular) || ticketTiers[0];
    return typeof flat?.price === 'number' && flat.price > 0 ? flat.price : 0;
  });
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    ticketTiers[0]?.id || null
  );
  const selectedTier = ticketTiers.find((t) => t.id === selectedTierId);
  const [quantity, setQuantity] = useState(1);
  // Multi-type selection (general-admission events only): tierId -> quantity.
  // Lets one transaction mix ticket types, e.g. 2 VIP + 3 Kids.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [allCounters, setAllCounters] = useState<PublicCounter[]>([]);

  // Mixed bookings are reserved for general-admission events (no seat map) with
  // more than one ticket type; seat-based and single-type events keep the
  // classic single-tier flow below.
  const multiMode =
    ticketTiers.length > 1 && !isSeatBasedEvent(event);

  // Reset the mixed selection whenever the event changes.
  React.useEffect(() => {
    setQuantities({});
    setQuantity(1);
  }, [event.id]);

  /** Add/remove a tier quantity with shared caps (per line and overall). */
  const changeQty = (tierId: string, next: number) => {
    setQuantities((prev) => {
      const cur = prev[tierId] || 0;
      let currentTotal = 0;
      for (const k of Object.keys(prev)) currentTotal += prev[k] || 0;
      const tier = ticketTiers.find((t) => t.id === tierId);
      let clamped = Math.max(0, Math.floor(next));
      if (tier) {
        clamped = Math.min(clamped, tier.remainingInventory ?? 0);
      }
      clamped = Math.min(clamped, 6); // per line, matches the classic stepper cap
      const overage = currentTotal - cur + clamped - 10; // 10 tickets max per booking (server cap)
      if (overage > 0) clamped = Math.max(0, clamped - overage);
      if (clamped === cur) return prev;
      const nxt = { ...prev };
      if (clamped <= 0) delete nxt[tierId];
      else nxt[tierId] = clamped;
      return nxt;
    });
  };

  // Derived mixed selection: one line per tier with a quantity above zero.
  const selectedLines: TicketLineItem[] = ticketTiers
    .filter((t) => (quantities[t.id] ?? 0) > 0)
    .map((t) => ({
      tierId: t.id,
      tierName: t.name,
      price: t.price,
      quantity: quantities[t.id],
    }));
  const totalSelectedTickets = sumItemQuantities(selectedLines);
  const totalSelectedAmount = selectedLines.reduce((s, l) => s + (l.price ?? 0) * l.quantity, 0);

  React.useEffect(() => {
    const fetchCounters = async () => {
      try {
        const res = await fetch('/api/counters');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.counters)) {
            setAllCounters(data.counters);
          }
        }
      } catch {
        /* fallback empty */
      }
    };
    fetchCounters();
  }, []);

  const assignedCounters = React.useMemo(() => {
    if (event.assignedCounterIds && event.assignedCounterIds.length > 0) {
      return allCounters.filter((c) => event.assignedCounterIds?.includes(c.id));
    }
    return [];
  }, [event.assignedCounterIds, allCounters]);

  const similarEvents = events.filter((e) => e.category === event.category && e.id !== event.id);

  const handleBookNow = () => {
    if (multiMode) {
      if (selectedLines.length === 0) return;
      // Primary tier = first selected line; items carries the full mixed set.
      const primaryTier = ticketTiers.find((t) => t.id === selectedLines[0].tierId) || ticketTiers[0];
      if (!primaryTier) return;
      // General admission: seat selection is skipped entirely.
      onProceedToCheckout(event, primaryTier, totalSelectedTickets, [], selectedLines);
      return;
    }
    // Use the selected tier, or fall back to the first tier
    const tierToBook = selectedTier || ticketTiers[0];
    if (!tierToBook) {
      alert('No ticket tiers available for this event');
      return;
    }
    // Seat selection happens exclusively in the checkout wizard (Seats step).
    // Pass an empty seat list so the wizard drives the map there.
    onProceedToCheckout(event, tierToBook, quantity, []);
  };

  return (
    <div className="pb-16 pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 text-xs sm:text-sm font-semibold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Events</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              alert('Event link copied to clipboard!');
            }}
            className="p-2.5 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => toggleFavorite(event.id)}
            className="p-2.5 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 border border-white/10 transition-colors"
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-[#D4AF37] text-[#D4AF37]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Event Summary — title, badges and rating. On mobile the banner
          sits immediately below this card, then the info cards follow. */}
      <section className="rounded-3xl bg-[#141414] border border-white/10 p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#D4AF37] text-black">
                {event.category}
              </span>
              {event.isAdvertiseOnly && (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  Counter Only
                </span>
              )}
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-white leading-tight break-words">
              {event.title}
            </h1>
            {event.subtitle && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-3xl">
                {event.subtitle}
              </p>
            )}
          </div>

          {/* Rating badge: inline with title on desktop, below subtitle on mobile */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#1C1C1C] border border-amber-400/25 text-white text-sm font-bold shadow-lg w-fit shrink-0">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span className="text-lg">{event.rating}</span>
            <span className="text-gray-400 font-medium text-xs">({event.reviewsCount} reviews)</span>
          </div>
        </div>
      </section>

      {/* Hero Cover Image — on mobile: portrait crop below title, above info cards.
          On sm+: wide cinematic banner. */}
      <div className="aspect-[4/5] sm:aspect-[2.5/1] w-full rounded-3xl overflow-hidden border border-white/10 bg-[#1C1C1C] shadow-2xl">
        {event.coverUrl || event.posterUrl ? (
        <img
          src={event.coverUrl || event.posterUrl}
          alt={event.title}
          className="aspect-ratio-fix w-full h-full object-cover object-top sm:object-center filter brightness-[0.95] contrast-[1.05]"
        />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#262626]">
            <Ticket className="w-16 h-16 text-white/25" />
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 rounded-2xl bg-[#141414] border border-white/10">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                  Date & Time
                </span>
                <span className="text-xs sm:text-sm font-semibold text-white block mt-0.5">
                  {event.date}
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#D4AF37]" /> {event.time}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                  Venue & City
                </span>
                <span className="text-xs sm:text-sm font-semibold text-white block mt-0.5">
                  {event.venue}
                </span>
                <span className="text-xs text-gray-400 truncate block">{event.city}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                  Organized By
                </span>
                <span className="text-xs sm:text-sm font-semibold text-white block mt-0.5">
                  {event.presentedBy || event.organizer}
                </span>
                
              </div>
            </div>
          </div>

          {/* About */}
          <div className="space-y-3">
            <h3 className="font-heading font-bold text-xl text-white">About The Event</h3>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>

          {/* Featured Artists */}
          {event.artists && event.artists.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-[#D4AF37]" />
                <span>Featured Lineup & Artists</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {event.artists.map((artist) => (
                  <div
                    key={artist.id}
                    className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#141414] border border-white/10"
                  >
                    <img
                      src={artist.image}
                      alt={artist.name}
                      className="w-14 h-14 rounded-xl object-cover border border-[#D4AF37]/30"
                    />
                    <div>
                      <h4 className="font-heading font-bold text-sm text-white">
                        {artist.name}
                      </h4>
                      <p className="text-xs text-[#D4AF37] font-medium">{artist.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Gallery */}
          {event.gallery && event.gallery.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                <Image className="w-5 h-5 text-[#D4AF37]" />
                <span>Event Gallery</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {event.gallery.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#141414] group"
                  >
                    <img
                      src={imgUrl}
                      alt={`${event.title} gallery ${idx + 1}`}
                      className="aspect-ratio-fix w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What's Included (event perks + selected tier perks) */}
          {(event.perks?.length > 0 || (showPublicTicketInfo && selectedTier?.perks?.length > 0)) && (
            <div className="space-y-3">
              <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>What&apos;s Included</span>
              </h3>

              <div className="p-5 rounded-2xl bg-[#141414] border border-[#D4AF37]/20 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {event.perks && event.perks.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[#D4AF37]" /> Event Perks
                    </span>
                    <ul className="space-y-2">
                      {event.perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2.5 text-xs text-gray-300">
                          <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {showPublicTicketInfo && selectedTier?.perks?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 flex items-center gap-1.5">
                      <Star className="w-3 h-3 text-[#D4AF37]" /> {selectedTier.name} Benefits

                    </span>
                    <ul className="space-y-2">
                      {selectedTier.perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2.5 text-xs text-gray-300">
                          <Star className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ticket information or external booking CTA */}
          {event.isAdvertiseOnly && hasExternalBooking ? (
            <div className="p-5 rounded-2xl bg-[#141414] border border-[#D4AF37]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shrink-0">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                    Tickets & Booking
                  </span>
                  <span className="font-heading font-bold text-lg text-white block mt-0.5">
                    Book this event on Ticket Khidakee
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ticket selection, availability, and payment are handled securely on the external booking page.
                  </p>
                </div>
              </div>
              <a
                href={normalizedExternalBookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-bold text-xs transition-colors whitespace-nowrap"
              >
                Book on Ticket Khidakee
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <>
              {/* Ticket Selection Grid */}
              {ticketTiers && ticketTiers.length > 0 && showPublicTicketInfo && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-[#D4AF37]" />
                      <span>Select Your Ticket</span>
                    </h3>
                    {ticketTiers.length > 1 && (
                      <span className="text-xs text-gray-400 font-medium">
                        {ticketTiers.length} options available
                      </span>
                    )}
                  </div>

                  <div className={`grid gap-4 ${
                    ticketTiers.length === 1 ? 'grid-cols-1' :
                    ticketTiers.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  }`}>
                    {ticketTiers.map((tier) => {
                      const isVip = tier.name.toLowerCase().includes('vip');
                      if (multiMode) {
                        // Multi-type mode: each card carries an add-to-booking
                        // stepper so the user can mix VIP, VVIP and Kids passes
                        // into a single checkout.
                        return (
                          <TicketCard
                            key={tier.id}
                            tier={tier}
                            isVip={isVip}
                            isPopular={tier.popular}
                            selectedTierId={undefined}
                            onSelect={() => {}}
                            quantity={quantities[tier.id] || 0}
                            onQuantityChange={(t, n) => changeQty(t.id, n)}
                          />
                        );
                      }
                      return (
                        <TicketCard
                          key={tier.id}
                          tier={tier}
                          isVip={isVip}
                          isPopular={tier.popular}
                          selectedTierId={selectedTierId || undefined}
                          onSelect={(tier) => {
                            setSelectedTierId(tier.id);
                            setQuantity(1); // Reset quantity when tier changes
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoadingTickets && showPublicTicketInfo && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-[#D4AF37]" />
                      <span>Select Your Ticket</span>
                    </h3>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((idx) => (
                      <div key={idx}>
                        <TicketCardSkeleton />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback for single tier or no public tickets */}
              {(!showPublicTicketInfo || ticketTiers.length === 0) && (
                <div className="p-5 rounded-2xl bg-[#141414] border border-[#D4AF37]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shrink-0">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                        Ticket Information
                      </span>
                      <span className="font-heading font-bold text-lg text-white block mt-0.5">
                        {selectedTier ? formatINR(selectedTier.price) : 'Price unavailable'} per ticket
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isSeatBasedEvent(event)
                          ? "Choose your exact seat on the map during checkout."
                          : "General admission — pick your tickets during checkout; no seat selection."}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-xs text-gray-400 font-medium block">Available</span>
                    <span className="font-heading font-extrabold text-xl text-[#D4AF37]">
                      {selectedTier?.remainingInventory ?? 0} left
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Schedule */}
          {event.schedule && event.schedule.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-heading font-bold text-xl text-white">Showtime Schedule</h3>

              <div className="space-y-3 bg-[#141414] border border-white/10 p-5 rounded-2xl">
                {event.schedule.map((item, index) => (
                  <div key={index} className="flex gap-4 items-start pb-3 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="px-3 py-1 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] font-mono font-bold text-xs shrink-0">
                      {item.time}
                    </span>
                    <div>
                      <h5 className="font-heading font-bold text-sm text-white">{item.title}</h5>
                      <p className="text-xs text-gray-400">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map Location Box */}
          <div className="space-y-3">
            <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
              <Map className="w-5 h-5 text-[#D4AF37]" />
              <span>Venue Location & Map</span>
            </h3>

            <div className="p-6 rounded-2xl bg-[#141414] border border-white/10 space-y-4">
              <div>
                <h4 className="font-heading font-bold text-base text-white">{event.venue}</h4>
                <p className="text-xs text-gray-400">{event.address}</p>
              </div>

              <div className="relative aspect-[21/9] w-full rounded-xl bg-[#1C1C1C] border border-white/10 overflow-hidden flex items-center justify-center text-center p-6">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:20px_20px] opacity-10" />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37] text-black font-bold flex items-center justify-center shadow-lg ">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <span className="font-heading font-bold text-sm text-white">{event.venue}</span>
                  <span className="text-xs text-gray-400">{event.address}</span>
                  <a
                    href={event.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs font-semibold text-[#D4AF37] hover:underline"
                  >
                    Open in Google Maps →
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* FAQs Accordion */}
          {event.faqs && event.faqs.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#D4AF37]" />
                <span>Frequently Asked Questions</span>
              </h3>

              <div className="space-y-3">
                {event.faqs.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden"
                    >
                      <button
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full p-4 text-left flex items-center justify-between font-heading font-semibold text-sm text-white hover:text-[#D4AF37] transition-colors"
                      >
                        <span>{faq.question}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-[#D4AF37]" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 text-xs text-gray-400 border-t border-white/5 pt-3 leading-relaxed">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Sticky Sidebar */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 card-depth rounded-3xl p-6 bg-[#141414] border border-white/10 space-y-6 shadow-2xl">
            
            {event.isAdvertiseOnly || hasExternalBooking ? (
              <div className="space-y-5">
                <div className="border-b border-white/10 pb-4">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-amber-300 border border-white/15 inline-flex items-center gap-1.5 mb-2.5">
                    <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                    {hasExternalBooking ? 'External Booking' : 'Walk-In Ticket Sales'}
                  </span>
                  <h3 className="font-heading font-extrabold text-xl text-white">
                    Event Information & Entry
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {hasExternalBooking
                      ? 'Book tickets through Ticket Khidakee. Ash-vish Events is displaying this listing only and does not collect payment here.'
                      : 'Tickets and admission for this event are available directly at venue ticket counters.'}
                  </p>
                </div>

                {hasExternalBooking && (
                  <a
                    href={normalizedExternalBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-bold text-sm transition-colors"
                  >
                    Book on Ticket Khidakee
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Assigned Ticket Counters Box */}
                <div className="bg-[#1C1C1C] border border-[#D4AF37]/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2 text-xs text-[#D4AF37] font-bold uppercase tracking-wider">
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span>Ticket Counters & Box Office</span>
                    </div>
                    {assignedCounters.length > 0 && (
                      <span className="text-[10px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded-full">
                        {assignedCounters.length} Station{assignedCounters.length > 1 ? 's' : ''} Available
                      </span>
                    )}
                  </div>

                  {assignedCounters.length > 0 ? (
                    <div className="space-y-3">
                      {assignedCounters.map((counter) => (
                        <div key={counter.id} className="p-3 bg-[#121212] border border-white/10 rounded-xl space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">{counter.name}</span>
                            <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              Active Counter
                            </span>
                          </div>
                          {(counter.venue || counter.city || counter.address) && (
                            <div className="flex items-start gap-1.5 text-gray-300 text-[11px]">
                              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                              <span>{counter.address ? `${counter.address}, ` : ''}{counter.venue}{counter.city ? `, ${counter.city}` : ''}</span>
                            </div>
                          )}
                          {counter.operatingHours && (
                            <div className="flex items-center gap-1.5 text-amber-300/90 text-[11px]">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>{counter.operatingHours}</span>
                            </div>
                          )}
                          {counter.phone && (
                            <div className="flex items-center gap-1.5 text-gray-300 text-[11px]">
                              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{counter.phone}</span>
                            </div>
                          )}
                          {counter.mapsUrl && (
                            <a
                              href={counter.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D4AF37] hover:underline pt-1"
                            >
                              <span>Open Location in Maps</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs text-gray-300">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-gray-400 text-[11px]">Location / Gate:</span>
                        <span className="font-semibold text-white">{event.counterLocation || `${event.venue} Box Office Counter`}</span>
                      </div>
                      {event.counterTimingText && (
                        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-white/5">
                          <span className="text-gray-400 text-[11px]">Counter Hours:</span>
                          <span className="font-medium text-gray-200">{event.counterTimingText}</span>
                        </div>
                      )}
                      {event.counterContactPhone && (
                        <div className="flex flex-col gap-0.5 pt-1.5 border-t border-white/5">
                          <span className="text-gray-400 text-[11px]">Helpdesk / Phone:</span>
                          <span className="font-medium text-emerald-400">{event.counterContactPhone}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Event Quick Specs */}
                <div className="bg-[#1C1C1C] border border-white/10 rounded-2xl p-4 space-y-2 text-xs text-gray-300">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-gray-400">Venue:</span>
                    <span className="font-semibold text-white text-right">{event.venue}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-gray-400">City:</span>
                    <span className="font-semibold text-white">{event.city}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-gray-400">Date:</span>
                    <span className="font-semibold text-white">{event.date}</span>
                  </div>
                  {showPublicTicketInfo && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-400">Entry Rate:</span>
                      <span className="font-bold text-[#D4AF37] text-sm">{formatINR(flatPrice)}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-gray-400 text-center leading-relaxed px-2">
                  {hasExternalBooking
                    ? 'Use the external Ticket Khidakee booking page for ticket selection and payment.'
                    : 'Please visit the venue ticket counter for ticket purchasing and gate entry.'}
                </p>
              </div>
          ) : multiMode ? (
            <>
              {/* Multi-type Selection Summary (general admission — mix ticket types) */}
              <div className="border-b border-white/10 pb-4">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block">
                  Your Selection — Mix & Match
                </span>
                {selectedLines.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                    Use the + buttons on the ticket cards to add passes — you can book VIP, VVIP and Kids
                    tickets together in a single checkout.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {selectedLines.map((line) => (
                      <div key={line.tierId} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/25 font-bold text-[10px] uppercase tracking-wider shrink-0">
                            {line.tierName || 'Ticket'}
                          </span>
                          <span className="text-gray-300 font-semibold truncate">
                            {line.quantity} × {formatINR(line.price ?? 0)}
                          </span>
                        </div>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-white">{formatINR((line.price ?? 0) * line.quantity)}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${line.tierName || 'ticket'} from booking`}
                            onClick={() => changeQty(line.tierId, 0)}
                            className="w-6 h-6 rounded-md bg-[#1C1C1C] hover:bg-red-500/20 border border-white/10 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-type totals */}
              <div className="space-y-2 text-xs text-gray-300">
                <div className="flex justify-between items-center">
                  <span className="font-heading font-bold text-sm text-white">
                    Total ({totalSelectedTickets} {totalSelectedTickets === 1 ? 'ticket' : 'tickets'})
                  </span>
                  <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                    {formatINR(totalSelectedAmount)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  GST & service charges included. One QR gate pass is issued per ticket.
                </p>
              </div>

              {/* Book Now Button (multi-type) */}
              <button
                onClick={handleBookNow}
                disabled={totalSelectedTickets === 0 || isLoadingTickets}
                className={`
                  w-full py-4 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 shadow-xl transition-all
                  ${isLoadingTickets || totalSelectedTickets === 0
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] hover:brightness-110 text-black hover:scale-[1.02] active:scale-[0.98] shadow-[#D4AF37]/20'
                  }
                `}
              >
                <Ticket className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {isLoadingTickets
                    ? 'Loading Tickets...'
                    : totalSelectedTickets === 0
                      ? 'Select Tickets Above'
                      : `Book ${totalSelectedTickets} ${totalSelectedTickets === 1 ? 'Ticket' : 'Tickets'} — ${formatINR(totalSelectedAmount)}`}
                </span>
              </button>

              <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Instant QR Pass Confirmation
              </p>
            </>
          ) : (
            <>
              {/* Selected Ticket Summary */}
                <div className="border-b border-white/10 pb-4">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block">
                    Selected Ticket
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-heading font-bold text-lg text-white">
                      {selectedTier?.name || (isLoadingTickets ? '...' : 'Choose a Ticket')}
                    </span>
                    <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                      {selectedTier ? formatINR(selectedTier.price) : (isLoadingTickets ? '...' : '—')}
                    </span>
                  </div>
                  {selectedTier && (
                    <>
                      <p className="text-xs text-gray-400 mt-2">
                        {selectedTier.description || 'Select your preferred ticket tier'}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`text-xs font-semibold ${
                          (selectedTier.remainingInventory ?? 0) <= 0 ? 'text-red-400' :
                          (selectedTier.remainingInventory ?? 0) <= 5 ? 'text-amber-400' :
                          'text-emerald-400'
                        }`}>
                          {(selectedTier.remainingInventory ?? 0) <= 0 
                            ? 'Sold Out' 
                            : (selectedTier.remainingInventory ?? 0) <= 5
                              ? `Only ${selectedTier.remainingInventory} left`
                              : `${selectedTier.remainingInventory} available`
                          }
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Quantity Stepper */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-300 block">
                    Select Quantity (Max 6)
                  </label>
                  <div className="flex items-center justify-between bg-[#1C1C1C] border border-white/10 rounded-xl p-2">
                    <button
                      onClick={() => {
                        setQuantity(Math.max(1, quantity - 1));
                      }}
                      className="w-9 h-9 rounded-lg bg-[#141414] hover:bg-black text-white font-bold text-base flex items-center justify-center border border-white/10 transition-colors"
                    >
                      -
                    </button>
                    <span className="font-heading font-bold text-lg text-white">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(Math.min(6, quantity + 1))}
                      className="w-9 h-9 rounded-lg bg-[#141414] hover:bg-black text-white font-bold text-base flex items-center justify-center border border-white/10 transition-colors"
                      disabled={(selectedTier?.remainingInventory ?? 0) <= 0}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Price Breakdown */}
                {selectedTier && (
                  <div className="space-y-2 text-xs text-gray-300 pt-2 border-t border-white/10">
                    <div className="flex justify-between">
                      <span>{selectedTier.name} ({formatINR(selectedTier.price)} × {quantity})</span>
                      <span className="font-semibold text-white">{formatINR(selectedTier.price * quantity)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST & Service Charge</span>
                      <span className="font-semibold text-emerald-400">INCLUDED</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                      <span className="font-heading font-bold text-sm text-white">Total Amount</span>
                      <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                        {formatINR(selectedTier.price * quantity)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Book Now Button */}
                <button
                  onClick={handleBookNow}
                  disabled={(selectedTier?.remainingInventory ?? 0) <= 0 || !selectedTier || isLoadingTickets}
                  className={`
                    w-full py-4 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 transition-all
                    ${isLoadingTickets || !selectedTier || (selectedTier?.remainingInventory ?? 0) <= 0
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-[#D4AF37] hover:bg-[#E3C456] text-black active:scale-[0.98]'
                    }
                  `}
                >
                  <Ticket className="w-5 h-5 stroke-[2.5]" />
                  <span>
                    {isLoadingTickets ? 'Loading Tickets...' :
                    (selectedTier?.remainingInventory ?? 0) <= 0 ? 'Sold Out' : 
                    !selectedTier ? 'Select a Ticket' : 
                    'Proceed To Checkout'}
                  </span>
                </button>

                <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Instant QR Pass Confirmation
                </p>
              </>
            )}

          </div>
        </div>

      </div>

      {/* Fan Ratings & Reviews Section */}
      <EventReviewsSection eventId={event.id} />

      {/* Similar Events */}
      {similarEvents.length > 0 && (
        <div className="pt-12 border-t border-white/10 space-y-6">
          <h2 className="font-heading font-bold text-2xl text-white">
            More Events You Might Like
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {similarEvents.slice(0, 3).map((evt) => (
              <EventCard
                key={evt.id}
                event={evt}
                onSelectEvent={onSelectEvent}
                onBookNow={(e) => onSelectEvent(e)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ICS Download + Verify Ticket */}
      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/public/events/${event.id}/ics`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10 transition-all"
          download
        >
          <Calendar className="w-3.5 h-3.5" />
          Add to Calendar
        </a>
        <a
          href="/verify"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10 transition-all"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Verify Ticket
        </a>
      </div>

      {/* Per-Event JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: event.title,
            description: event.description,
            image: event.posterUrl || event.coverUrl,
            startDate: event.date && event.time ? `${event.date}T${event.time}` : event.date,
            eventStatus: event.status === 'published' ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventCancelled',
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            location: {
              '@type': 'Place',
              name: event.venue,
              address: {
                '@type': 'PostalAddress',
                addressLocality: event.city,
                addressRegion: 'Maharashtra',
                addressCountry: 'IN',
              },
            },
            organizer: {
              '@type': 'Organization',
              name: event.organizer || event.organizerName || 'Ash-vish Events',
              url: 'https://ashvishevents.com',
            },
            performer: (event.artists || []).map((a: any) => ({
              '@type': 'Person',
              name: a.name,
              jobTitle: a.role,
              image: a.image,
            })),
            offers: (event.ticketTiers || []).map((tier: any) => ({
              '@type': 'Offer',
              name: tier.name,
              price: tier.price,
              priceCurrency: 'INR',
              availability: tier.remainingInventory > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
              url: `https://ashvishevents.com/events/${event.id}`,
            })),
            inLanguage: 'hi',
            isAccessibleForFree: false,
          }),
        }}
      />
    </div>
  );
};
