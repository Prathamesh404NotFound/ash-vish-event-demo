import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Sparkles, CheckCircle2, ShieldCheck, Star, ArrowRight, Building, Music, PartyPopper } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { useBooking } from '../contexts/BookingContext';
import { generateBreadcrumbSchema, generateFAQSchema } from '../utils/structuredData';

interface CityPageProps {
  city: 'kolhapur' | 'maharashtra' | 'india' | 'pune' | 'mumbai';
}

const cityDetails: Record<string, { name: string; state: string; subtitle: string; description: string; venues: string[] }> = {
  kolhapur: {
    name: 'Kolhapur',
    state: 'Maharashtra',
    subtitle: 'The Cultural & Entertainment Hub of Southern Maharashtra',
    description: 'Ash-vish Events is the #1 rated event management company and ticketing platform in Kolhapur. From grand Maharashtrian weddings and sangeet ceremonies to live Bollywood musical nights, concerts, and corporate conferences, we deliver world-class event production with instant QR code digital passes.',
    venues: ['Shahu Smarak Bhavan', 'Hotel Sayaji Kolhapur', 'Pavankhind Lawns', 'Rajarshi Shahu Auditorium', 'The Orchid Palace']
  },
  maharashtra: {
    name: 'Maharashtra',
    state: 'Maharashtra',
    subtitle: 'State-Wide Event Production & Ticketing Excellence',
    description: 'Leading event organisers across Maharashtra, delivering exceptional concerts, cultural festivals, destination weddings, and corporate summits in Kolhapur, Pune, Mumbai, Nashik, and Nagpur.',
    venues: ['Kolhapur Convention Center', 'Pune Expo Arena', 'Mumbai MMRDA Grounds', 'Nashik Cultural Hall']
  },
  india: {
    name: 'India',
    state: 'National',
    subtitle: 'Premier Event Management & Live Ticketing Ecosystem',
    description: 'Ash-vish Events is India’s trusted platform for discovering live entertainment, booking concert tickets online, and organizing professional corporate events, music tours, and weddings with seamless QR pass validation.',
    venues: ['All Major Stadiums & Convention Centers Across India']
  },
  pune: {
    name: 'Pune',
    state: 'Maharashtra',
    subtitle: 'Youth Festivals, Tech Summits & Live Music Capital',
    description: 'Premier event planning and ticketing services in Pune. Specializing in college cultural fests, corporate tech conferences, indie music concerts, and high-end receptions.',
    venues: ['Balewadi Stadium', 'Jeevan Natya Mandir', 'Corinthian Club', 'E-Square Lawns']
  },
  mumbai: {
    name: 'Mumbai',
    state: 'Maharashtra',
    subtitle: 'Bollywood Galas, Celebrity Concerts & Luxury Weddings',
    description: 'Top-tier event organisers in Mumbai for celebrity music tours, high-profile product launches, fashion shows, and grand destination weddings.',
    venues: ['Jio World Garden', 'NSCI Dome', 'Taj Lands End', 'Shanmukhananda Hall']
  }
};

const cityFaqs = [
  {
    question: "What makes Ash-vish Events the best event organiser?",
    answer: "Ash-vish Events combines end-to-end event production expertise (sound, lighting, artist management, catering) with proprietary digital ticketing and instant QR code gate entry."
  },
  {
    question: "How do I book tickets for events on Ash-vish?",
    answer: "Browse our upcoming events, select your preferred seating tier, complete secure online checkout, and instantly receive your verifiable digital pass with WhatsApp delivery."
  },
  {
    question: "Can Ash-vish Events manage private weddings and corporate galas?",
    answer: "Yes! We specialize in customized wedding planning, sangeet choreography, corporate annual day functions, product launches, and large-scale musical concerts."
  }
];

