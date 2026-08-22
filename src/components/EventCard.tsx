import React from 'react';
import { Calendar, MapPin, Heart, Star, Ticket, Info } from 'lucide-react';
import { EventItem } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { formatINR } from '../utils/formatters';

interface EventCardProps {
  event: EventItem;
  onSelectEvent: (event: EventItem) => void;
  onBookNow: (event: EventItem) => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, onSelectEvent, onBookNow }) => {
  const { favorites, toggleFavorite } = useBooking();
  const isFav = favorites.includes(event.id);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'concert':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'comedy':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'sports':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'theatre':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    }
  };

  return (
    <div
      onClick={() => onSelectEvent(event)}
      className="card-depth rounded-[18px] overflow-hidden flex flex-col group cursor-pointer relative transition-all duration-300"
    >
      {/* Zone 1: Dedicated Poster Section */}
      <div className="relative aspect-[4/5] sm:aspect-[3/4] w-full overflow-hidden bg-[#1C1C1C] border-b border-white/10 shadow-md">
        {(event.cardImageUrl || event.posterUrl) ? (
          <img
            src={event.cardImageUrl || event.posterUrl}
            alt={event.title}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            fetchPriority="auto"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#262626]">
            <Ticket className="w-12 h-12 text-white/25" />
          </div>
        )}
      </div>

      {/* Zone 2: Slim Meta Strip */}
      <div className="px-4 sm:px-5 pt-4 pb-1 bg-[#141414] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category Chip */}
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border backdrop-blur-md ${getCategoryColor(
              event.category
            )}`}
          >
            {event.category}
          </span>

          {/* Walk-In / Counter Info badge */}
          {event.isAdvertiseOnly && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider bg-black/70 text-amber-300 border border-amber-500/30">
              Walk-In / Counter Info
            </span>
          )}

          {/* Rating Badge */}
          <div className="flex items-center gap-1 px-2 py-1 bg-[#1C1C1C] rounded-lg text-xs font-semibold text-white border border-white/10">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{event.rating}</span>
            <span className="text-gray-400 text-[10px]">({event.reviewsCount})</span>
          </div>
        </div>

        {/* Favourite Button (Right side of Zone 2) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(event.id);
          }}
          aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          className="min-w-[44px] min-h-[44px] p-2.5 rounded-full bg-[#1C1C1C] hover:bg-white/10 border border-white/10 text-white hover:text-[#D4AF37] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          <Heart
            className={`w-4 h-4 transition-transform duration-200 ${
              isFav ? 'fill-[#D4AF37] text-[#D4AF37]' : ''
            }`}
          />
        </button>
      </div>

      {/* Zone 3: Content Container */}
      <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-3 flex-1 flex flex-col justify-between gap-3 sm:gap-4 bg-[#141414]">
        <div>
          <h3 className="font-heading font-bold text-base sm:text-lg text-white group-hover:text-[#D4AF37] transition-colors line-clamp-1 leading-snug">
            {event.title}
          </h3>
          <p className="text-xs text-gray-400 line-clamp-1 mt-1">
            {event.subtitle}
          </p>
        </div>

        {/* Event Meta Info */}
        <div className="space-y-1.5 sm:space-y-2 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span className="font-medium text-gray-200">{event.date} • {event.time}</span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate text-gray-400">{event.venue}, {event.city}</span>
          </div>
        </div>

        {/* Footer Row: Price & Book Button */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between mt-auto gap-2">
          <div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">
              From
            </span>
            <span className="font-heading text-base sm:text-lg font-bold text-white">
              {formatINR(event.startingPrice)}
            </span>
          </div>

          {event.isAdvertiseOnly ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent(event);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs transition-all cursor-pointer whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5 text-[#D4AF37] stroke-[2.5]" />
              <span>View Details</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookNow(event);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2 min-h-[44px] rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs shadow-md shadow-[#D4AF37]/25 hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              <Ticket className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Book Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
