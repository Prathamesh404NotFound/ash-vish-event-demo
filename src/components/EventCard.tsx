import React from 'react';
import { Calendar, MapPin, Heart, Star, Ticket } from 'lucide-react';
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
      {/* Poster Image Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#1C1C1C]">
        <img
          src={event.posterUrl}
          alt={event.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        {/* Top Overlay Gradient */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
        {/* Bottom Overlay Gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#141414] to-transparent" />

        {/* Category Badge */}
        <div className="absolute top-3.5 left-3.5">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border backdrop-blur-md ${getCategoryColor(
              event.category
            )}`}
          >
            {event.category}
          </span>
        </div>

        {/* Favourite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(event.id);
          }}
          className="absolute top-3.5 right-3.5 p-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white hover:text-[#D4AF37] transition-colors"
        >
          <Heart
            className={`w-4 h-4 transition-transform duration-200 active:scale-125 ${
              isFav ? 'fill-[#D4AF37] text-[#D4AF37]' : ''
            }`}
          />
        </button>

        {/* Rating Badge */}
        <div className="absolute bottom-3 left-3.5 flex items-center gap-1 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs font-semibold text-white border border-white/10">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span>{event.rating}</span>
          <span className="text-gray-400 text-[10px]">({event.reviewsCount})</span>
        </div>
      </div>

      {/* Content Container */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4 bg-[#141414]">
        
        <div>
          <h3 className="font-heading font-bold text-lg text-white group-hover:text-[#D4AF37] transition-colors line-clamp-1 leading-snug">
            {event.title}
          </h3>
          <p className="text-xs text-gray-400 line-clamp-1 mt-1">
            {event.subtitle}
          </p>
        </div>

        {/* Event Meta Info */}
        <div className="space-y-2 text-xs text-gray-300">
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
        <div className="pt-3 border-t border-white/10 flex items-center justify-between mt-auto">
          <div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">
              From
            </span>
            <span className="font-heading text-lg font-bold text-white">
              {formatINR(event.startingPrice)}
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onBookNow(event);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs shadow-md shadow-[#D4AF37]/25 hover:scale-105 active:scale-95 transition-all"
          >
            <Ticket className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Book Now</span>
          </button>
        </div>

      </div>
    </div>
  );
};
