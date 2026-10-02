import React from 'react';
import {
  Building2,
  Calendar,
  Clock,
  Eye,
  Heart,
  MapPin,
  Share2,
  Star,
  Ticket,
  Zap,
} from 'lucide-react';
import type { EventItem } from '../../types';
import type { EarlyBirdView } from '../../lib/earlyBird';
import { formatINR, formatDateIN } from '../../utils/formatters';

export interface EventHeroProps {
  event: EventItem;
  /** Live promotion view — drives the discount banner, strikethrough price and timer. */
  earlyBird: EarlyBirdView | null;
  /** Shared clock (ms) so the countdown and promotion expiry stay in sync. */
  now: number;
  /** Configured price per ticket, before any promotion. */
  basePrice: number;
  /** Effective price per ticket right now (promotion applied). */
  currentPrice: number;
  isLoading: boolean;
  isSaved: boolean;
  /** Online ticket info is shown on this event (false for external/advertise-only listings). */
  showTicketCta: boolean;
  /** External booking destination, when the primary CTA links off-platform. */
  externalUrl?: string | null;
  onBook: () => void;
  onViewTickets: () => void;
  onToggleSave: () => void;
  onShare: () => void;
}

interface MetaItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}

/** Compact countdown to `deadline`, e.g. "03:14:59" or "1d 03:14:59". */
function timeLeftUntil(deadline: string | null | undefined, now: number): string | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Event hero. Every value rendered here — title, badges, promotion discount,
 * countdown, prices, metadata and artwork — is derived from the event payload
 * and the live promotion state. Nothing is hardcoded, and empty fields are
 * simply not rendered.
 */
