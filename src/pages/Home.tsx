import React, { useRef } from 'react';
import { 
  Ticket, 
  Flame, 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  MapPin,
  Calendar,
  Clock
} from 'lucide-react';
import { Event } from '../types';
import EventCard from '../components/EventCard';
import { CategoryChip } from '../components/CategoryChip';

interface HomeProps {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  onBookNow: (event: Event) => void;
  onNavigateToSearch: (category: string) => void;
}

const Home: React.FC<HomeProps> = ({
  events,
  onSelectEvent,
  onBookNow,
  onNavigateToSearch,
}) => {
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const categories = ['all', 'concert', 'comedy', 'sports', 'theatre', 'workshop'];

  const trendingEvents = events.filter(e => e.isTrending).slice(0, 6);
  const popularEvents = events.filter(e => e.rating && e.rating >= 4.5).slice(0, 6);
  const musicEvents = events.filter(e => e.category === 'concert');
  const comedyEvents = events.filter(e => e.category === 'comedy');
  const sportsEvents = events.filter(e => e.category === 'sports');
  
  const currentHeroEvent = events.find(e => e.isFeatured) || events[0];

  const scrollRow = (id: string, direction: 'left' | 'right') => {
    const el = document.getElementById(id);
    if (el) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white pb-20 space-y-32">
      {/* ----------------- CINEMATIC HERO SECTION ----------------- */}
      <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
        {/* Dynamic Background */}
        <div className="absolute inset-0 z-0">
          {currentHeroEvent?.coverUrl || currentHeroEvent?.posterUrl ? (
            <div className="relative w-full h-full">
              <img
                src={currentHeroEvent.coverUrl || currentHeroEvent.posterUrl}
                alt="Background"
                className="w-full h-full object-cover opacity-40 scale-105 blur-[2px]"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#070707] via-[#070707]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-transparent to-transparent" />
            </div>
          ) : (
            <div className="w-full h-full bg-[#0A0A0A]" />
          )}
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          {currentHeroEvent ? (
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* LEFT COLUMN: Editorial Typography */}
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
                    {currentHeroEvent.subtitle || "Experience an unforgettable evening of premium entertainment and world-class performances."}
                  </p>
                </div>

                {/* Editorial Metadata */}
                <div className="flex flex-wrap gap-8 py-8 border-y border-white/5">
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Date</span>
                    <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest">
                      <Calendar className="w-3 h-3 text-[#D4AF37]" />
                      {currentHeroEvent.date}
                    </div>
                  </div>
                  <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Time</span>
                    <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest">
                      <Clock className="w-3 h-3 text-[#D4AF37]" />
                      {currentHeroEvent.time}
                    </div>
                  </div>
                  <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Venue</span>
                    <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest max-w-[200px] truncate">
                      <MapPin className="w-3 h-3 text-[#D4AF37]" />
                      {currentHeroEvent.venue}
                    </div>
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

              {/* RIGHT COLUMN: Artist Focal Point */}
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
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/20 text-[#D4AF37]">
              <Flame className="w-5 h-5 fill-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white uppercase tracking-tight">
                Trending Shows Near You
              </h2>
              <p className="text-xs text-gray-500">High demand events selling fast</p>
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

      {/* ----------------- POPULAR THIS WEEK ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400">
              <Star className="w-5 h-5 fill-purple-400" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-2xl text-white uppercase tracking-tight">
                Popular This Week
              </h2>
              <p className="text-xs text-gray-500">Highest rated attendee reviews</p>
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

      {/* ----------------- MUSIC CONCERTS ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-heading font-bold text-2xl text-white uppercase tracking-tight">
            Live Music & World Tours
          </h2>
          <button
            onClick={() => onNavigateToSearch('concert')}
            className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] hover:underline"
          >
            See All Concerts
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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

      {/* ----------------- COMEDY & SPORTS ----------------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          
          {/* Comedy Block */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 space-y-8">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]">Comedy Nights</span>
              <h3 className="font-heading font-bold text-2xl text-white uppercase tracking-tight">
                Standup Specials
              </h3>
            </div>

            <div className="space-y-4">
              {comedyEvents.slice(0, 2).map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all border border-white/5"
                >
                  <img
                    src={evt.posterUrl}
                    alt={evt.title}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider truncate">
                      {evt.title}
                    </h4>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{evt.date}</p>
                    <p className="text-xs font-bold text-[#D4AF37] mt-2">From {formatINR(evt.startingPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sports Block */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 space-y-8">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Stadium Sports</span>
              <h3 className="font-heading font-bold text-2xl text-white uppercase tracking-tight">
                Championship Games
              </h3>
            </div>

            <div className="space-y-4">
              {sportsEvents.slice(0, 2).map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => onSelectEvent(evt)}
                  className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all border border-white/5"
                >
                  <img
                    src={evt.posterUrl}
                    alt={evt.title}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider truncate">
                      {evt.title}
                    </h4>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{evt.date}</p>
                    <p className="text-xs font-bold text-[#D4AF37] mt-2">From {formatINR(evt.startingPrice)}</p>
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

export default Home;
