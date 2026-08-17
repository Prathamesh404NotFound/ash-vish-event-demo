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
} from 'lucide-react';
import { EventItem, TicketTier } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { EventCard } from '../components/EventCard';
import { EventReviewsSection } from '../components/EventReviewsSection';
import { formatINR } from '../utils/formatters';
import { isSeatBasedEvent } from '../lib/seatMap';
import { useSEO } from '../hooks/useSEO';

interface EventDetailProps {
  event: EventItem;
  onBack: () => void;
  onProceedToCheckout: (event: EventItem, tier: TicketTier, quantity: number, selectedSeats?: string[]) => void;
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

  useSEO({
    title: `${event.title} - ${event.venue}, ${event.city}`,
    description: `${event.subtitle || event.description} | Date: ${event.date} @ ${event.time}. Book tickets online at Ash-vish Events.`,
    image: event.coverUrl || event.posterUrl,
    url: window.location.href,
    type: 'article',
  });

  // Flat single-price ticket: same price for every seat.
  const [flatPrice] = useState<number>(() => {
    // Use the most popular tier's price as the single flat price, falling back
    // to the first tier when no tier is marked popular.
    const flat = event.ticketTiers.find((t) => t.popular) || event.ticketTiers[0];
    return typeof flat?.price === 'number' && flat.price > 0 ? flat.price : 0;
  });
  const [quantity, setQuantity] = useState(1);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const similarEvents = events.filter((e) => e.category === event.category && e.id !== event.id);

  const handleBookNow = () => {
    // Seat selection happens exclusively in the checkout wizard (Seats step).
    // Pass an empty seat list so the wizard drives the map there.
    onProceedToCheckout(event, event.ticketTiers[0], quantity, []);
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

      {/* Hero Cover Image Header */}
      <div className="relative aspect-[21/9] sm:aspect-[2.5/1] w-full rounded-3xl overflow-hidden border border-white/10 bg-[#1C1C1C] shadow-2xl">
        {event.coverUrl || event.posterUrl ? (
        <img
          src={event.coverUrl || event.posterUrl}
          alt={event.title}
          className="w-full h-full object-cover filter brightness-[0.8]"
        />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#262626]">
            <Ticket className="w-16 h-16 text-white/25" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-black/40 to-transparent" />

        <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-md">
              {event.category}
            </span>
            <h1 className="font-heading font-extrabold text-2xl sm:text-4xl text-white drop-shadow-md">
              {event.title}
            </h1>
            <p className="text-gray-300 text-xs sm:text-sm line-clamp-1">{event.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-semibold">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            <span>{event.rating} ({event.reviewsCount} reviews)</span>
          </div>
        </div>
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
                <span className="text-xs text-emerald-400 font-medium">Verified Partner</span>
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

          {/* What's Included (event perks + tier perks) */}
          {(event.perks?.length > 0 || event.ticketTiers[0]?.perks?.length > 0) && (
            <div className="space-y-3">
              <h3 className="font-heading font-bold text-xl text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>What&apos;s Included</span>
              </h3>

              <div className="p-5 rounded-2xl bg-[#141414] border border-[#D4AF37]/20 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {event.perks && event.perks.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 flex items-center gap-1.5">
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
                {event.ticketTiers[0]?.perks?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 flex items-center gap-1.5">
                      <Star className="w-3 h-3 text-[#D4AF37]" /> {event.ticketTiers[0].name} Benefits
                    </span>
                    <ul className="space-y-2">
                      {event.ticketTiers[0].perks.map((perk) => (
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

          {/* Simple Flat-Price Ticket Info */}
          <div className="p-5 rounded-2xl bg-[#141414] border border-[#D4AF37]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shrink-0">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider block">
                  One Simple Price
                </span>
                <span className="font-heading font-bold text-lg text-white block mt-0.5">
                  {formatINR(flatPrice)} per ticket — all {isSeatBasedEvent(event) ? "seats" : "guests"}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isSeatBasedEvent(event)
                    ? "Choose your exact seat on the map during checkout."
                    : "General admission — pick your tickets during checkout; no seat selection."}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs text-gray-400 font-medium block">Total Availability</span>
              <span className="font-heading font-extrabold text-xl text-[#D4AF37]">
                {event.ticketTiers.reduce((sum, t) => sum + (t.remainingInventory || 0), 0)} tickets left
              </span>
            </div>
          </div>

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
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37] text-black font-bold flex items-center justify-center shadow-lg animate-bounce">
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

        {/* Right Column: Sticky Checkout Sidebar */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 card-depth rounded-3xl p-6 bg-[#141414] border border-white/10 space-y-6 shadow-2xl">
            
            <div className="border-b border-white/10 pb-4">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block">
                One Simple Price
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-heading font-bold text-lg text-white">
                  Standard Ticket — All Seats
                </span>
                <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                  {formatINR(flatPrice)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isSeatBasedEvent(event)
                  ? "Same price for every seat — pick yours on the map during checkout."
                  : "General admission — no seat selection, quantity only."}
              </p>
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
                >
                  +
                </button>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 text-xs text-gray-300 pt-2 border-t border-white/10">
              <div className="flex justify-between">
                <span>Standard Ticket ({formatINR(flatPrice)} × {quantity})</span>
                <span className="font-semibold text-white">{formatINR(flatPrice * quantity)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST & Service Charge</span>
                <span className="font-semibold text-emerald-400">INCLUDED</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                <span className="font-heading font-bold text-sm text-white">Total Amount</span>
                <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                  {formatINR(flatPrice * quantity)}
                </span>
              </div>
            </div>

            {/* Book Now Button */}
            <button
              onClick={handleBookNow}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] hover:brightness-110 text-black font-extrabold text-base flex items-center justify-center gap-2 shadow-xl shadow-[#D4AF37]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Ticket className="w-5 h-5 stroke-[2.5]" />
              <span>Proceed To Checkout</span>
            </button>

            <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Instant QR Pass Confirmation
            </p>

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
                onBookNow={(e) => onProceedToCheckout(e, e.ticketTiers[0], 1)}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
