import React from 'react';
import { Handshake } from 'lucide-react';
import type { Sponsor, SponsorType } from '../types';

interface EventSponsorStripProps {
  sponsors: Sponsor[];
}

/** Human-readable label + colour for each sponsor tier. */
const sponsorMeta: Record<SponsorType, { label: string; classes: string }> = {
  title: {
    label: 'Title Sponsor',
    classes: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40',
  },
  presenting: {
    label: 'Presenting Sponsor',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  gold: {
    label: 'Gold Sponsor',
    classes: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  },
  silver: {
    label: 'Silver Sponsor',
    classes: 'bg-gray-400/15 text-gray-300 border-gray-400/30',
  },
  bronze: {
    label: 'Bronze Sponsor',
    classes: 'bg-orange-700/15 text-orange-300 border-orange-700/30',
  },
  media_partner: {
    label: 'Media Partner',
    classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  associate: {
    label: 'Associate Sponsor',
    classes: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
};

/**
 * A subtle horizontal strip of sponsor logos / names.
 * Rendered on the event detail page below the hero section.
 * Only shows when `sponsors.length > 0`.
 */
export const EventSponsorStrip: React.FC<EventSponsorStripProps> = ({ sponsors }) => {
  if (!sponsors || sponsors.length === 0) return null;

  return (
    <section
      aria-label="Event sponsors"
      className="rounded-2xl bg-[#141414] border border-white/8 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Handshake className="w-4 h-4 text-[#D4AF37] shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">
          Our Sponsors &amp; Partners
        </span>
      </div>

      {/* Sponsor chips — one per sponsor entry */}
      <div className="flex flex-wrap gap-2.5">
        {sponsors.map((sp) => {
          const meta = sponsorMeta[sp.type] ?? sponsorMeta.associate;
          const inner = (
            <div
              key={sp.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-opacity hover:opacity-80 ${meta.classes}`}
            >
              {sp.logoUrl ? (
                <img
                  src={sp.logoUrl}
                  alt={sp.name}
                  className="h-5 w-auto max-w-[52px] object-contain rounded"
                  loading="lazy"
                />
              ) : (
                <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-black uppercase">
                  {sp.name.slice(0, 1)}
                </span>
              )}
              <span className="truncate max-w-[120px]">{sp.name}</span>
              <span
                className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${meta.classes} opacity-75`}
              >
                {meta.label}
              </span>
            </div>
          );

          return sp.website ? (
            <a
              key={sp.id}
              href={sp.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              {inner}
            </a>
          ) : (
            <span key={sp.id} className="inline-flex">
              {inner}
            </span>
          );
        })}
      </div>
    </section>
  );
};
