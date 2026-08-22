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
  Info,
} from 'lucide-react';
import { EventItem, EventCategory } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { EventCard } from '../components/EventCard';
import { CategoryChip } from '../components/CategoryChip';
import { formatINR } from '../utils/formatters';
import { useSEO } from '../hooks/useSEO';
import { generateOrganizationSchema } from '../utils/structuredData';

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
    title: 'Best Event Organisers in Kolhapur, Maharashtra & India',
    description: 'Book official tickets for concerts, standup comedy, stadium events, and theatre in Kolhapur & across Maharashtra. Ash-vish Events — trusted event organisers with instant QR-code digital entry.',
    keywords: 'event organisers kolhapur, events in kolhapur, book tickets kolhapur, concert tickets maharashtra, event management kolhapur, best event organisers india, ash-vish events, digital qr ticket, live concerts kolhapur, standup comedy kolhapur, wedding events kolhapur, corporate events kolhapur',
    structuredData: generateOrganizationSchema(),
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
    <div className="space-y-24 pb-24 bg-[#0a0a0a]">
      
      {/* ----------------- CINEMATIC TWO-COLUMN HERO SECTION ----------------- */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-[#070707]">
        {/* Hero Background with Right-to-Left Gradient */}
        <div className="absolute inset-0 z-0">
          {currentHeroEvent ? (
            <div className="relative w-full h-full flex justify-end">
              <img
                src={currentHeroEvent.coverUrl || currentHeroEvent.posterUrl}
                alt={currentHeroEvent.title}
                className="w-full lg:w-[65%] h-full object-cover object-center filter brightness-[0.7] contrast-[1.1]"
                fetchPriority="high"
              />
              {/* Subtle black gradient from right-to-left to ensure text readability */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#070707] via-[#070707] to-transparent lg:via-[#070707]/60" />
              {/* Bottom fade for smooth transition to content */}
              <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
            </div>
          ) : (
            <div className="w-full h-full bg-[#0a0a0a]" />
          )}
        </div>

        {/* Hero Content Container - Two Column Layout */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
          {currentHeroEvent ? (
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* LEFT COLUMN: Text Content */}
              <div className="space-y-8 animate-in fade-in slide-in-from-left-8 duration-700">
                <div className="space-y-4">
                  <span className="text-[#D4AF37] text-xs sm:text-sm font-black uppercase tracking-[0.3em]">
                    {currentHeroEvent.category === 'concert' ? 'LIVE MUSICAL NIGHT' : currentHeroEvent.category.toUpperCase()}
                  </span>
                  <h1 className="font-heading font-extrabold text-5xl sm:text-7xl text-white tracking-tight leading-[1.05]">
                    {currentHeroEvent.title}
                  </h1>
                  <p className="text-gray-400 text-base sm:text-xl max-w-lg leading-relaxed font-medium">
                    {currentHeroEvent.subtitle}
                  </p>
                </div>

                {/* Scannable Metadata Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-y border-white/5 py-8">
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest">DATE</span>
                    <p className="text-white font-bold text-sm sm:text-base">{currentHeroEvent.date}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest">TIME</span>
                    <p className="text-white font-bold text-sm sm:text-base">{currentHeroEvent.time}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest">VENUE</span>
                    <p className="text-white font-bold text-sm sm:text-base line-clamp-1">{currentHeroEvent.venue}</p>
                  </div>
                </div>

                {/* CTA Hierarchy */}
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                  <button
                    onClick={() => currentHeroEvent.isAdvertiseOnly ? onSelectEvent(currentHeroEvent) : onBookNow(currentHeroEvent)}
                    className="w-full sm:w-auto px-10 py-4 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-[#D4AF37]/10"
                  >
                    {currentHeroEvent.isAdvertiseOnly ? "View Event Details" : `Book Now • From ${formatINR(currentHeroEvent.startingPrice)}`}
                  </button>
                  <button
                    onClick={() => onSelectEvent(currentHeroEvent)}
                    className="w-full sm:w-auto px-10 py-4 rounded-xl bg-transparent hover:bg-white/5 text-white border border-white/10 font-bold text-sm uppercase tracking-widest transition-all"
                  >
                    Save This Event
                  </button>
                </div>

                {/* Carousel Indicators - Integrated at bottom left */}
                <div className="flex items-center gap-3 pt-8" role="tablist">
                  {featuredEvents.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-1 transition-all duration-300 rounded-full ${
                        idx === heroIndex ? 'w-12 bg-[#D4AF37]' : 'w-4 bg-white/20'
                      }`}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN: dominant image area is handled by background positioning */}
              <div className="hidden lg:block h-full min-h-[400px]" />
            </div>
          ) : (
            <div className="max-w-2xl space-y-6">
              <span className="text-[#D4AF37] text-sm font-black uppercase tracking-widest">Welcome to Ash-vish</span>
              <h1 className="text-5xl sm:text-7xl text-white font-black tracking-tighter leading-none">
                Live shows are being prepared
              </h1>
              <p className="text-gray-400 text-lg">New listings will appear here shortly.</p>
            </div>
          )}
        </div>
      </section>

      {/* ----------------- WHY YOU SHOULDN'T MISS IT ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Why You Shouldn't Miss It
            </h2>
            <div className="w-24 h-1 bg-[#D4AF37] mx-auto rounded-full" />
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                title: "Soulful Live Performance",
                desc: "Timeless Bollywood melodies performed live by professional musicians.",
                icon: Sparkles
              },
              {
                title: "Talented Artists",
                desc: "A team of passionate musicians bringing the music to life with every note.",
                icon: Star
              },
              {
                title: "Unforgettable Evening",
                desc: "Great music, premium atmosphere, and memories that last a lifetime.",
                icon: Flame
              }
            ].map((feature, i) => (
              <div key={i} className="group p-8 rounded-3xl bg-[#111] border border-white/5 hover:border-[#D4AF37]/20 transition-all text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <feature.icon className="w-8 h-8 text-[#D4AF37]" />
                </div>
                <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------- ABOUT THE EVENT SECTION ----------------- */}
      {currentHeroEvent && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-16 items-start">
            <div className="lg:col-span-2 space-y-8">
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">About The Event</h2>
              <div className="prose prose-invert max-w-none text-gray-400 leading-relaxed text-lg">
                <p>
                  Experience the magic of live music with Ash-vish Events. Our productions are designed to transport you into a world of rhythm and melody, featuring top-tier artists and world-class sound engineering at Kolhapur's most prestigious venues.
                </p>
                <p>
                  Join us for an evening that celebrates the rich heritage of Bollywood music, reimagined for a modern audience. From soulful ballads to high-energy anthems, every moment is crafted to perfection.
                </p>
              </div>
            </div>

            <div className="p-8 rounded-3xl bg-[#111] border border-white/5 space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-[0.2em]">Organized By</span>
                  <p className="text-white font-bold text-lg">Ash-vish Events</p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-[0.2em]">Event Type</span>
                  <p className="text-white font-bold text-lg uppercase tracking-wide">{currentHeroEvent.category}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-[0.2em]">Venue Capacity</span>
                  <p className="text-white font-bold text-lg">Premium Seating Available</p>
                </div>
              </div>
              <button className="w-full py-4 rounded-xl border border-[#D4AF37]/30 text-[#D4AF37] font-bold text-sm uppercase tracking-widest hover:bg-[#D4AF37]/5 transition-all">
                Add to Calendar
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ----------------- CATEGORIES QUICK FILTERS - Relocated below About ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Explore By Category
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Discover your next unforgettable experience
            </p>
          </div>

          <button
            onClick={() => onNavigateToSearch('all')}
            className="text-xs font-black text-[#D4AF37] uppercase tracking-widest hover:text-white transition-colors"
          >
            View All Categories
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
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
