import React from 'react';
import {
  Check, Sparkles, Star, Zap, ShieldCheck, Coffee, Music, Trophy,
  MapPin, Calendar, Clock, Gift, BadgeCheck,
} from 'lucide-react';
import { EventItem, TicketTier } from '../types';

/** Curated icon pool for perk labels. Each prefix maps to a lucide icon so the
 *  perks sidebar stays visually consistent regardless of how admins word them. */
const PERK_ICONS: Array<{ match: RegExp; icon: typeof Star }> = [
  { match: /complimentary|free drink|drink|beverage|bar credit/i, icon: Coffee },
  { match: /backstag|meet|greeter|artist|lineup/i, icon: Music },
  { match: /vip|premium|skybox|lounge|suite/i, icon: Star },
  { match: /early|priority|fast track|fast-track|express/i, icon: Zap },
  { match: /insur|guarant|secure|safe|protection/i, icon: ShieldCheck },
  { match: /parking|valet|transport|cab|shuttle/i, icon: MapPin },
  { match: /merch|goodie|gift|swag|welcome kit/i, icon: Gift },
  { match: /food|meal|buffet|snack|catering/i, icon: Coffee },
  { match: /award|trophy|prize|contest/i, icon: Trophy },
  { match: /certificate|badge|verified/i, icon: BadgeCheck },
  { match: /date\b|schedule|time/i, icon: Calendar },
  { match: /hour|duration|time|starts/i, icon: Clock },
];

const perkIcon = (text: string): typeof Star => {
  for (const { match, icon } of PERK_ICONS) {
    if (match.test(text)) return icon;
  }
  return Sparkles;
};

interface PerksSectionProps {
  event: EventItem;
  tier: TicketTier;
}

/** Side panel listing everything included with the event and the selected tier. */
export const PerksSection: React.FC<PerksSectionProps> = ({ event, tier }) => {
  // Event-level perks come from the event record; tier-level perks come from
  // the chosen ticket tier. Admins manage both in the event editor.
  const eventPerks: string[] = Array.isArray(event.perks) ? event.perks.filter((p) => String(p || '').trim().length > 0) : [];
  const tierPerks: string[] = Array.isArray(tier?.perks) ? tier.perks.filter((p) => String(p || '').trim().length > 0) : [];

  if (eventPerks.length === 0 && tierPerks.length === 0) return null;

  const Entry = ({ text, accent = false, key }: { text: string; accent?: boolean; key?: string }) => {
    const Icon = perkIcon(text);
    return (
      <li className="flex items-start gap-2.5 text-xs text-gray-300">
        <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-px ${
          accent
            ? 'bg-gradient-to-br from-[#F3E5AB] to-[#D4AF37] text-black'
            : 'bg-[#D4AF37]/10 border border-[#D4AF37]/25 text-[#D4AF37]'
        }`}>
          <Icon className="w-3 h-3" />
        </span>
        <span className="leading-relaxed">{text}</span>
      </li>
    );
  };

  return (
    <div className="bg-[#141414] border border-[#D4AF37]/20 rounded-3xl p-5 space-y-4">
      <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2 uppercase tracking-widest">
        <Sparkles className="w-4 h-4 text-[#D4AF37]" />
        What&apos;s Included
      </h3>

      <div className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-4 space-y-2.5">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Event Perks
        </p>
        <ul className="space-y-2.5">
          {eventPerks.map((perk, i) => (
            <Entry key={`${perk}-${i}`} text={perk} />
          ))}
        </ul>
      </div>

      {tierPerks.length > 0 && (
        <div className="rounded-2xl bg-[#D4AF37]/5 border border-[#D4AF37]/25 p-4 space-y-2.5">
          <p className="text-[10px] font-bold text-[#F3E5AB] uppercase tracking-widest flex items-center gap-1.5">
            <BadgeCheck className="w-3 h-3" /> {tier.name} Ticket Benefits
          </p>
          <ul className="space-y-2.5">
            {tierPerks.map((perk, i) => (
              <Entry key={`${perk}-${i}`} text={perk} accent />
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 border-t border-white/5 pt-3">
        <Check className="w-3 h-3 text-emerald-400" />
        <span>All perks are delivered on the event day — no extra charges apply.</span>
      </div>
    </div>
  );
};
