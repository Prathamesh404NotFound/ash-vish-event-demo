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
    <div className="space-y-24 pb-24 bg-[#070707]">
      
      {/* ----------------- CINEMATIC TWO-COLUMN HERO SECTION ----------------- */}
      <section className="relative min-h-[85vh] lg:min-h-[90vh] flex items-center overflow-hidden bg-[#070707] border-b border-white/5">
        {/* Hero Background with Cinematic Vignette */}
        <div className="absolute inset-0 z-0">
          {currentHeroEvent ? (
            <div className="relative w-full h-full">
              <img
                src={currentHeroEvent.coverUrl || currentHeroEvent.posterUrl}
                alt={currentHeroEvent.title}
                className="w-full h-full object-cover object-center filter brightness-[0.4] contrast-[1.1] scale-105"
                fetchPriority="high"
              />
              {/* Radial and Linear Vignette for cinematic focus */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-transparent to-[#070707]/40" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#070707] via-[#070707]/20 to-transparent" />
            </div>
          ) : (
            <div className="w-full h-full bg-[#070707]" />
          )}
        </div>

        {/* Hero Content Container - Two Column Layout */}
        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
          {currentHeroEvent ? (
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* LEFT COLUMN: Clean Editorial Typography */}
              <div className="space-y-10 animate-in fade-in slide-in-from-left-12 duration-1000">
                <div className="space-y-6">
                  <span className="inline-flex items-center gap-2 text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.4em]">
                    <span className="w-8 h-[1px] bg-[#D4AF37]/50" />
                    {currentHeroEvent.category === 'concert' ? 'LIVE MUSICAL NIGHT' : currentHeroEvent.category.toUpperCase()}
                  </span>
                  <h1 className="font-heading font-black text-5xl sm:text-6xl lg:text-7xl text-white tracking-tight leading-[1.05] drop-shadow-2xl">
                    {currentHeroEvent.title}
                  </h1>
                  <p className="text-gray-400 text-base sm:text-lg max-w-lg leading-relaxed font-medium border-l-2 border-[#D4AF37]/30 pl-6">
                    {currentHeroEvent.subtitle}
                  </p>
                </div>

                {/* Editorial Metadata Cards */}
                <div className="flex flex-wrap gap-8 py-8 border-y border-white/5">
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Date</span>
                    <p className="text-white font-black text-xs uppercase tracking-widest">{currentHeroEvent.date}</p>
                  </div>
                  <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Time</span>
                    <p className="text-white font-black text-xs uppercase tracking-widest">{currentHeroEvent.time}</p>
                  </div>
                  <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Venue</span>
                    <p className="text-white font-black text-xs uppercase tracking-widest max-w-[200px] truncate">{currentHeroEvent.venue}</p>
                  </div>
                </div>

                {/* Primary CTA Group */}
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <button
                    onClick={() => currentHeroEvent.isAdvertiseOnly ? onSelectEvent(currentHeroEvent) : onBookNow(currentHeroEvent)}
                    className="group relative w-full sm:w-auto px-10 py-4 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-black text-[11px] uppercase tracking-[0.2em] transition-all duration-500 shadow-2xl shadow-[#D4AF37]/20 active:scale-95"
                  >
                    <span className="relative z-10">
                      {currentHeroEvent.isAdvertiseOnly ? "View Event Details" : `Book Now • From ${formatINR(currentHeroEvent.startingPrice)}`}
                    </span>
                  </button>
                  <button
                    onClick={() => onSelectEvent(currentHeroEvent)}
                    className="w-full sm:w-auto px-10 py-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-white border border-white/10 font-black text-[11px] uppercase tracking-[0.2em] transition-all duration-500 active:scale-95"
                  >
                    Save This Event
                  </button>
                </div>

                {/* Integrated Categories Filter */}
                <div className="pt-10 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em]">Explore Categories</span>
                  </div>
                  <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                    {categories.map((cat) => (
                      <CategoryChip
                        key={cat}
                        category={cat}
                        activeCategory={selectedCategory}
                        onSelectCategory={(c) => {
                          setSelectedCategory(c);
                          if (c !== 'all') onNavigateToSearch(c);
                        }}
                        count={cat === 'all' ? events.length : events.filter((e) => e.category === cat).length}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Artist Portrait / Poster Focal Point */}
              <div className="hidden lg:flex justify-center items-center animate-in fade-in zoom-in duration-1000 delay-300">
                <div className="relative w-full max-w-md aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700">
                  <img
                    src={currentHeroEvent.posterUrl}
                    alt="Featured Artist"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070707]/80 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-6 h-6 rounded-full border border-[#070707] bg-gray-800" />
                        ))}
                      </div>
                      <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">4.9/5 Rating</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl space-y-8 py-20">
              <span className="text-[#D4AF37] text-[11px] font-black uppercase tracking-[0.4em]">Ash-vish Events</span>
              <h1 className="text-5xl sm:text-7xl text-white font-black tracking-tight leading-none">
                Curating the next big experience
              </h1>
              <p className="text-gray-500 text-lg font-medium border-l-2 border-white/10 pl-6">
                Our team is currently preparing new live musical nights and premium events. Check back soon for official ticket releases.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ----------------- WHY YOU SHOULDN'T MISS IT ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-16">
          <div className="space-y-3">
            <span className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.4em]">Highlights</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
              Why You Shouldn't Miss It
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-10">
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
              <div key={i} className="group space-y-6">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center group-hover:border-[#D4AF37]/30 transition-all duration-500">
                  <feature.icon className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-lg font-black text-white uppercase tracking-wider">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed font-medium">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------- ABOUT THE EVENT SECTION ----------------- */}
      {currentHeroEvent && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-20 items-start">
            <div className="lg:col-span-2 space-y-10">
              <div className="space-y-3">
                <span className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.4em]">The Experience</span>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">About The Event</h2>
              </div>
              <div className="max-w-2xl text-gray-500 leading-relaxed text-lg font-medium space-y-6">
                <p>
                  Experience the magic of live music with Ash-vish Events. Our productions are designed to transport you into a world of rhythm and melody, featuring top-tier artists and world-class sound engineering at Kolhapur's most prestigious venues.
                </p>
                <p>
                  Join us for an evening that celebrates the rich heritage of Bollywood music, reimagined for a modern audience. From soulful ballads to high-energy anthems, every moment is crafted to perfection.
                </p>
              </div>
            </div>

            <div className="p-10 rounded-3xl bg-white/[0.02] border border-white/5 space-y-10">
              <div className="space-y-8">
                <div className="space-y-2">
                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em]">Organized By</span>
                  <p className="text-white font-black text-lg uppercase tracking-widest">Ash-vish Events</p>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em]">Event Type</span>
                  <p className="text-[#D4AF37] font-black text-lg uppercase tracking-widest">{currentHeroEvent.category}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.3em]">Venue Details</span>
                  <p className="text-white font-bold text-sm leading-relaxed">{currentHeroEvent.venue}</p>
                </div>
              </div>
              <button className="w-full py-4 rounded-xl border border-white/10 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white/5 transition-all duration-500">
                Add to Calendar
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ----------------- TRENDING EVENTS ROW ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <div className="space-y-2">
            <span className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.4em]">Curated Picks</span>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Trending Events
            </h2>
          </div>


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
