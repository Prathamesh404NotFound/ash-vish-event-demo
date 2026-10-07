import { EventItem } from '../types';

/**
 * Same public-visibility rules the Home page uses before listing an event.
 * The link-preview image must never come from a draft, cancelled, completed,
 * hidden or image-less event.
 */
export function isPublicEvent(event: EventItem | null | undefined): boolean {
  return Boolean(
    event &&
      typeof event === 'object' &&
      event.title &&
      (event.posterUrl || event.coverUrl) &&
      typeof event.status === 'string' &&
      event.status !== 'draft' &&
      event.status !== 'cancelled' &&
      event.status !== 'completed' &&
      event.isEventPublic !== false
  );
}

function eventTime(event: EventItem): number | null {
  const raw = (event.date || '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Returns the current/upcoming event used for link previews (og:image).
 * Prefers the soonest public event that hasn't happened yet; falls back to the
 * soonest dated event (when everything is in the past) and finally to the
 * first public event when dates aren't parseable.
 */
export function getUpcomingEvent(events: EventItem[]): EventItem | undefined {
  const list = (events || []).filter(isPublicEvent);
  if (list.length === 0) return undefined;

  const now = Date.now();
  const timed = list.map((event) => ({ event, time: eventTime(event) }));
  const upcoming = timed.filter((item) => item.time === null || item.time! >= now);
  const pool = upcoming.length > 0 ? upcoming : timed;

  pool.sort((a, b) => {
    if (a.time === null && b.time === null) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });

  return pool[0].event;
}

/** Absolute URL for the upcoming event's image, ready for og:image/twitter:image. */
export function getUpcomingEventImageUrl(events: EventItem[]): string | undefined {
  const event = getUpcomingEvent(events);
  if (!event) return undefined;
  const image = event.posterUrl || event.coverUrl;
  if (!image) return undefined;
  if (/^https?:\/\//i.test(image)) return image;
  const appUrl = (
    import.meta.env.VITE_APP_URL || 'https://ashvishevents.com'
  ).replace(/\/+$/, '');
  return `${appUrl}${image.startsWith('/') ? '' : '/'}${image}`;
}
