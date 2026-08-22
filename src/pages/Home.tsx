import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Heart,
  ArrowRight,
  Flame,
  Star,
  Music2,
  Users2,
  Sparkles,
  Ticket,
  ChevronRight,
  ChevronLeft,
  CalendarPlus,
  Check
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
    title: 'Ash-vish Events — Discover & Book Live Concerts & Shows in Kolhapur',
    description: 'Experience premium live entertainment with Ash-vish Events. Book official tickets for Sufiyana Shaam, live Bollywood concerts, standup comedy, and theatre with instant digital entry.',
    keywords: 'sufiyana shaam, live concert kolhapur, sayaji kolhapur events, ash-vish events, book tickets kolhapur, live musical night',
    structuredData: generateOrganizationSchema(),
  });

  // Guard against incomplete records
  const wellFormedEvents = events.filter(
    (e) => e && typeof e === 'object' && e.title && (e.posterUrl || e.coverUrl) && typeof e.status === 'string'
  );
  const publicEvents = wellFormedEvents.filter((e) => e.status !== 'draft' && e.status !== 'archived' && e.isEventPublic !== false);
  const featuredEvents = publicEvents.filter((e) => e.isFeatured);

  // Fallback featured event if none in database yet
  const fallbackHeroEvent: EventItem = {
    id: 'sufiyana-shaam-2026',
    title: 'Sufiyana Shaam A Bollywood Musical Night',
    subtitle: 'An enchanting evening of timeless melodies, soulful sufi rhythms, and live orchestral brilliance.',
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
    description: 'Step into an immersive musical sanctuary where the mystique of authentic Sufi traditions harmoniously meets the grandeur of classic and contemporary Bollywood compositions. Featuring celebrated vocalists, live harmonium, acoustic percussion, and a grand orchestral ensemble, this signature production is designed for connoisseurs of pristine sound and soulful melodies.',
    artists: [
      { id: '1', name: 'Aishwarya & Vishwajeet', role: 'Lead Vocalists', image: '/favicon-192.png' },
      { id: '2', name: 'Symphony Ensemble', role: 'Live Orchestra', image: '/favicon-192.png' },
    ],
    ticketTiers: [
      { id: 'silver', name: 'Silver Pass', price: 499, description: 'Access to general seating', totalInventory: 200, remainingInventory: 140, perks: ['Entry pass', 'Free parking'] },
      { id: 'gold', name: 'Gold Pass', price: 999, description: 'Prime mid-hall acoustic seating', totalInventory: 150, remainingInventory: 85, perks: ['Prime seating', 'Complimentary beverage', 'Express entry'] },
      { id: 'vip', name: 'VIP Lounge', price: 1999, description: 'Front-row luxury experience', totalInventory: 50, remainingInventory: 18, perks: ['Front row seats', 'Meet & Greet', 'VIP lounge access', 'Complimentary gourmet snacks'] }
    ],
    gallery: ['/sufiyana-shaam-poster.jpg'],
    faqs: [
      { question: 'What is the dress code?', answer: 'Smart casual or traditional festive attire is recommended.' },
      { question: 'Is parking available?', answer: 'Yes, valet and self-parking are available at The Sayaji.' }
    ],
    isFeatured: true,
    isTrending: true,
    isPopularThisWeek: true,
    rating: 4.9,
    reviewsCount: 128,
    status: 'published'
  };

  const currentHeroEvent = featuredEvents.length > 0
    ? (featuredEvents[heroIndex] || featuredEvents[0])
    : (publicEvents[0] || fallbackHeroEvent);

  const isSaved = favorites.includes(currentHeroEvent.id);

  // Filtered lists for discovery sections
  const trendingEvents = publicEvents.filter((e) => e.isTrending);
  const popularEvents = publicEvents.filter((e) => e.isPopularThisWeek);
  const musicEvents = publicEvents.filter((e) => e.category === 'concert');

  const categories: (EventCategory | 'all')[] = ['all', 'concert', 'comedy', 'sports', 'theatre', 'festival'];

  const scrollRow = (rowId: string, direction: 'left' | 'right') => {
    const container = document.getElementById(rowId);
    if (container) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleAddToCalendar = () => {
    const title = encodeURIComponent(currentHeroEvent.title);
    const details = encodeURIComponent(`${currentHeroEvent.subtitle || currentHeroEvent.description}\n\nOrganized by: ${currentHeroEvent.organizer || 'Ash-vish Events'}`);
    const location = encodeURIComponent(currentHeroEvent.venue || 'Sayaji Hotel, Kolhapur');
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    window.open(googleCalUrl, '_blank', 'noopener,noreferrer');
    showToast('Opening Google Calendar...', 'info');
  };

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">

      {/* ----------------- 1. REFINED TWO-COLUMN HERO SECTION ----------------- */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="bg-[#0D0D10] border border-white/10 rounded-3xl sm:rounded-[32px] overflow-hidden p-6 sm:p-10 lg:p-12 shadow-2xl relative">

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

            {/* LEFT COLUMN: Editorial & Event Information */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6 sm:space-y-8 z-10">

              {/* Eyebrow Category Label */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[11px] font-semibold tracking-wider uppercase">
                  <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                  {currentHeroEvent.category === 'concert' ? 'LIVE MUSICAL NIGHT' : `${currentHeroEvent.category.toUpperCase()} SHOW`}
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
                    <span className="text-xs sm:text-sm font-semibold text-gray-100 truncate block" title={currentHeroEvent.venue}>
                      {currentHeroEvent.venue || 'Sayaji Hotel, Kolhapur'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                {/* Primary CTA */}
                <button
                  onClick={() => onSelectEvent(currentHeroEvent)}
                  className="px-6 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/20 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  <Ticket className="w-4 h-4" />
                  <span>View Event Details</span>
                  {currentHeroEvent.startingPrice ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-black/15 text-black ml-1">
                      From {formatINR(currentHeroEvent.startingPrice)}
                    </span>
                  ) : null}
                </button>

                {/* Secondary Action: Save Event */}
                <button
                  onClick={() => {
                    toggleFavorite(currentHeroEvent.id);
                    showToast(isSaved ? 'Removed from saved shows' : 'Saved to your shows', 'success');
                  }}
                  className={`px-5 py-3.5 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium cursor-pointer ${
                    isSaved
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : 'bg-[#141418] hover:bg-[#1C1C22] border-white/15 text-gray-300 hover:text-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isSaved ? 'fill-red-400 text-red-400' : 'text-gray-400'}`} />
                  <span>{isSaved ? 'Saved' : 'Save This Event'}</span>
                </button>
              </div>

              {/* Carousel Indicators (if multiple featured events) */}
              {featuredEvents.length > 1 && (
                <div className="flex items-center gap-2 pt-2" role="tablist" aria-label="Featured events">
                  {featuredEvents.map((_, idx) => (
                    <button
                      key={idx}
                      role="tab"
                      aria-selected={idx === heroIndex}
                      aria-label={`Slide ${idx + 1}`}
                      onClick={() => setHeroIndex(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        idx === heroIndex
                          ? 'w-8 bg-[#D4AF37]'
                          : 'w-2 bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  ))}
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

                {/* Subtle soft gradient overlay feathering at the bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Minimal bottom tag */}
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


      {/* ----------------- 2. "WHY YOU SHOULDN'T MISS IT" SECTION ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white tracking-tight">
            Why You Shouldn’t Miss It
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-2">
            Curated live entertainment crafted for music lovers and culture enthusiasts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Music2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">
                Soulful Live Performance
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Timeless Bollywood melodies performed live with rich acoustic arrangements and vocal depth.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Users2 className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">
                Talented Artists
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                A team of passionate musicians bringing the music to life through authentic instruments and mastery.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/30 transition-all duration-300 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#D4AF37]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading font-bold text-lg text-white">
                Unforgettable Evening
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                Great music, atmosphere, and memories in a luxurious Sayaji ambiance crafted for a relaxing night.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* ----------------- 3. "ABOUT THE EVENT" EDITORIAL & METADATA SECTION ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#0D0D10] border border-white/10 rounded-3xl p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

            {/* Left: Editorial Description */}
            <div className="lg:col-span-7 space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                Experience Overview
              </span>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl text-white">
                About The Event
              </h2>
              <div className="prose prose-invert max-w-none text-gray-300 text-sm sm:text-base leading-relaxed space-y-4 font-normal">
                <p>
                  {currentHeroEvent.description || 
                    "Step into an enchanting musical journey celebrating the finest sufi, ghazal, and retro Bollywood classics. Featuring celebrated vocalists and a live acoustic orchestra, this signature event by Ash-vish Events is designed for true lovers of pure melodies and refined live performances."}
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
                  <span className="font-semibold text-[#D4AF37] text-right truncate max-w-[200px]" title={currentHeroEvent.venue}>
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


      {/* ----------------- 4. EXPLORE BY CATEGORY ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-white">
              Explore By Category
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Live concerts, standup comedy specials, sports, and theatrical productions.
            </p>
          </div>

          <button
            onClick={() => onNavigateToSearch('all')}
            className="flex items-center gap-1 text-xs font-semibold text-[#D4AF37] hover:text-[#F3E5AB] transition-colors shrink-0"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-2">
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


      {/* ----------------- 5. TRENDING SHOWS ROW (if events exist) ----------------- */}
      {trendingEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/20 text-[#D4AF37]">
                <Flame className="w-4 h-4 fill-[#D4AF37]" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl sm:text-2xl text-white">
                  Trending Shows Near You
                </h2>
                <p className="text-xs text-gray-400">High demand events selling fast</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollRow('row-trending', 'left')}
                className="p-2 rounded-xl bg-[#141418] hover:bg-[#1C1C22] text-gray-300 hover:text-white border border-white/10 transition-colors"
                aria-label="Scroll trending events left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollRow('row-trending', 'right')}
                className="p-2 rounded-xl bg-[#141418] hover:bg-[#1C1C22] text-gray-300 hover:text-white border border-white/10 transition-colors"
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
      )}


      {/* ----------------- 6. POPULAR THIS WEEK ROW ----------------- */}
      {popularEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/20 text-[#D4AF37]">
                <Star className="w-4 h-4 fill-[#D4AF37]" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl sm:text-2xl text-white">
                  Popular This Week
                </h2>
                <p className="text-xs text-gray-400">Highest rated attendee reviews</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollRow('row-popular', 'left')}
                className="p-2 rounded-xl bg-[#141418] hover:bg-[#1C1C22] text-gray-300 hover:text-white border border-white/10 transition-colors"
                aria-label="Scroll popular events left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollRow('row-popular', 'right')}
                className="p-2 rounded-xl bg-[#141418] hover:bg-[#1C1C22] text-gray-300 hover:text-white border border-white/10 transition-colors"
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
      )}


      {/* ----------------- 7. LIVE MUSIC & CONCERTS ----------------- */}
      {musicEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

    </div>
  );
};
