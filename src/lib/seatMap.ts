/**
 * Shared seat-map semantics for the platform.
 *
 * Events can optionally run a general-admission (walk-up) flow with no seat
 * layout at all. Admins control this per event via the `usesSeatMap` flag on
 * the event record.
 *
 * Resolution rules (single source of truth for both the backend and the
 * frontend):
 *   - usesSeatMap === false   -> always general admission, even if a seat map
 *                                was previously configured on the event
 *   - usesSeatMap === true    -> seat-based flow when the event has a seat
 *                                map, general admission otherwise (classic
 *                                behaviour)
 *   - usesSeatMap unset       -> same as true (default: seat-based when a map
 *                                exists)
 */
export interface SeatMapAwareEvent {
  seatMap?: any;
  usesSeatMap?: boolean;
}

/** Whether this event runs the seat-selection flow (true) or general
 *  admission with quantity only (false). */
export const isSeatBasedEvent = (event: SeatMapAwareEvent | null | undefined): boolean => {
  if (!event) return false;
  if (event.usesSeatMap === false) return false;
  return Boolean(event.seatMap);
};