export const EventHero: React.FC<EventHeroProps> = ({
  event,
  earlyBird,
  now,
  basePrice,
  currentPrice,
  isLoading,
  isSaved,
  showTicketCta,
  externalUrl,
  onBook,
  onViewTickets,
  onToggleSave,
  onShare,
}) => {
  const artwork = event.coverUrl || event.posterUrl;
  const originalPrice = Number(basePrice) || 0;
  const price = Number(currentPrice) || 0;

  // Discount + urgency, all derived from the live promotion window.
  const hasDiscount = Boolean(earlyBird?.active) && originalPrice > 0 && price < originalPrice;
  const discountPercent = hasDiscount
    ? Math.min(100, Math.round(((originalPrice - price) / originalPrice) * 100))
    : 0;
  const savings = hasDiscount ? originalPrice - price : 0;
  const timeLeft = hasDiscount ? timeLeftUntil(earlyBird?.endsAt, now) : null;

  const showPrice = showTicketCta && originalPrice > 0;
  // Walk-in / advertise-only listings without an external link have no online
  // booking action — the hero then offers only Save and Share.
  const showPrimaryCta = Boolean(externalUrl) || (showTicketCta && !event.isAdvertiseOnly);

  // Metadata strip — only fields the event actually carries are rendered.
  const metaItems: MetaItem[] = [
    {
      key: 'date',
      icon: <Calendar className="w-4 h-4" />,
      label: 'Date & Time',
      value: formatDateIN(event.date) || event.date,
      sub: event.time,
    },
    {
      key: 'venue',
      icon: <MapPin className="w-4 h-4" />,
      label: 'Venue',
      value: event.venue,
      sub: event.city,
    },
    {
      key: 'organizer',
      icon: <Building2 className="w-4 h-4" />,
      label: 'Presented By',
      value: event.presentedBy || event.organizer,
    },
  ].filter((item) => Boolean(item.value));

  const hasRating = typeof event.rating === 'number' && Number.isFinite(event.rating);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#17130B] via-[#141414] to-[#101010] shadow-2xl">
      {/* Festive ambient lighting behind the poster. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#FF9933] opacity-30"
          style={{ filter: 'blur(80px)' }}
        />
        <div
          className="absolute -right-6 top-1/3 h-52 w-52 rounded-full bg-[#D4AF37] opacity-25"
          style={{ filter: 'blur(80px)' }}
        />
        <div
          className="absolute -left-20 -bottom-16 h-52 w-52 rounded-full bg-[#B0172A] opacity-25"
          style={{ filter: 'blur(80px)' }}
        />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 p-5 sm:p-7 lg:p-9">
        {/* Copy column — identity, urgency, metadata and the CTA cluster. */}
        <div className="flex min-w-0 flex-col justify-center gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#D4AF37] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
                {event.category}
              </span>
              {event.isAdvertiseOnly && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  Counter Only
                </span>
              )}
              {hasRating && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {event.rating.toFixed(1)}
                  <span className="font-medium text-gray-400">({event.reviewsCount})</span>
                </span>
              )}
            </div>

            <h1 className="font-heading text-3xl font-extrabold leading-tight text-white break-words sm:text-5xl">
              {event.title}
            </h1>
            {event.subtitle && (
              <p className="max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
                {event.subtitle}
              </p>
            )}
          </div>

          {/* Unmissable discount + urgency banner. */}
          {hasDiscount && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-[#D4AF37]/20 to-orange-500/20 px-3 py-2 shadow-[0_0_30px_-8px_rgba(212,175,55,0.75)] backdrop-blur-md">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] via-[#E6C766] to-[#D4AF37] px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-black">
                <Zap className="h-3.5 w-3.5 fill-black" />
                {discountPercent}% Off
              </span>
              <span className="text-xs font-bold text-amber-50">
                Save {formatINR(savings)} per ticket
              </span>
              {timeLeft && (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-300/40 bg-black/40 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-amber-200">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                  </span>
                  {timeLeft}
                </span>
              )}
            </div>
          )}

          {/* Glass metadata strip. */}
          {metaItems.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {metaItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm sm:backdrop-blur-md transition-colors hover:border-[#D4AF37]/30"
                >
                  <span className="shrink-0 text-[#D4AF37]">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-white">
                      {item.value}
                    </span>
                    {item.sub && (
                      <span className="block truncate text-xs text-gray-400">{item.sub}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Price + CTA cluster. */}
          <div className="space-y-4">
            {showPrice && (
              <div className="flex flex-wrap items-end gap-3">
                <span className="font-heading text-4xl font-extrabold leading-none text-[#D4AF37]">
                  {formatINR(price)}
                </span>
                {hasDiscount && (
                  <span className="pb-0.5 text-base font-semibold leading-none text-gray-500 line-through">
                    {formatINR(originalPrice)}
                  </span>
                )}
                <span className="pb-0.5 text-xs font-medium text-gray-400">per ticket</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {showPrimaryCta &&
                (externalUrl ? (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] px-7 text-sm font-black uppercase tracking-wide text-black shadow-[0_10px_28px_-10px_rgba(212,175,55,0.8)] transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_16px_36px_-10px_rgba(212,175,55,0.95)] active:translate-y-0"
                  >
                    <Ticket className="h-5 w-5" />
                    Book Now
                    <span className="text-[10px] opacity-70">(opens new tab)</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={onBook}
                    disabled={isLoading}
                    aria-disabled={isLoading}
                    className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-7 text-sm font-black uppercase tracking-wide transition-all ${
                      isLoading
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] text-black shadow-[0_10px_28px_-10px_rgba(212,175,55,0.8)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_16px_36px_-10px_rgba(212,175,55,0.95)] active:translate-y-0'
                    }`}
                  >
                    <Ticket className="h-5 w-5" />
                    {isLoading ? 'Loading' : 'Book Now'}
                  </button>
                ))}

              {showTicketCta && (
                <button
                  type="button"
                  onClick={onViewTickets}
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/[0.09]"
                >
                  <Eye className="h-4 w-4" />
                  View Tickets
                </button>
              )}

              <button
                type="button"
                onClick={onToggleSave}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove from saved' : 'Save this event'}
                className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-bold backdrop-blur-md transition-colors ${
                  isSaved
                    ? 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37]'
                    : 'border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.09]'
                }`}
              >
                <Heart className={`h-4 w-4 ${isSaved ? 'fill-[#D4AF37]' : ''}`} />
                {isSaved ? 'Saved' : 'Save'}
              </button>

              <button
                type="button"
                onClick={onShare}
                aria-label="Share this event"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/[0.09]"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>
          </div>
        </div>

        {/* Poster column — elevated, layered, with ambient reflection. */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-[#D4AF37]/30 via-transparent to-[#B0172A]/25 blur-2xl"
          />
          <div className="relative w-full max-w-sm lg:max-w-none">
            {artwork ? (
              <>
                <img
                  src={artwork}
                  alt={event.title}
                  className="aspect-[4/5] w-full rounded-3xl object-cover shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/15"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-t from-black/55 via-black/10 to-white/5"
                />
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/15" />
                <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                  {(formatDateIN(event.date) || event.date) && (
                    <span className="rounded-xl border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-md">
                      {formatDateIN(event.date) || event.date}
                    </span>
                  )}
                  {event.time && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-md">
                      <Clock className="h-3 w-3 text-[#D4AF37]" />
                      {event.time}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
                <Ticket className="h-14 w-14 text-white/20" />
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {event.title}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
