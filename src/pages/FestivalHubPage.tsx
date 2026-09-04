import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { PartyPopper, Calendar, MapPin, ArrowRight, Sparkles, Clock } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useLocale } from '../contexts/LocaleContext';
import { EventCard } from '../components/EventCard';

interface FestivalConfig {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  accentColor: string;
  months: number[]; // 0-indexed months when this festival typically falls
  keywords: string[];
}

const FESTIVALS: Record<string, FestivalConfig> = {
  ganeshotsav: {
    id: 'ganeshotsav',
    title: 'Ganeshotsav 2026',
    subtitle: 'Celebrate Ganesh Chaturthi in Kolhapur',
    description: 'Experience the grandeur of Ganeshotsav in Kolhapur — from Ganesh Sthapana to Visarjan. Find the best events, cultural programs, dhol-tasha pathaks, and immersion processions.',
    gradient: 'from-orange-600/30 via-red-500/20 to-yellow-500/30',
    accentColor: '#FF6B00',
    months: [8, 9], // Aug-Sep ( Ganesh Chaturthi season)
    keywords: ['ganeshotsav kolhapur', 'ganpati events', 'ganesh chaturthi', 'visarjan kolhapur'],
  },
  navratri: {
    id: 'navratri',
    title: 'Navratri 2026',
    subtitle: 'Dandiya, Garba & Cultural Nights',
    description: 'Celebrate the nine nights of Navratri with the best dandiya raas, garba nights, and cultural events in Kolhapur. Dress up, dance, and enjoy the festive spirit.',
    gradient: 'from-purple-600/30 via-pink-500/20 to-fuchsia-500/30',
    accentColor: '#9333EA',
    months: [9, 10], // Sep-Oct (Navratri season)
    keywords: ['navratri kolhapur', 'dandiya kolhapur', 'garba night', 'navratri events'],
  },
};

export function FestivalHubPage() {
  const { festivalId } = useParams<{ festivalId: string }>();
  const { events } = useBooking();
  const { t } = useLocale();

  const config = FESTIVALS[festivalId || ''] || null;

  const filteredEvents = useMemo(() => {
    if (!config) return [];
    return events.filter((e) => {
      if (e.status !== 'published' && e.status) return false;
      if (e.category === 'festival') return true;
      // Also include events whose title/description mentions the festival keywords
      const text = `${e.title} ${e.description || ''}`.toLowerCase();
      return config.keywords.some((kw) => text.includes(kw));
    });
  }, [events, config]);

  if (!config) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <PartyPopper className="w-12 h-12 text-gray-600 mx-auto" />
          <h1 className="font-heading font-extrabold text-3xl text-white">Festival Hub Not Found</h1>
          <p className="text-gray-400">This festival hub doesn't exist yet.</p>
          <a href="/events" className="inline-block px-6 py-3 rounded-xl bg-[#D4AF37] text-black font-bold text-sm">
            Browse All Events
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Hero Banner */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${config.gradient} border border-white/10 p-8 sm:p-12`}
      >
        <div className="absolute top-4 right-4 sm:top-8 sm:right-8">
          <Sparkles className="w-8 h-8 text-[#D4AF37] opacity-40" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <span className="text-[#D4AF37] text-xs font-bold uppercase tracking-widest mb-2 block">
            Festival Season · Kolhapur
          </span>
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-white mb-3">
            {config.title}
          </h1>
          <p className="text-lg text-white/70 font-heading font-bold mb-4">{config.subtitle}</p>
          <p className="text-gray-300 text-sm leading-relaxed max-w-lg">{config.description}</p>
          <div className="flex items-center gap-4 mt-6">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              Seasonal
            </span>
          </div>
        </div>
      </motion.section>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <a href="/events" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10 transition-all">
          <Calendar className="w-3.5 h-3.5" /> All Events
        </a>
        <a href="/concerts-in-kolhapur" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10 transition-all">
          Concerts
        </a>
        <a href="/comedy-shows-kolhapur" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10 transition-all">
          Comedy
        </a>
      </div>

      {/* Events Grid */}
      {filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 space-y-4">
          <PartyPopper className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">
            {config.title} events will appear here once announced.
          </p>
          <a href="/events" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10">
            Browse All Events <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: config.title,
            description: config.description,
            url: `https://ashvishevents.com/festival/${config.id}`,
            about: {
              '@type': 'Thing',
              name: config.title,
              description: config.description,
            },
          }),
        }}
      />
    </div>
  );
}
