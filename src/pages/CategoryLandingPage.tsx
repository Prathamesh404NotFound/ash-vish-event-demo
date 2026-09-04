import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Music, Laugh, Trophy, Theater, PartyPopper, Calendar, MapPin, ArrowRight } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useLocale } from '../contexts/LocaleContext';
import { EventCard } from '../components/EventCard';

interface CategoryConfig {
  category: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  keywords: string[];
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  'concerts-in-kolhapur': {
    category: 'concert',
    title: 'Live Concerts in Kolhapur',
    description: 'Discover the best live music concerts, bands, and musical performances happening in Kolhapur. Book tickets for upcoming concerts.',
    icon: Music,
    gradient: 'from-purple-500/20 to-blue-500/20',
    keywords: ['concerts in kolhapur', 'live music kolhapur', 'music events kolhapur'],
  },
  'comedy-shows-kolhapur': {
    category: 'comedy',
    title: 'Comedy Shows in Kolhapur',
    description: 'Laugh out loud at the best stand-up comedy shows and comedy events in Kolhapur. Book tickets now.',
    icon: Laugh,
    gradient: 'from-yellow-500/20 to-orange-500/20',
    keywords: ['comedy shows kolhapur', 'stand up comedy kolhapur', 'comedy events'],
  },
  'ganeshotsav-events': {
    category: 'festival',
    title: 'Ganeshotsav Events in Kolhapur',
    description: 'Celebrate Ganesh Chaturthi with the best Ganeshotsav events, immersions, and cultural programs in Kolhapur.',
    icon: PartyPopper,
    gradient: 'from-red-500/20 to-orange-500/20',
    keywords: ['ganeshotsav kolhapur', 'ganpati events', 'ganesh chaturthi kolhapur'],
  },
  'sports-events-kolhapur': {
    category: 'sports',
    title: 'Sports Events in Kolhapur',
    description: 'Catch live sports events, tournaments, and matches in Kolhapur. Book your seats for the action.',
    icon: Trophy,
    gradient: 'from-green-500/20 to-emerald-500/20',
    keywords: ['sports events kolhapur', 'live sports kolhapur', 'tournaments'],
  },
  'theatre-plays-kolhapur': {
    category: 'theatre',
    title: 'Theatre & Plays in Kolhapur',
    description: 'Experience the magic of live theatre, natak, and dramatic performances in Kolhapur.',
    icon: Theater,
    gradient: 'from-pink-500/20 to-rose-500/20',
    keywords: ['theatre kolhapur', 'natak kolhapur', 'plays events'],
  },
  'navratri-events-kolhapur': {
    category: 'festival',
    title: 'Navratri Events in Kolhapur',
    description: 'Dandiya nights, Garba events, and cultural celebrations for Navratri in Kolhapur.',
    icon: PartyPopper,
    gradient: 'from-purple-500/20 to-pink-500/20',
    keywords: ['navratri kolhapur', 'dandiya kolhapur', 'garba events'],
  },
};

export function CategoryLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { events } = useBooking();
  const { t } = useLocale();

  const config = CATEGORY_MAP[slug || ''] || null;

  const filteredEvents = useMemo(() => {
    if (!config) return events.filter((e) => e.status === 'published');
    return events.filter(
      (e) => e.category === config.category && (e.status === 'published' || !e.status)
    );
  }, [events, config]);

  if (!config) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <h1 className="font-heading font-extrabold text-3xl text-white">Category Not Found</h1>
          <p className="text-gray-400">This category page doesn't exist yet.</p>
          <a href="/events" className="inline-block px-6 py-3 rounded-xl bg-[#D4AF37] text-black font-bold text-sm">
            Browse All Events
          </a>
        </div>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="space-y-8 pb-20">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${config.gradient} border border-white/10 p-8 sm:p-12`}
      >
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center">
              <Icon className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <span className="text-[#D4AF37] text-xs font-bold uppercase tracking-widest">Kolhapur</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-white mb-3">{config.title}</h1>
          <p className="text-gray-300 text-sm leading-relaxed max-w-lg">{config.description}</p>
          <div className="flex items-center gap-4 mt-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Kolhapur
            </span>
          </div>
        </div>
      </motion.section>

      {/* Events Grid */}
      {filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 space-y-4">
          <Icon className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">No {config.category} events currently available in Kolhapur.</p>
          <a href="/events" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/10">
            Browse All Events <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: config.title,
            description: config.description,
            url: `https://ashvishevents.com/${slug}`,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: filteredEvents.length,
              itemListElement: filteredEvents.slice(0, 10).map((e, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `https://ashvishevents.com/events/${e.id}`,
                name: e.title,
              })),
            },
            about: {
              '@type': 'Place',
              name: 'Kolhapur',
              address: { '@type': 'PostalAddress', addressLocality: 'Kolhapur', addressRegion: 'Maharashtra', addressCountry: 'IN' },
            },
          }),
        }}
      />
    </div>
  );
}
