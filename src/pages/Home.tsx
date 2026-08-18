import React, { useState, useRef } from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Calendar,
  MapPin,
  Flame,
  Star,
  Ticket,
  ArrowRight,
} from 'lucide-react';
import { EventItem, EventCategory } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { EventCard } from '../components/EventCard';
import { CategoryChip } from '../components/CategoryChip';
import { formatINR } from '../utils/formatters';
import { useSEO } from '../hooks/useSEO';

interface HomeProps {
  onSelectEvent: (event: EventItem) => void;
  onBookNow: (event: EventItem) => void;
  onNavigateToSearch: (category?: EventCategory | 'all') => void;
}

export const Home: React.FC<HomeProps> = ({
  onSelectEvent,
  onBookNow,
  onNavigateToSearch,
}) => {
  const { events } = useBooking();
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all');
  const [heroIndex, setHeroIndex] = useState(0);

  useSEO({
    title: 'Live Concerts, Standup Comedy & Stadium Events',
    description: 'Book official live tickets for music tours, standup comedy specials, stadium sports, and theater shows on Ash-vish Events.',
  });

  // Guard against incomplete/malformed event records so a single bad row
  // in the database can never crash the whole homepage (e.g. "v.coverUrl
  // undefined" TypeError on the cinematic hero).
  const wellFormedEvents = events.filter(
    (e) => e && typeof e === 'object' && e.title && (e.posterUrl || e.coverUrl) && typeof e.status === 'string'
  );
  const publicEvents = wellFormedEvents.filter((e) => e.status !== 'draft' && e.status !== 'archived' && e.isEventPublic !== false);
  const featuredEvents = publicEvents.filter((e) => e.isFeatured);
  const currentHeroEvent = featuredEvents[heroIndex] || publicEvents[0];

  // Filtered lists for sections
  const trendingEvents = publicEvents.filter((e) => e.isTrending);
  const popularEvents = publicEvents.filter((e) => e.isPopularThisWeek);
  const musicEvents = publicEvents.filter((e) => e.category === 'concert');
  const comedyEvents = publicEvents.filter((e) => e.category === 'comedy');
  const sportsEvents = publicEvents.filter((e) => e.category === 'sports');

  // Category chips
  const categories: (EventCategory | 'all')[] = ['all', 'concert', 'comedy', 'sports', 'theatre', 'festival'];

  // Scroll helper for horizontal rows
  const scrollRow = (rowId: string, direction: 'left' | 'right') => {
    const container = document.getElementById(rowId);
    if (container) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-12 pb-12">
      
      {/* ----------------- CINEMATIC HERO SECTION ----------------- */}
      <section className={`relative min-h-[52vh] sm:min-h-[60vh] flex ${currentHeroEvent ? 'items-end' : 'items-center'} justify-start overflow-hidden rounded-b-[36px] bg-[#070707]`}>
        {/* Hero Background Poster Image */}
        <div className="absolute inset-0">
          {currentHeroEvent ? (
          <img
            src={currentHeroEvent.coverUrl || currentHeroEvent.posterUrl}
            alt={currentHeroEvent.title}
            className="w-full h-full object-cover object-center filter brightness-[0.75] contrast-[1.1] transition-all duration-700 scale-105"
            fetchPriority="high"
            decoding="async"
          />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#0A0A0A] via-[#1C1C1C] to-[#0A0A0A]" />
          )}
          {/* Overlay Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#070707]/60 to-black/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070707] via-[#070707]/80 to-transparent" />
        </div>

                {/* Hero Content Container */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-12 pt-20">
          {currentHeroEvent ? (
          <div className="max-w-2xl space-y-6">
            {/* Category Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4AF37]/15 text-[#F3E5AB] border border-[#D4AF37]/30 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FEATURED HEADLINER SHOW</span>
            </div>
            {/* Title & Subtitle */}
            <div className="space-y-3">
              <h1 className="font-heading font-extrabold text-4xl sm:text-6xl text-white tracking-tight leading-[1.08] drop-shadow-2xl">
                {currentHeroEvent.title}
              </h1>
              <p className="text-gray-300 text-sm sm:text-base line-clamp-2 leading-relaxed">
                {currentHeroEvent.subtitle}
              </p>
            </div>
            {/* Event Quick Meta */}
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-gray-200">
              <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-md">
                <Calendar className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-medium">{currentHeroEvent.date} @ {currentHeroEvent.time}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-md">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>{currentHeroEvent.venue}, {currentHeroEvent.city}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-md">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold">{currentHeroEvent.rating}</span>
              </div>
            </div>
            {/* CTAs */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={() => onBookNow(currentHeroEvent)}
                className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] hover:brightness-110 text-black font-extrabold text-sm sm:text-base flex items-center gap-2 shadow-xl shadow-[#D4AF37]/25 hover:scale-105 active:scale-95 transition-all"
              >
                <Ticket className="w-5 h-5 stroke-[2.5]" />
                <span>Book Tickets Now (From {formatINR(currentHeroEvent.startingPrice)})</span>
              </button>
              <button
                onClick={() => onSelectEvent(currentHeroEvent)}
                className="px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur-md border border-white/15 transition-all"
              >
                View Full Lineup
              </button>
            </div>
          </div>
          ) : (
            /* Empty-state hero: shows when the events collection has no public,
               well-formed events (e.g. all events were deleted). Never crashes. */
            <div className="max-w-2xl space-y-5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4AF37]/15 text-[#F3E5AB] border border-[#D4AF37]/30 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Welcome to Ash-vish Events</span>
              </div>
              <h1 className="font-heading font-extrabold text-4xl sm:text-5xl text-white tracking-tight leading-[1.1] drop-shadow-2xl">
                Live shows are being prepared
              </h1>
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
                We are setting up the next season of concerts, comedy nights, and stadium events. New listings will appear here shortly.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>Browse categories below for upcoming availability</span>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            {featuredEvents.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setHeroIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === heroIndex
                    ? 'w-10 bg-[#D4AF37] shadow-md shadow-[#D4AF37]/50'
                    : 'w-2 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

        </div>
      </section>


      {/* ----------------- CATEGORIES QUICK FILTERS ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-4 sm:mb-6">
          <div>
            <h2 className="font-heading font-bold text-xl sm:text-3xl text-white">
              Explore By Category
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
              Handpicked live concerts, standup comedy, sports, and theatrical shows.
            </p>
          </div>

          <button
            onClick={() => onNavigateToSearch('all')}
            className="flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#F3E5AB] transition-colors shrink-0 px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/10 sm:bg-transparent border border-[#D4AF37]/20 sm:border-none"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative group">
          <div className="flex items-center gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-3 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory overscroll-x-contain">
            {categories.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                activeCategory={selectedCategory}
                onSelectCategory={(c) => {
                  setSelectedCategory(c);
                  if (c !== 'all') {
                    onNavigateToSearch(c);
                  }
                }}
                count={cat === 'all' ? events.length : events.filter((e) => e.category === cat).length}
              />
            ))}
          </div>
        </div>
      </section>


      {/* ----------------- TRENDING EVENTS ROW ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/20 text-[#D4AF37]">
              <Flame className="w-5 h-5 fill-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white">
                Trending Shows Near You
              </h2>
              <p className="text-xs text-gray-400">High demand events selling fast</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollRow('row-trending', 'left')}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors"
              aria-label="Scroll trending events left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollRow('row-trending', 'right')}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors"
              aria-label="Scroll trending events right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          id="row-trending"
          className="flex items-stretch gap-6 overflow-x-auto no-scrollbar pb-4 pt-1 scroll-smooth"
        >
          {trendingEvents.map((evt) => (
            <div key={evt.id} className="w-[280px] sm:w-[320px] shrink-0">
              <EventCard
                event={evt}
                onSelectEvent={onSelectEvent}
                onBookNow={onBookNow}
              />
            </div>
          ))}
        </div>
      </section>


      {/* ----------------- POPULAR THIS WEEK GRID/ROW ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
              <Star className="w-5 h-5 fill-purple-400" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white">
                Popular This Week
              </h2>
              <p className="text-xs text-gray-400">Highest rated attendee reviews</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollRow('row-popular', 'left')}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors"
              aria-label="Scroll popular events left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollRow('row-popular', 'right')}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/10 transition-colors"
              aria-label="Scroll popular events right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          id="row-popular"
          className="flex items-stretch gap-6 overflow-x-auto no-scrollbar pb-4 pt-1 scroll-smooth"
        >
          {popularEvents.map((evt) => (
            <div key={evt.id} className="w-[280px] sm:w-[320px] shrink-0">
              <EventCard
                event={evt}
                onSelectEvent={onSelectEvent}
                onBookNow={onBookNow}
              />
            </div>
          ))}
        </div>
      </section>


      {/* ----------------- MUSIC CONCERTS ROW ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading font-bold text-2xl text-white">
            Live Music & World Tours
          </h2>

          <button
            onClick={() => onNavigateToSearch('concert')}
            className="text-xs font-semibold text-[#D4AF37] hover:underline"
          >
            See All Concerts ({musicEvents.length})
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {musicEvents.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onSelectEvent={onSelectEvent}
              onBookNow={onBookNow}
            />
          ))}
        </div>
      </section>


      {/* ----------------- COMEDY SHOWS & SPORTS ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Comedy Block */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Comedy Nights
              </span>
              <h3 className="font-heading font-bold text-xl text-white mt-1">
                Standup Comedy Special Shows
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Top award-winning Netflix and HBO headliners live on stage.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {comedyEvents.slice(0, 2).map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-[#1C1C1C] hover:bg-[#262626] cursor-pointer transition-all border border-white/5"
                >
                  {evt.posterUrl ? (
                  <img
                    src={evt.posterUrl}
                    alt={evt.title}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#262626] border border-white/10 flex items-center justify-center shrink-0">
                      <Ticket className="w-6 h-6 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading font-bold text-sm text-white truncate">
                      {evt.title}
                    </h4>
                    <p className="text-xs text-gray-400">{evt.date} • {evt.venue}</p>
                    <p className="text-xs font-bold text-[#D4AF37] mt-0.5">From {formatINR(evt.startingPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sports Block */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Stadium Sports
              </span>
              <h3 className="font-heading font-bold text-xl text-white mt-1">
                Championship Games & Derby Matches
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                NBA Finals, Premier League tours, and court-side VIP passes.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              {sportsEvents.slice(0, 2).map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="flex items-center gap-4 p-3 rounded-2xl bg-[#1C1C1C] hover:bg-[#262626] cursor-pointer transition-all border border-white/5"
                >
                  {evt.posterUrl ? (
                  <img
                    src={evt.posterUrl}
                    alt={evt.title}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#262626] border border-white/10 flex items-center justify-center shrink-0">
                      <Ticket className="w-6 h-6 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading font-bold text-sm text-white truncate">
                      {evt.title}
                    </h4>
                    <p className="text-xs text-gray-400">{evt.date} • {evt.venue}</p>
                    <p className="text-xs font-bold text-[#D4AF37] mt-0.5">From {formatINR(evt.startingPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

    </div>
  );
};
