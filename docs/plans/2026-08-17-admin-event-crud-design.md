# Admin Event CRUD — Full Customization Design

**Date:** 2026-08-17
**Scope:** Extend `AdminPage.tsx` ("Events" tab) so every event field is fully customizable: create, edit, delete, duplicate.

## Current State (gaps)

The Events tab currently supports only:
- **Create** — a small modal with ~9 fields (title, subtitle, category, date, time, venue, city, price, poster), hardcoded tier ("General Pass"), hardcoded FAQ, hardcoded artist.
- **Delete** — single trash button.
- **No edit/update** at all — the one gap the user explicitly flagged ("modify event CRUD to have all customizations").

The backend already supports full-field updates (`PUT /api/events/:eventId` merges any body fields) and creates (`POST /api/events`) with validation for prices, dates, status, `usesSeatMap`, and tier prices. The gap is purely frontend.

## Target Design

A single **EventEditor modal** used for both create and edit, driven by a draft `EventItem`-shaped state object. Tabs inside the modal group fields so the form stays usable:

1. **Basics** — title, subtitle, category, status (draft/published/archived), organizer name, rating seed, description.
2. **Date & Venue** — date, time, venue, address, city, Google Maps URL.
3. **Media** — poster URL, cover URL, gallery URL list (add/remove).
4. **Tickets** — dynamic ticket tiers list (name, price, description, inventory total, perks list); `startingPrice` auto-syncs from cheapest tier; add/remove tiers.
5. **Perks & Seat Map** — event perks list (add/remove), `usesSeatMap` toggle (walk-in vs seat selection flow), seat map rows/cols/aisle (only when seat map on).
6. **Schedule & FAQ** — schedule items (time, title, description), FAQ list (question/answer).
7. **Flags** — isFeatured, isTrending, isPopularThisWeek, totalCapacity.

### Behavior

- **Edit** button per event row opens the editor pre-filled with a deep-cloned copy of the record.
- **Save** sends the full draft to `PUT /api/events/:id` (edit) or `POST /api/events` (create), same `updateEvent`/`addEvent` paths as today; optimistic state refresh via the events listener.
- **Duplicate** button: clone the record with a new id and " (Copy)" suffix, then open editor.
- Create modal is removed; the editor handles both paths.
- No new backend changes required — existing validation covers all edited fields.

### Consistency

Same design system as the rest of the admin console: dark `bg-[#141414]`, gold `#D4AF37` accents, `rounded-3xl`, uppercase 10px tracking-wider labels, toast feedback.

### Verification

- `npm run lint` clean; `vite build` passes.
- Manual check: create event with 2 tiers, toggle `usesSeatMap` off, edit existing event, duplicate — all reflected on the public site via RTDB listener.