export function CityPage({ city }: CityPageProps) {
  const navigate = useNavigate();
  const { events } = useBooking();
  const details = cityDetails[city] || cityDetails.kolhapur;

  const cityEvents = events.filter(e => {
    if (city === 'india' || city === 'maharashtra') return true;
    return e.city?.toLowerCase() === details.name.toLowerCase();
  });

  useSEO({
    title: `Best Event Organisers in ${details.name} | Concerts, Weddings & Corporate Events`,
    description: `Ash-vish Events is the best event organiser in ${details.name}, ${details.state}. Book concerts, musical nights, weddings, corporate events & live shows online with instant QR code entry.`,
    keywords: `event organisers ${details.name.toLowerCase()}, best event management ${details.name.toLowerCase()}, concert tickets ${details.name.toLowerCase()}, wedding planners ${details.name.toLowerCase()}, corporate events ${details.name.toLowerCase()}`,
    structuredData: [
      generateBreadcrumbSchema([
        { name: 'Home', url: '/' },
        { name: `${details.name} Events`, url: `/${city}` }
      ]),
      generateFAQSchema(cityFaqs)
    ]
  });

  return (
    <div className="min-h-screen bg-[#070707] text-white pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-16">
      
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase">
          <Sparkles className="w-4 h-4" />
          #1 Rated Event Management & Ticketing Platform
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Best Event Organisers in <span className="text-[#D4AF37]">{details.name}</span>
        </h1>

        <p className="text-base sm:text-lg text-gray-300 leading-relaxed">
          {details.description}
        </p>

        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <button
            onClick={() => navigate('/events')}
            className="px-8 py-4 rounded-2xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-extrabold text-sm flex items-center gap-2 shadow-xl shadow-[#D4AF37]/20 transition-all cursor-pointer"
          >
            <span>Explore All Shows</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
          <a
            href="https://wa.me/919822000000?text=Hi%2C%20I%20would%20like%20to%20book%20event%20planning%20services%20in%20"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-2xl bg-[#141414] hover:bg-[#1E1E1E] border border-white/15 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg"
          >
            <PartyPopper className="w-4 h-4 text-[#D4AF37]" />
            <span>Book Private Event / Wedding</span>
          </a>
        </div>
      </div>

      {/* Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-[#111] border border-white/10 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
            <Music className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Live Concerts & Shows</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            From Bollywood musical nights to indie artist tours in {details.name}, we curate unforgettable live music experiences.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#111] border border-white/10 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
            <PartyPopper className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Weddings & Receptions</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Luxurious decor, custom sangeet events, guest management, and immaculate wedding planning across {details.state}.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#111] border border-white/10 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Instant QR Ticketing</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Industry-leading digital passes with HMAC-SHA256 gate security and instant WhatsApp ticket delivery.
          </p>
        </div>
      </div>

      {/* Events in City */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Upcoming Events in {details.name}</h2>
          <span className="text-xs text-[#D4AF37] font-semibold">{cityEvents.length} Active Shows</span>
        </div>

        {cityEvents.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-[#111] border border-white/10 space-y-4">
            <p className="text-gray-400 text-sm">No specific events listed for {details.name} right now. Explore all upcoming shows on our events portal!</p>
            <button
              onClick={() => navigate('/events')}
              className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-black font-bold text-xs"
            >
              Browse All Events
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cityEvents.map(event => (
              <div
                key={event.id}
                onClick={() => navigate(`/events/${event.id}`)}
                className="group cursor-pointer rounded-3xl bg-[#111] border border-white/10 overflow-hidden shadow-xl hover:border-[#D4AF37]/50 transition-all duration-300"
              >
                <div className="relative h-48 overflow-hidden">
                  <img src={event.posterUrl} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[#D4AF37] text-xs font-bold border border-white/10">
                    ₹{event.startingPrice} onwards
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{event.date} • {event.time}</span>
                  </div>
                  <h3 className="font-bold text-white text-base leading-snug group-hover:text-[#D4AF37] transition-colors">
                    {event.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    <span className="truncate">{event.venue}, {event.city}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Venues */}
      <div className="p-8 rounded-3xl bg-[#111] border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-bold uppercase tracking-wider">
          <Building className="w-4 h-4" /> Featured Partner Venues
        </div>
        <h3 className="text-xl font-bold text-white">Top Event Locations in {details.name}</h3>
        <div className="flex flex-wrap gap-3 pt-2">
          {details.venues.map((venue, idx) => (
            <div key={idx} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-gray-300">
              {venue}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-white text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {cityFaqs.map((faq, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-[#111] border border-white/10 space-y-2">
              <h4 className="font-bold text-white text-sm">{faq.question}</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
