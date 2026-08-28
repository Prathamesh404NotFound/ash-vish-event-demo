import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Heart,
  Info,
  MapPin,
  Music2,
  Sparkles,
  Star,
  Ticket,
  Users2,
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
        event.status !== 'archived' &&
        event.isEventPublic !== false
    );
  }, [events]);

  const featuredEvents = useMemo(
    () => publicEvents.filter((event) => event.isFeatured),
    [publicEvents]
  );

  // Fallback featured event if none in database yet
  const fallbackHeroEvent: EventItem = {
    id: 'sufiyana-shaam-2026',
    title: 'Sufiyana Shaam A Bollywood Musical Night',
    subtitle:
      'An enchanting evening of timeless melodies, soulful sufi rhythms, and live orchestral brilliance.',
    category: 'concert',
    date: '06 Sep 2026',
    time: '08:00 PM',
    venue: 'Megh Malhar Hall, The Sayaji, Kolhapur',
    address: 'Sayaji Hotel, Kawala Naka, Kolhapur',
    city: 'Kolhapur',
    startingPrice: 499,
    posterUrl: '/sufiyana-shaam-poster.jpg',
    coverUrl: '/sufiyana-shaam-poster.jpg',
    organizer: 'Ash-vish Events',
    description:
      'Step into an immersive musical sanctuary where the mystique of authentic Sufi traditions harmoniously meets the grandeur of classic and contemporary Bollywood compositions. Featuring celebrated vocalists, live harmonium, acoustic percussion, and a grand orchestral ensemble, this signature production is designed for connoisseurs of pristine sound and soulful melodies.',
    artists: [
      { id: '1', name: 'Aishwarya & Vishwajeet', role: 'Lead Vocalists', image: '/favicon-192.png' },
      { id: '2', name: 'Symphony Ensemble', role: 'Live Orchestra', image: '/favicon-192.png' },
    ],
    ticketTiers: [
      {
        id: 'silver',
        name: 'Silver Pass',
        price: 499,
        description: 'Access to general seating',
        totalInventory: 200,
        remainingInventory: 140,
        perks: ['Entry pass', 'Free parking'],
      },
      {
        id: 'gold',
        name: 'Gold Pass',
        price: 999,
        description: 'Prime mid-hall acoustic seating',
        totalInventory: 150,
        remainingInventory: 85,
        perks: ['Prime seating', 'Complimentary beverage', 'Express entry'],
      },
      {
        id: 'vip',
        name: 'VIP Lounge',
        price: 1999,
        description: 'Front-row luxury experience',
        totalInventory: 50,
        remainingInventory: 18,
        perks: ['Front row seats', 'Meet & Greet', 'VIP lounge access', 'Complimentary gourmet snacks'],
      },
    ],
    gallery: ['/sufiyana-shaam-poster.jpg'],
    faqs: [
      { question: 'What is the dress code?', answer: 'Smart casual or traditional festive attire is recommended.' },
      { question: 'Is parking available?', answer: 'Yes, valet and self-parking are available at The Sayaji.' },
    ],
    isFeatured: true,
    isTrending: true,
    isPopularThisWeek: true,
    rating: 4.9,
    reviewsCount: 128,
    status: 'published',
  };

  const heroEvents = featuredEvents.length ? featuredEvents : publicEvents;

  const currentHeroEvent: EventItem | undefined =
    heroEvents.length > 0
      ? heroEvents[Math.min(heroIndex, heroEvents.length - 1)]
      : publicEvents[0] || fallbackHeroEvent;

  const isSaved = currentHeroEvent ? favorites.includes(currentHeroEvent.id) : false;

  const trendingEvents = useMemo(
    () => publicEvents.filter((event) => event.isTrending).slice(0, 8),
    [publicEvents]
  );

  const popularEvents = useMemo(
    () => publicEvents.filter((event) => event.isPopularThisWeek).slice(0, 8),
    [publicEvents]
  );

  const musicEvents = useMemo(
    () => publicEvents.filter((e) => e.category === 'concert'),
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

  const handleAddToCalendar = () => {
    if (!currentHeroEvent) return;
    const title = encodeURIComponent(currentHeroEvent.title);
    const details = encodeURIComponent(
      `${currentHeroEvent.subtitle || currentHeroEvent.description}\n\nOrganized by: ${currentHeroEvent.organizer || 'Ash-vish Events'}`
    );
    const location = encodeURIComponent(currentHeroEvent.venue || 'Sayaji Hotel, Kolhapur');
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    window.open(googleCalUrl, '_blank', 'noopener,noreferrer');
    showToast('Opening Google Calendar...', 'info');
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
                <span className="block text-[#D4AF37]">is coming soon.</span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-7 text-gray-400 sm:text-base">
                We are preparing upcoming concerts, comedy nights, theatre shows, sports events and more.
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
          1. HERO SECTION
      ====================================================== */}

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="bg-[#0D0D10] border border-white/10 rounded-3xl sm:rounded-[32px] overflow-hidden p-6 sm:p-10 lg:p-12 shadow-2xl relative">

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

            {/* LEFT COLUMN: Editorial & Event Information */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6 sm:space-y-8 z-10">

              {/* Eyebrow Category Label */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[11px] font-semibold tracking-wider uppercase">
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                  {currentHeroEvent.category === 'concert'
                    ? 'LIVE MUSICAL NIGHT'
                    : `${currentHeroEvent.category.toUpperCase()} SHOW`}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#141418]/90 border border-white/10 shadow-inner">
                {/* DATE */}
                <div className="flex items-center gap-3 px-2 py-1.5">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C22] border border-white/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Date</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate block">
                      {currentHeroEvent.date || '06 Sep 2026'}
                    </span>
                  </div>
                </div>

                {/* TIME */}
                <div className="flex items-center gap-3 px-2 py-1.5 sm:border-l sm:border-white/10">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C22] border border-white/10 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Time</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate block">
                      {currentHeroEvent.time || '08:00 PM'}
                    </span>
                  </div>
                </div>

                {/* VENUE */}
                <div className="flex items-center gap-3 px-2 py-1.5 sm:border-l sm:border-white/10">
                  <div className="w-8 h-8 rounded-xl bg-[#1C1C22] border border-white/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Venue</span>
                    <span
                      className="text-xs sm:text-sm font-semibold text-gray-100 truncate block"
                      title={currentHeroEvent.venue}
                    >
                      {currentHeroEvent.venue || 'Sayaji Hotel, Kolhapur'}
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
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-7 text-sm font-black text-black shadow-[0_12px_40px_rgba(212,175,55,0.2)] transition hover:bg-[#E3C456] active:scale-[0.98] sm:text-base"
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
              <div className="relative w-full max-w-md mx-auto aspect-[4/5] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#141418] group">
                <img
                  src={currentHeroEvent.posterUrl || currentHeroEvent.coverUrl || '/sufiyana-shaam-poster.jpg'}
                  alt={currentHeroEvent.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out filter brightness-[0.95] contrast-[1.05]"
                  fetchPriority="high"
                  onError={(e) => {
                    e.currentTarget.src = '/sufiyana-shaam-poster.jpg';
                  }}
                />

                {/* Soft gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Bottom tag */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                  <span className="text-[11px] font-semibold text-gray-200 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10">
                    Official Ash-vish Production
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
          2. WHY YOU SHOULDN'T MISS IT
      ====================================================== */}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white tracking-tight">
            Why You Shouldn't Miss It
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-2">
            Curated live entertainment crafted for music lovers and culture enthusiasts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Music2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">Soulful Live Performance</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Timeless Bollywood melodies performed live with rich acoustic arrangements and vocal depth.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Users2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">Talented Artists</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                A team of passionate musicians bringing the music to life through authentic instruments and mastery.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">Unforgettable Evening</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Great music, atmosphere, and memories in a luxurious Sayaji ambiance crafted for a relaxing night.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* ======================================================
          3. ABOUT THE EVENT
      ====================================================== */}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
        <div className="bg-[#0D0D10] border border-white/10 rounded-3xl p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

            {/* Left: Editorial Description */}
            <div className="lg:col-span-7 space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                Experience Overview
              </span>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white">About The Event</h2>
              <div className="prose prose-invert max-w-none text-gray-300 text-sm sm:text-base leading-relaxed space-y-4 font-normal">
                <p>
                  {currentHeroEvent.description ||
                    'Step into an enchanting musical journey celebrating the finest sufi, ghazal, and retro Bollywood classics. Featuring celebrated vocalists and a live acoustic orchestra, this signature event by Ash-vish Events is designed for true lovers of pure melodies and refined live performances.'}
                </p>
                <p className="text-gray-400 text-xs sm:text-sm">
                  Hosted at the esteemed Megh Malhar Hall inside The Sayaji Kolhapur, guests will enjoy exceptional acoustics, comfortable seating, and seamless instant digital QR-code entry.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Instant QR Digital Pass</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Reserved Seating Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Dedicated Hospitality Team</span>
                </div>
              </div>
            </div>

            {/* Right: Key Event Facts & Calendar Action */}
            <div className="lg:col-span-5 bg-[#141418] border border-white/10 rounded-2xl p-6 space-y-5">
              <h3 className="font-heading font-bold text-base text-white border-b border-white/10 pb-3">
                Key Event Information
              </h3>

              <div className="space-y-3.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Organized by</span>
                  <span className="font-semibold text-white">{currentHeroEvent.organizer || 'Ash-vish Events'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Event Type</span>
                  <span className="font-semibold text-white">Live Musical Concert</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Language</span>
                  <span className="font-semibold text-white">Hindi & Sufi</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Age Suitability</span>
                  <span className="font-semibold text-white">All Ages / Family Friendly</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Location</span>
                  <span
                    className="font-semibold text-[#D4AF37] text-right truncate max-w-[200px]"
                    title={currentHeroEvent.venue}
                  >
                    {currentHeroEvent.venue}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex flex-col gap-2.5">
                <button
                  onClick={handleAddToCalendar}
                  className="w-full py-3 rounded-xl bg-[#1C1C22] hover:bg-[#25252D] border border-white/10 text-gray-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4 text-[#D4AF37]" />
                  <span>Add to Google Calendar</span>
                </button>

                <button
                  onClick={() => onSelectEvent(currentHeroEvent)}
                  className="w-full py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>Select Tickets & Seating</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
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
        <div className="relative overflow-hidden rounded-[28px] border border-[#D4AF37]/15 bg-gradient-to-br from-[#15120a] via-[#0f0f0f] to-[#080808] px-6 py-12 sm:px-10 lg:px-14">
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

    </main>
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
      className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-[#101010] p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/30 hover:bg-[#141414]"
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-[#D4AF37]/5 blur-3xl transition group-hover:bg-[#D4AF37]/10" />

      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37]">{label}</p>
        <h3 className="mt-2 text-xl font-black">{title}</h3>
        <p className="mt-3 max-w-sm text-sm leading-6 text-gray-400">{description}</p>

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
