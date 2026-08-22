import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
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

  const [selectedCategory, setSelectedCategory] =
    useState<EventCategory | 'all'>('all');

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
        event.status !== 'archived' &&
        event.isEventPublic !== false
    );
  }, [events]);

  const featuredEvents = useMemo(
    () => publicEvents.filter((event) => event.isFeatured),
    [publicEvents]
  );

  const heroEvents = featuredEvents.length ? featuredEvents : publicEvents;

  const currentHeroEvent =
    heroEvents.length > 0
      ? heroEvents[Math.min(heroIndex, heroEvents.length - 1)]
      : undefined;

  const trendingEvents = useMemo(
    () =>
      publicEvents
        .filter((event) => event.isTrending)
        .slice(0, 8),
    [publicEvents]
  );

  const popularEvents = useMemo(
    () =>
      publicEvents
        .filter((event) => event.isPopularThisWeek)
        .slice(0, 8),
    [publicEvents]
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

  const scrollRow = (
    rowId: string,
    direction: 'left' | 'right'
  ) => {
    const container = document.getElementById(rowId);

    if (!container) return;

    container.scrollBy({
      left: direction === 'left' ? -420 : 420,
      behavior: 'smooth',
    });
  };

  const handleCategorySelect = (
    category: EventCategory | 'all'
  ) => {
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
      <main className="min-h-screen bg-[#070707] text-white">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#101010] px-6 py-16 sm:px-10 lg:px-16">
            <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-[#D4AF37]/10 blur-3xl" />

            <div className="relative max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F3E5AB]">
                <Sparkles className="h-3.5 w-3.5" />
                Ash-vish Events
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Something exciting
                <span className="block text-[#D4AF37]">
                  is coming soon.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-gray-400 sm:text-base">
                We are preparing upcoming concerts, comedy nights,
                theatre shows, sports events and more.
              </p>

              <button
                onClick={() => onNavigateToSearch('all')}
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3.5 text-sm font-bold text-black transition hover:bg-[#E2C45A]"
              >
                Explore Events
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  /*
   * ------------------------------------------------------------
   * MAIN PAGE
   * ------------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-[#070707] pb-20 text-white">

      {/* ======================================================
          HERO
      ====================================================== */}

      <section className="px-3 pt-3 sm:px-5 lg:px-6">
        <div className="relative mx-auto min-h-[640px] max-w-[1500px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b0b] sm:min-h-[680px]">

          {/* Background */}
          <img
            src={currentHeroEvent.coverUrl || currentHeroEvent.posterUrl}
            alt={currentHeroEvent.title}
            className="absolute inset-0 h-full w-full object-cover object-center"
            fetchPriority="high"
            decoding="async"
          />

          {/* Image treatment */}
          <div className="absolute inset-0 bg-black/20" />

          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/20" />

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

          {/* Subtle vignette */}
          <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.75)]" />

          {/* Content */}
          <div className="relative z-10 flex min-h-[640px] items-end sm:min-h-[680px]">

            <div className="w-full px-5 pb-10 sm:px-10 sm:pb-14 lg:px-16 lg:pb-16">

              <div className="max-w-3xl">

                {/* Category */}
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-black/35 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F3E5AB] backdrop-blur-md sm:text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Featured Event
                </div>

                {/* Title */}
                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl">
                  {currentHeroEvent.title}
                </h1>

                {/* Subtitle */}
                {currentHeroEvent.subtitle && (
                  <p className="mt-5 max-w-2xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7">
                    {currentHeroEvent.subtitle}
                  </p>
                )}

                {/* Meta */}
                <div className="mt-7 flex flex-wrap gap-2.5">

                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-md sm:text-sm">
                    <Calendar className="h-4 w-4 text-[#D4AF37]" />
                    <span>
                      {currentHeroEvent.date}
                    </span>
                    <span className="text-white/40">•</span>
                    <span>
                      {currentHeroEvent.time}
                    </span>
                  </div>

                  <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-md sm:text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <span className="truncate">
                      {currentHeroEvent.venue}
                    </span>
                  </div>

                  {currentHeroEvent.rating && (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-md sm:text-sm">
                      <Star className="h-4 w-4 fill-[#D4AF37] text-[#D4AF37]" />
                      {currentHeroEvent.rating}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">

                  <button
                    onClick={() =>
                      currentHeroEvent.isAdvertiseOnly
                        ? onSelectEvent(currentHeroEvent)
                        : onBookNow(currentHeroEvent)
                    }
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-7 text-sm font-black text-black shadow-[0_12px_40px_rgba(212,175,55,0.2)] transition hover:bg-[#E3C456] active:scale-[0.98] sm:text-base"
                  >
                    {currentHeroEvent.isAdvertiseOnly ? (
                      <Info className="h-5 w-5" />
                    ) : (
                      <Ticket className="h-5 w-5" />
                    )}

                    {currentHeroEvent.isAdvertiseOnly
                      ? 'View Event Details'
                      : `Book Now · ${formatINR(
                          currentHeroEvent.startingPrice
                        )}`}
                  </button>

                  <button
                    onClick={() =>
                      onSelectEvent(currentHeroEvent)
                    }
                    className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-white/20 bg-white/5 px-7 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/10 sm:text-base"
                  >
                    View Event
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Carousel Controls */}
          {heroEvents.length > 1 && (
            <div className="absolute bottom-6 right-5 z-20 flex items-center gap-2 sm:bottom-8 sm:right-8">

              <button
                type="button"
                onClick={() =>
                  setHeroIndex(
                    (prev) =>
                      (prev - 1 + heroEvents.length) %
                      heroEvents.length
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
                aria-label="Previous featured event"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
                {heroEvents.map((event, index) => (
                  <button
                    key={event.id}
                    type="button"
                    aria-label={`Go to featured event ${index + 1}`}
                    aria-current={index === heroIndex}
                    onClick={() => setHeroIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === heroIndex
                        ? 'w-7 bg-[#D4AF37]'
                        : 'w-1.5 bg-white/35'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setHeroIndex(
                    (prev) =>
                      (prev + 1) % heroEvents.length
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
                aria-label="Next featured event"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

            </div>
          )}
        </div>
      </section>

      {/* ======================================================
          CATEGORY NAV
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-12 sm:px-6 lg:px-8 lg:pt-16">

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
              Discover
            </p>

            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Find your next experience
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Browse concerts, comedy, sports, theatre and more.
            </p>
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
                    : publicEvents.filter(
                        (event) =>
                          event.category === category
                      ).length
                }
              />
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================
          TRENDING
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
          onNavigate={() =>
            onNavigateToSearch('all')
          }
          scrollRow={scrollRow}
        />
      )}

      {/* ======================================================
          POPULAR
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
          onNavigate={() =>
            onNavigateToSearch('all')
          }
          scrollRow={scrollRow}
        />
      )}

      {/* ======================================================
          BROWSE BY CATEGORY
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-12 sm:px-6 lg:px-8 lg:pt-16">

        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
            Explore
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Browse by experience
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          <CategoryFeature
            label="Music"
            title="Live Concerts"
            description="Discover live music, touring artists and unforgettable nights."
            count={
              publicEvents.filter(
                (event) => event.category === 'concert'
              ).length
            }
            onClick={() => onNavigateToSearch('concert')}
          />

          <CategoryFeature
            label="Comedy"
            title="Standup & Comedy"
            description="Find the funniest live shows happening near you."
            count={
              publicEvents.filter(
                (event) => event.category === 'comedy'
              ).length
            }
            onClick={() => onNavigateToSearch('comedy')}
          />

          <CategoryFeature
            label="Sports"
            title="Live Sports"
            description="Experience stadium events, tournaments and matches."
            count={
              publicEvents.filter(
                (event) => event.category === 'sports'
              ).length
            }
            onClick={() => onNavigateToSearch('sports')}
          />

        </div>
      </section>

      {/* ======================================================
          FINAL CTA
      ====================================================== */}

      <section className="mx-auto max-w-[1320px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20">

        <div className="relative overflow-hidden rounded-[28px] border border-[#D4AF37]/15 bg-gradient-to-br from-[#15120a] via-[#0f0f0f] to-[#080808] px-6 py-12 sm:px-10 lg:px-14">

          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-3xl" />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">

            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
                Ash-vish Events
              </p>

              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                Your next great night starts here.
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-400">
                Explore upcoming events and book your tickets
                in just a few clicks.
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

    </main>
  );
};

/* ============================================================
   EVENT RAIL
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
  scrollRow: (
    id: string,
    direction: 'left' | 'right'
  ) => void;
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
            <h2 className="text-xl font-black tracking-tight sm:text-2xl">
              {title}
            </h2>

            <p className="mt-1 text-xs text-gray-400 sm:text-sm">
              {subtitle}
            </p>
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
   CATEGORY FEATURE
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
      className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-[#101010] p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/30 hover:bg-[#141414]"
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-[#D4AF37]/5 blur-3xl transition group-hover:bg-[#D4AF37]/10" />

      <div className="relative">

        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
          {label}
        </p>

        <h3 className="mt-2 text-xl font-black">
          {title}
        </h3>

        <p className="mt-3 max-w-sm text-sm leading-6 text-gray-400">
          {description}
        </p>

        <div className="mt-6 flex items-center justify-between">

          <span className="text-xs font-semibold text-gray-500">
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
