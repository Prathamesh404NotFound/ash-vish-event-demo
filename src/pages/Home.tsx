import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Info,
  MapPin,
  Sparkles,
  Star,
  Ticket,
} from 'lucide-react';

import { EventItem, EventCategory } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { EventCard } from '../components/EventCard';
import { CategoryChip } from '../components/CategoryChip';
import { formatINR } from '../utils/formatters';
import { useSEO } from '../hooks/useSEO';
import { generateOrganizationSchema } from '../utils/structuredData';
import { getCategoryBadgeText } from '../config/categoryConfig';
import { Button } from '../components/Button';

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
  const { events, favorites, toggleFavorite, showToast } = useBooking();
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all');
  const [heroIndex, setHeroIndex] = useState(0);

  useSEO({
    title: 'Best Event Organisers in Kolhapur, Maharashtra & India',
    description:
      'Book official tickets for concerts, standup comedy, stadium events, and theatre in Kolhapur & across Maharashtra. Ash-vish Events — trusted event organisers with instant QR-code digital entry.',
    keywords:
      'event organisers kolhapur, events in kolhapur, book tickets kolhapur, concert tickets maharashtra, event management kolhapur, best event organisers india, ash-vish events, digital qr ticket, live concerts kolhapur, standup comedy kolhapur, wedding events kolhapur, corporate events kolhapur',
    structuredData: generateOrganizationSchema(),
  });

  /*
   * ------------------------------------------------------------
   * DATA
   * ------------------------------------------------------------
   */

  const publicEvents = useMemo(() => {
    return events.filter(
      (event) =>
        event &&
        typeof event === 'object' &&
        event.title &&
        (event.posterUrl || event.coverUrl) &&
        typeof event.status === 'string' &&
        event.status !== 'draft' &&
        event.status !== 'cancelled' &&
        event.status !== 'completed' &&
        event.isEventPublic !== false
    );
  }, [events]);

  const featuredEvents = useMemo(
    () => publicEvents.filter((event) => event.isFeatured),
    [publicEvents]
  );

  // No fallback event - only show real events from the database
  // Previously there was a hardcoded "Sufiyana Shaam" placeholder, but that's now removed
  // to ensure users only see actual event data

  const heroEvents = featuredEvents.length ? featuredEvents : publicEvents;

  // Auto-advance hero carousel every 6 seconds
  React.useEffect(() => {
    if (heroEvents.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroEvents.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroEvents.length]);

  const currentHeroEvent: EventItem | undefined =
    heroEvents.length > 0
      ? heroEvents[Math.min(heroIndex, heroEvents.length - 1)]
      : undefined; // No fallback - only show real events

  const isSaved = currentHeroEvent ? favorites.includes(currentHeroEvent.id) : false;

  const trendingEvents = useMemo(
    () => publicEvents.filter((event) => event.isTrending).slice(0, 8),
    [publicEvents]
  );

  const trendingIds = useMemo(() => new Set(trendingEvents.map((e) => e.id)), [trendingEvents]);

  const popularEvents = useMemo(
    () => publicEvents.filter((event) => event.isPopularThisWeek && !trendingIds.has(event.id)).slice(0, 8),
    [publicEvents, trendingIds]
  );

  const popularIds = useMemo(() => new Set(popularEvents.map((e) => e.id)), [popularEvents]);

  const musicEvents = useMemo(
    () => publicEvents.filter((e) => e.category === 'concert' && !trendingIds.has(e.id) && !popularIds.has(e.id)),
    [publicEvents, trendingIds, popularIds]
  );

  const categories: (EventCategory | 'all')[] = [
    'all',
    'concert',
    'comedy',
    'sports',
    'theatre',
    'festival',
  ];

  /*
   * ------------------------------------------------------------
   * HELPERS
   * ------------------------------------------------------------
   */

  const scrollRow = (rowId: string, direction: 'left' | 'right') => {
    const container = document.getElementById(rowId);
    if (!container) return;
    container.scrollBy({
      left: direction === 'left' ? -420 : 420,
      behavior: 'smooth',
    });
  };

  const handleCategorySelect = (category: EventCategory | 'all') => {
    setSelectedCategory(category);
    if (category !== 'all') {
      onNavigateToSearch(category);
    }
  };



  /*
   * ------------------------------------------------------------
   * EMPTY STATE
   * ------------------------------------------------------------
   */

  if (!currentHeroEvent) {
    return (
      <div className="min-h-screen bg-[#070707] text-white" role="main">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0D0D10] px-6 py-16 sm:px-10 lg:px-16">
            <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-[#D4AF37]/10 blur-3xl" />

            <div className="relative max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F3E5AB]">
                <Sparkles className="h-3.5 w-3.5" />
                Ash-vish Events
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Something exciting
                <span className="block text-[#D4AF37]">is coming soon.</span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-gray-400 sm:text-base">
                We are preparing upcoming concerts, comedy nights, theatre shows, sports events and more.
              </p>

              <Button
                onClick={() => onNavigateToSearch('all')}
                size="lg"
                className="mt-8"
              >
                Explore Events
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /*
   * ------------------------------------------------------------
   * MAIN PAGE
   * ------------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-[#070707] pb-16 sm:pb-20 text-white">

      {/* ======================================================
          1. HERO SECTION
      ====================================================== */}

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="bg-[#0D0D10] border border-white/10 rounded-3xl sm:rounded-[32px] overflow-hidden p-4 sm:p-8 lg:p-12 shadow-2xl relative">

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">

            {/* LEFT COLUMN: Editorial & Event Information */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6 sm:space-y-8 z-10">

              {/* Eyebrow Category Label */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[11px] font-semibold tracking-wider uppercase">
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                  {getCategoryBadgeText(currentHeroEvent.category)}
                </span>
              </div>

              {/* Event Title & Subtitle */}
              <div className="space-y-3">
                <h1 className="font-heading font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.15] text-balance">
                  {currentHeroEvent.title}
                </h1>
                <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-xl font-normal">
                  {currentHeroEvent.subtitle || currentHeroEvent.description}
                </p>
              </div>

              {/* Metadata 3-Item Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#141414]/90 border border-white/10 shadow-inner">
                {/* DATE */}
                <div className="flex items-center gap-3 px-2 py-1.5">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C1C] border border-white/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Date</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate block">
                      {currentHeroEvent.date || 'Date TBD'}
                    </span>
                  </div>
                </div>

                {/* TIME */}
                <div className="flex items-center gap-3 px-2 py-1.5 sm:border-l sm:border-white/10">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C1C] border border-white/10 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Time</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate block">
                      {currentHeroEvent.time || 'Time TBD'}
                    </span>
                  </div>
                </div>

                {/* VENUE */}
                <div className="flex items-center gap-3 px-2 py-1.5 sm:border-l sm:border-white/10">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C1C] border border-white/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Venue</span>
                    <span
                      className="text-xs sm:text-sm font-semibold text-gray-100 truncate block"
                      title={currentHeroEvent.venue}
                    >
                      {currentHeroEvent.venue || 'Venue TBD'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                {/* Primary CTA */}
                <button
                  onClick={() =>
                    currentHeroEvent.isAdvertiseOnly
                      ? onSelectEvent(currentHeroEvent)
                      : onBookNow(currentHeroEvent)
                  }
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-7 text-sm font-black text-black  transition hover:bg-[#E3C456] active:scale-[0.98] sm:text-base"
                >
                  {currentHeroEvent.isAdvertiseOnly ? (
                    <Info className="h-5 w-5" />
                  ) : (
                    <Ticket className="h-5 w-5" />
                  )}
                  {currentHeroEvent.isAdvertiseOnly
                    ? 'View Event Details'
                    : `Book Now · ${formatINR(currentHeroEvent.startingPrice)}`}
                </button>

                {/* Secondary: Save Event */}
                <button
                  onClick={() => {
                    toggleFavorite(currentHeroEvent.id);
                    showToast(isSaved ? 'Removed from saved shows' : 'Saved to your shows', 'success');
                  }}
                  className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-7 text-sm font-bold transition sm:text-base ${
                    isSaved
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : 'bg-white/5 border-white/20 text-white backdrop-blur-md hover:bg-white/10'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isSaved ? 'fill-red-400 text-red-400' : 'text-gray-400'}`} />
                  <span>{isSaved ? 'Saved' : 'Save Event'}</span>
                </button>

                {/* Tertiary: View Event Info */}
                <button
                  onClick={() => onSelectEvent(currentHeroEvent)}
                  className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-white/20 bg-white/5 px-7 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/10 sm:text-base"
                >
                  View Event
                </button>
              </div>

              {/* Carousel Indicators */}
              {heroEvents.length > 1 && (
                <div className="flex items-center gap-3 pt-2" role="tablist" aria-label="Featured show carousel">
                  <button
                    type="button"
                    onClick={() =>
                      setHeroIndex((prev) => (prev - 1 + heroEvents.length) % heroEvents.length)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
                    aria-label="Previous featured event"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {heroEvents.map((event, index) => (
                      <button
                        key={event.id}
                        type="button"
                        role="tab"
                        aria-selected={index === heroIndex}
                        aria-label={`Go to featured event ${index + 1}`}
                        onClick={() => setHeroIndex(index)}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          index === heroIndex ? 'w-7 bg-[#D4AF37]' : 'w-1.5 bg-white/35 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setHeroIndex((prev) => (prev + 1) % heroEvents.length)
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
                    aria-label="Next featured event"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Dominant Artist / Event Poster Artwork */}
            <div className="lg:col-span-5 relative flex items-center justify-center">
              <div className="relative w-full max-w-md mx-auto aspect-[4/5] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#141414] group">
                <img
                  src={currentHeroEvent.posterUrl || currentHeroEvent.coverUrl || ''}
                  alt={currentHeroEvent.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out filter brightness-[0.95] contrast-[1.05]"
                  fetchPriority="high"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />

                {/* Soft gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Bottom tag */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                  <span className="text-[11px] font-semibold text-gray-200 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10">
                    {currentHeroEvent.organizer || 'Ash-vish Events'}
                  </span>
                  <span className="text-[11px] font-bold text-[#F3E5AB] bg-[#D4AF37]/20 backdrop-blur-md px-2.5 py-1 rounded-lg border border-[#D4AF37]/30">
                    ★ {currentHeroEvent.rating || '4.9'}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>


      {/* ======================================================
          4. CATEGORY NAV
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Discover</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Find your next experience</h2>
            <p className="mt-2 text-sm text-gray-400">Browse concerts, comedy, sports, theatre and more.</p>
          </div>

          <button
            onClick={() => onNavigateToSearch('all')}
            className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] transition hover:text-[#F3E5AB]"
          >
            View all events
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex min-w-max gap-2.5">
            {categories.map((category) => (
              <CategoryChip
                key={category}
                category={category}
                activeCategory={selectedCategory}
                onSelectCategory={handleCategorySelect}
                count={
                  category === 'all'
                    ? publicEvents.length
                    : publicEvents.filter((event) => event.category === category).length
                }
              />
            ))}
          </div>
        </div>
      </section>


      {/* ======================================================
          5. TRENDING
      ====================================================== */}

      {trendingEvents.length > 0 && (
        <EventRail
          id="row-trending"
          title="Trending right now"
          subtitle="Popular events people are booking"
          icon={<Flame className="h-5 w-5" />}
          events={trendingEvents}
          onSelectEvent={onSelectEvent}
          onBookNow={onBookNow}
          onNavigate={() => onNavigateToSearch('all')}
          scrollRow={scrollRow}
        />
      )}


      {/* ======================================================
          6. POPULAR THIS WEEK
      ====================================================== */}

      {popularEvents.length > 0 && (
        <EventRail
          id="row-popular"
          title="Popular this week"
          subtitle="Highly rated events worth checking out"
          icon={<Star className="h-5 w-5" />}
          events={popularEvents}
          onSelectEvent={onSelectEvent}
          onBookNow={onBookNow}
          onNavigate={() => onNavigateToSearch('all')}
          scrollRow={scrollRow}
        />
      )}


      {/* ======================================================
          7. LIVE MUSIC & CONCERTS
      ====================================================== */}

      {musicEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-white">
              Live Music & Concerts
            </h2>

            <button
              onClick={() => onNavigateToSearch('concert')}
              className="text-xs font-semibold text-[#D4AF37] hover:underline"
            >
              See All ({musicEvents.length})
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {musicEvents.slice(0, 3).map((evt) => (
              <EventCard
                key={evt.id}
                event={evt}
                onSelectEvent={onSelectEvent}
                onBookNow={onBookNow}
              />
            ))}
          </div>
        </section>
      )}


      {/* ======================================================
          8. BROWSE BY CATEGORY FEATURE CARDS
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Explore</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Browse by experience</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CategoryFeature
            label="Music"
            title="Live Concerts"
            description="Discover live music, touring artists and unforgettable nights."
            count={publicEvents.filter((event) => event.category === 'concert').length}
            onClick={() => onNavigateToSearch('concert')}
          />
          <CategoryFeature
            label="Comedy"
            title="Standup & Comedy"
            description="Find the funniest live shows happening near you."
            count={publicEvents.filter((event) => event.category === 'comedy').length}
            onClick={() => onNavigateToSearch('comedy')}
          />
          <CategoryFeature
            label="Sports"
            title="Live Sports"
            description="Experience stadium events, tournaments and matches."
            count={publicEvents.filter((event) => event.category === 'sports').length}
            onClick={() => onNavigateToSearch('sports')}
          />
        </div>
      </section>


      {/* ======================================================
          9. FINAL CTA BANNER
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="relative overflow-hidden rounded-[28px] border border-[#D4AF37]/15 bg-gradient-to-br from-[#141414] via-[#0D0D10] to-[#070707] px-6 py-12 sm:px-10 lg:px-14">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-3xl" />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Ash-vish Events</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Your next great night starts here.</h2>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                Explore upcoming events and book your tickets in just a few clicks.
              </p>
            </div>

            <button
              onClick={() => onNavigateToSearch('all')}
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 text-sm font-black text-black transition hover:bg-[#E3C456]"
            >
              Explore All Events
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};


/* ============================================================
   EVENT RAIL SUB-COMPONENT
   ============================================================ */

interface EventRailProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
  onBookNow: (event: EventItem) => void;
  onNavigate: () => void;
  scrollRow: (id: string, direction: 'left' | 'right') => void;
}

const EventRail: React.FC<EventRailProps> = ({
  id,
  title,
  subtitle,
  icon,
  events,
  onSelectEvent,
  onBookNow,
  onNavigate,
  scrollRow,
}) => {
  return (
    <section className="mx-auto max-w-[1320px] px-4 pt-12 sm:px-6 lg:px-8 lg:pt-16">

      <div className="mb-6 flex items-end justify-between gap-4">

        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/10 text-[#D4AF37]">
            {icon}
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight sm:text-2xl">{title}</h2>
            <p className="mt-1 text-xs text-gray-400 sm:text-sm">{subtitle}</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollRow(id, 'left')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 transition hover:bg-white/[0.07] hover:text-white"
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => scrollRow(id, 'right')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 transition hover:bg-white/[0.07] hover:text-white"
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

      </div>

      <div
        id={id}
        className="flex gap-4 overflow-x-auto pb-3 no-scrollbar snap-x snap-mandatory"
      >
        {events.map((event) => (
          <div
            key={event.id}
            className="w-[260px] shrink-0 snap-start sm:w-[290px] lg:w-[300px]"
          >
            <EventCard
              event={event}
              onSelectEvent={onSelectEvent}
              onBookNow={onBookNow}
            />
          </div>
        ))}
      </div>

      <div className="mt-5">
        <button
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-xs font-bold text-[#D4AF37] transition hover:text-[#F3E5AB]"
        >
          Explore more
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

    </section>
  );
};


/* ============================================================
   CATEGORY FEATURE SUB-COMPONENT
   ============================================================ */

interface CategoryFeatureProps {
  label: string;
  title: string;
  description: string;
  count: number;
  onClick: () => void;
}

const CategoryFeature: React.FC<CategoryFeatureProps> = ({
  label,
  title,
  description,
  count,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-[#0D0D10] p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/30 hover:bg-[#141414]"
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-[#D4AF37]/5 blur-3xl transition group-hover:bg-[#D4AF37]/10" />

      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">{label}</p>
        <h3 className="mt-2 text-xl font-black">{title}</h3>
        <p className="mt-3 max-w-sm text-sm leading-6 text-gray-400">{description}</p>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400">
            {count} {count === 1 ? 'event' : 'events'}
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-gray-400 transition group-hover:border-[#D4AF37]/20 group-hover:bg-[#D4AF37]/10 group-hover:text-[#D4AF37]">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
};
