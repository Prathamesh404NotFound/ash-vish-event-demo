/**
 * Early Bird promotion — shared client-side model.
 *
 * The server is the pricing authority: `computeReservationQuote` recomputes
 * the discount inside every quote/payment endpoint. These helpers mirror the
 * same rules so the public event page, ticket cards, and checkout can render
 * strike-through "Early Bird" pricing and countdowns while the window is live.
 */
import type { EarlyBirdConfig, EventItem, TicketTier } from '../types';

/** Normalized view of an event's early-bird config with activation helpers. */
export interface EarlyBirdView {
  config: EarlyBirdConfig;
  /** Promotion is enabled and `now` sits inside its window. */
  active: boolean;
  /** True while the window is configured but has not opened yet. */
  upcoming: boolean;
  /** Percentage off (0-100) when discountType === 'percent'. */
  percentOff: number;
  /** Flat ₹ off per ticket when discountType === 'flat'. */
  flatOff: number;
  /** ISO timestamp the window closes, when configured. */
  endsAt: string | null;
  /** ISO timestamp the window opens, when configured. */
  startsAt: string | null;
}

function parseMs(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v < 1e11 ? v * 1000 : v;
  }
  const str = String(v).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (Number.isFinite(num)) {
      return num < 1e11 ? num * 1000 : num;
    }
  }
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : t;
}

/** Read + evaluate an event's early-bird promotion against `now`. */
export function getEarlyBirdView(event: EventItem | null | undefined, now: number = Date.now()): EarlyBirdView | null {
  const config = event?.earlyBird as EarlyBirdConfig | null | undefined;
  if (!config || typeof config !== 'object') return null;

  const enabled =
    config.enabled === true ||
    String((config as any).enabled).toLowerCase() === 'true' ||
    Number((config as any).enabled) === 1;

  const discountType = config.discountType === 'flat' ? 'flat' : 'percent';
  const discountValue = Number(config.discountValue) || 0;
  const startsMs = parseMs(config.startsAt);
  const endsMs = parseMs(config.endsAt);
  const started = startsMs === null || now >= startsMs;
  const ended = endsMs !== null && now >= endsMs;
  const active = enabled && discountValue > 0 && started && !ended;
  const upcoming = enabled && discountValue > 0 && !started && !ended;

  return {
    config: { ...config, enabled, discountType, discountValue },
    active,
    upcoming,
    percentOff: discountType === 'percent' ? Math.min(100, Math.max(0, discountValue)) : 0,
    flatOff: discountType === 'flat' ? Math.max(0, discountValue) : 0,
    startsAt: startsMs !== null ? new Date(startsMs).toISOString() : null,
    endsAt: endsMs !== null ? new Date(endsMs).toISOString() : null,
  };
}

/**
 * Effective per-ticket price after the early-bird discount (when active).
 * Mirrors server `earlyBirdDiscountPerTicket`: never below 0, flat discounts
 * are capped at the ticket price, percentages capped at 100%.
 */
export function earlyBirdTicketPrice(tier: TicketTier, eb: EarlyBirdView | null): number {
  const base = Number(tier.price) || 0;
  if (!eb || !eb.active || base <= 0) return Math.trunc(base);
  const off = eb.config.discountType === 'flat'
    ? Math.min(eb.flatOff, base)
    : (base * eb.percentOff) / 100;
  return Math.max(0, Math.trunc(base - off));
}

/**
 * Utility function to compute discounted amount formatted as integer string.
 */
export function formatDiscountedAmount(originalPrice: number | string, discountPercent: number, currencySymbol = ''): string {
  const price = typeof originalPrice === 'string' ? parseFloat(originalPrice.replace(/[^0-9.]/g, '')) || 0 : originalPrice;
  const symbolMatch = typeof originalPrice === 'string' ? originalPrice.match(/^[^\d\s]+/) : null;
  const symbol = currencySymbol || (symbolMatch ? symbolMatch[0] : '');
  const discounted = price * (1 - Math.min(100, Math.max(0, discountPercent)) / 100);
  const truncated = Math.max(0, Math.trunc(discounted));
  return `Discounted amount: ${symbol}${truncated}`;
}

/** Compact countdown label until the promotion window closes. */
export function earlyBirdCountdown(eb: EarlyBirdView, now: number = Date.now()): string | null {
  if (!eb.endsAt) return null;
  const endMs = parseMs(eb.endsAt);
  if (endMs === null || endMs <= now) return null;
  const ms = endMs - now;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'less than a minute left';
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
}
