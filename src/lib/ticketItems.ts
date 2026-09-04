/**
 * Multi-type ticket purchasing — shared data model.
 *
 * A checkout session normally carries a single `tier` + `quantity`. The
 * `items` extension lets one transaction mix ticket types (e.g. 2 VIP +
 * 3 Kids) while every legacy single-type path keeps working unchanged:
 * when `items` is absent the request is identical to the old one.
 *
 * NOTE: `tierId`/`tierName` on individual items are informational display
 * fields. The server never trusts client prices — see
 * server.ts#computeReservationQuote (server-side re-derivation from the
 * live event tiers).
 */

export type TierKind = 'standard' | 'vip' | 'vvip' | 'kids';

export interface TicketLineItem {
  /** Exact tier id from event.ticketTiers (or the RTDB numeric key). */
  tierId: string;
  /** Display only — resolved server-side for authoritative pricing. */
  tierName?: string;
  /** Display only. */
  price?: number;
  quantity: number;
}

/** Sum of every line quantity — the reservation-wide seat/quantity count.
 *  Only positive integers count (mirrors server-side validation). */
export function sumItemQuantities(items?: TicketLineItem[] | null): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce(
    (sum, it) => sum + (Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 0),
    0
  );
}

/** Rough client-side validation mirroring the server-side rules. */
export function validateTicketItems(items: unknown): { ok: true; items: TicketLineItem[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'No tickets selected.' };
  }
  if (items.length > 5) {
    return { ok: false, error: 'A booking can mix at most 5 ticket types.' };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const raw of items) {
    const tierId = String(raw?.tierId ?? '').trim();
    const quantity = Number(raw?.quantity);
    if (!tierId) return { ok: false, error: 'Each ticket line needs a ticket type.' };
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'Each ticket type needs a quantity of at least 1.' };
    }
    if (seen.has(tierId)) return { ok: false, error: 'Duplicate ticket types in selection.' };
    seen.add(tierId);
    total += quantity;
    if (total > 10) return { ok: false, error: 'A booking can hold at most 10 tickets.' };
  }
  return { ok: true, items: items as TicketLineItem[] };
}

/**
 * Classify a tier name into a badge kind. Mirrors the server-neutral
 * naming conventions already used across the app ("VIP", "VVIP", "Kids",
 * "Child"). Unknown tiers stay `standard`.
 */
export function getTierKind(tierName: string | undefined | null): TierKind {
  const n = String(tierName || '').toLowerCase();
  if (!n) return 'standard';
  if (/\bvvip\b|vvip/.test(n)) return 'vvip';
  if (/\bvip\b|vip/.test(n)) return 'vip';
  if (/kid|child|minor|junior/.test(n)) return 'kids';
  return 'standard';
}

/** Badge visual definitions matching the existing VIP crown badge style. */
export interface TierBadgeStyle {
  label: string;
  icon: 'crown' | 'gem' | 'smile' | 'star';
  badgeClass: string;
  cardClass: string;
  perksClass: string;
}

export const TIER_BADGE_STYLES: Record<TierKind, TierBadgeStyle> = {
  // Existing VIP style — preserved exactly.
  vip: {
    label: 'VIP',
    icon: 'crown',
    badgeClass: 'bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black shadow-lg shadow-[#D4AF37]/40',
    cardClass: 'border-[#D4AF37]/50 bg-gradient-to-br from-[#D4AF37]/10 to-[#1C1C1C]',
    perksClass: 'text-[#D4AF37]',
  },
  // Platinum/white-gold gradient — reads as a step above VIP without clashing.
  vvip: {
    label: 'VVIP',
    icon: 'gem',
    badgeClass: 'bg-gradient-to-r from-[#E5E4E2] via-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#F3E5AB]/40',
    cardClass: 'border-[#F3E5AB]/60 bg-gradient-to-br from-[#F3E5AB]/15 to-[#1C1C1C]',
    perksClass: 'text-[#F3E5AB]',
  },
  // Soft sky-blue kid-friendly palette (AA contrast on dark surfaces).
  kids: {
    label: 'Kids',
    icon: 'smile',
    badgeClass: 'bg-gradient-to-r from-[#38BDF8] to-[#7DD3FC] text-[#0B2534] shadow-lg shadow-[#38BDF8]/30',
    cardClass: 'border-[#38BDF8]/50 bg-gradient-to-br from-[#38BDF8]/10 to-[#1C1C1C]',
    perksClass: 'text-[#7DD3FC]',
  },
  standard: {
    label: '',
    icon: 'star',
    badgeClass: '',
    cardClass: 'border-white/10 bg-[#141414]',
    perksClass: 'text-[#D4AF37]',
  },
};

export function getTierBadgeStyle(tierName: string | undefined | null): TierBadgeStyle {
  return TIER_BADGE_STYLES[getTierKind(tierName)];
}
