# Analysis findings
## Live site
- Home page presents Explore/Browse/My/Saved navigation and a featured event.
- `/events` exposes the featured Neon Horizon event with a booking entry point.
- `/events/evt_001` shows an event detail page with an interactive hall map, ticket tiers, quantity/tier selection, and an order-total preview. The current public flow routes into a single `/checkout` screen.
## Repository
and Cashfree payment hooks.
- Main routes in `src/App.tsx`: event detail -> `/checkout` -> `/confirmation`.
- `CheckoutPage.tsx` combines attendee form, seat map, payment gateway choice, coupon entry, and order summary in one form. A summary exists in a sticky right column, but there is no enforced step-by-step progression or dedicated review gate before payment.
- `SeatMap.tsx` subscribes to `seats/{eventId}` with `onValue`, claims individual seats using RTDB `runTransaction`, uses a ten-minute client hold, and registers `onDisconnect` updates. It optimistically treats transaction errors as success (`claimedSuccess = true` in the catch path), which can cause false local selections.
- Seat status is rendered from a combination of realtime DB state and local state. Expired holds are only cleaned in the client snapshot or timer; the component can show a locally available seat while the backend has stale/competing state.
- Hold durations are inconsistent: SeatMap/client uses 10 minutes, while server finalization and the server sweep use 5 minutes.
- Seat IDs are parsed from strings such as `R1-C2`, with multiple copies of label conversion logic. Pricing is recomputed in the UI from row/tier text matching rather than one canonical server-side seat/tier price model.
- Checkout performs a client-side read of all selected seat nodes before payment, but payment finalization is ultimately server-side and must be the only authority.
- `server.ts` finalizes seats sequentially with one RTDB transaction per seat. If a later seat fails, it rolls earlier seats back to `held`; this is not a single atomic multi-seat reservation and creates partial-state windows.
- Server finalization can accept a missing seat node and create a booked node, which is unsafe if seat-map configuration is not authoritative and validated.
- After payment, the server writes tickets, bookings, seat states, and processed order records through multiple independent writes; retries or failures between writes require robust idempotency/outbox/reconciliation handling.
- Cashfree verification currently treats every sandbox order as paid (`... || env === "sandbox"`), which must never exist in production logic.
- Firebase rules allow public reads of seat maps and broad writes to `events`, `coupons`, `organizers`, and reviews for any authenticated user; seat writes also allow any authenticated user to set a seat to `available`. These rules need least-privilege redesign before production.
- A service-account JSON file is present in the repository root and should be removed from version control, rotated, and replaced with deployment secret management.
- `README.md` describes an AI Studio demo and does not document the production architecture, environment variables, migrations, observability, rollback, or test strategy.
## High-level direction
Use a server-authoritative reservation/hold service with an explicit reservation ID, owner token, expiration, idempotency key, and atomic all-seat claim. Use realtime listeners only for display/update propagation, never as the source of truth. Payment should be initiated only after a valid reservation and a dedicated review step; the webhook/server verification should finalize the same reservation exactly once.
