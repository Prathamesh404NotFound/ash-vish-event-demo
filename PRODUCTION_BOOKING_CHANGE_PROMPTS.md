# Ash-Vish Event Demo: Production Booking Redesign Prompts
**Prepared by Manus AI**
## Scope and conclusion
The current application already contains the visual ingredients for event discovery, ticket tiers, an interactive hall map, checkout, and payment. However, the booking path is still a single large client-side form and the seat system is not safe enough for production concurrency. The critical redesign is not merely a UI change. It must introduce a server-authoritative reservation lifecycle, an explicit review step before payment, and a realtime projection of seat state that never decides whether a seat is actually available.
and Cashfree. The live deployment is hosted at [ash-vish.netlify.app](https://ash-vish.netlify.app), while API requests are proxied to a separate backend through Netlify configuration. Firebase Realtime Database is appropriate for pushing seat-state changes to connected clients because it synchronizes changes in realtime, but authorization and atomic business decisions must still be enforced by the backend and database rules [1].
> **Production rule:** The browser may display and request a seat hold. Only the server may grant, renew, release, or convert a reservation, and only a verified payment event may finalize it.
## Current-state findings
| Area | Current behavior | Production risk | Required correction |
|---|---|---|---|
| Booking flow | Attendee data, seat selection, payment gateway, coupon, and order summary appear together on `/checkout`. | Users can reach payment without a deliberate review/confirmation gate; navigation and back-button behavior can produce stale state. | Create a stateful, step-by-step flow with explicit guards and a dedicated review step before payment. |
| Seat selection | `SeatMap.tsx` listens to `seats/{eventId}` and claims individual seats with `runTransaction`. | The component mixes server state and optimistic local state; transaction errors are treated as success, so a seat can appear selected when no hold exists. | Remove optimistic success on errors and move claiming to an authenticated server reservation API. |
| Multi-seat race safety | The backend finalizes seats sequentially, then rolls earlier seats back if a later seat fails. | A multi-seat booking is not one atomic operation; partial writes and rollback windows can produce inconsistent states. | Implement an all-or-nothing reservation transaction or a server-side reservation coordinator with compare-and-set semantics. |
| Hold duration | Client logic uses ten minutes; server finalization and sweep logic use five minutes. | A client can believe a hold remains valid after the server considers it expired. | Define one server-controlled TTL and return `expiresAt` to every client. |
| Realtime updates | Clients subscribe to the entire event seat collection using `onValue`. | It is useful for updates but cannot guarantee authority; broad reads and large snapshots may become expensive at scale. | Publish a sanitized seat projection, subscribe by event/showtime, and reconcile every action through the API. |
| Seat identity | Multiple places parse strings such as `R1-C2` and derive labels from row/column text. | Duplicate parsing and row-tier text matching can map a seat to the wrong section or price. | Use a canonical `SeatId`, `sectionId`, `rowId`, `number`, and `priceCents` model generated from the event seat map. |
and Cashfree callbacks can fall back to local confirmation paths; Cashfree sandbox verification accepts every order as paid. | Payment success and ticket issuance can diverge; sandbox bypasses must not reach production. | Make verified server webhook/order status the only fulfillment trigger and remove every simulated-payment path from production builds. |
| Firebase rules | Seat reads are public and authenticated users can write seats to `available`; several business collections have broad authenticated writes. | A malicious or buggy client can alter inventory, release other users’ holds, or mutate event/coupon data. | Lock client writes, restrict reads to sanitized projections, and allow only server/Admin SDK mutations for reservations and fulfillment. |
| Secrets | A Firebase Admin service-account JSON is tracked in the repository and `.env.example` contains a fixed-looking HMAC secret. | Credential leakage or accidental reuse can compromise the production database and payment integration. | Remove and rotate credentials, use deployment secret storage, and fail builds when sensitive files are tracked. |
| Verification | TypeScript passes, but the smoke test reports 14 failures when no API server is running. | CI/deployment health is not clearly separated from local setup and the smoke test can produce false conclusions. | Start a test server in CI, use a dedicated test Firebase project, and make health/readiness checks explicit. |
## Target booking state machine
Use a single booking session object on the client and a corresponding server reservation record. The allowed transitions must be explicit:
```text
IDLE
  -> EVENT_SELECTED
  -> TICKETS_CONFIGURED
  -> RESERVATION_REQUESTED
  -> RESERVATION_CONFIRMED
  -> ATTENDEE_DETAILS_COMPLETED
  -> REVIEW
  -> PAYMENT_PENDING
  -> PAYMENT_VERIFIED
  -> BOOKING_CONFIRMED
RESERVATION_CONFIRMED -> RESERVATION_EXPIRED
RESERVATION_CONFIRMED -> RESERVATION_RELEASED
PAYMENT_PENDING -> PAYMENT_FAILED
PAYMENT_PENDING -> PAYMENT_CANCELLED
PAYMENT_VERIFIED -> FULFILLMENT_RETRY_REQUIRED
```
The browser should never jump directly to `PAYMENT_PENDING`. Each route must validate the previous state, reload the reservation from the server when needed, and redirect to the first invalid step. A refresh should recover the session using a non-sensitive `reservationId` plus a secure owner token stored in an HttpOnly, Secure, SameSite cookie where possible.
## Target data model
Use one canonical model. Prices should be integer minor units, such as paise, and totals should be calculated on the server from the event snapshot, not from browser-supplied price values.
| Record | Required fields | Purpose |
|---|---|---|
| `events/{eventId}/showtimes/{showtimeId}` | `status`, `startsAt`, `timezone`, `seatMapVersion` | Makes the showtime part of the inventory key. |
| `seatCatalog/{eventId}/{showtimeId}/{seatId}` | `seatId`, `sectionId`, `rowLabel`, `seatNumber`, `priceMinor`, `status` | Immutable or admin-managed definition and current inventory status. |
| `reservations/{reservationId}` | `userId/sessionId`, `eventId`, `showtimeId`, `seatIds`, `status`, `expiresAt`, `amountMinor`, `currency`, `idempotencyKey`, `version` | Server-authoritative temporary hold. |
| `seatReservations/{eventId}/{showtimeId}/{seatId}` | `reservationId`, `status`, `expiresAt`, `updatedAt` | Fast conflict check and realtime projection. |
| `orders/{orderId}` | `reservationId`, `provider`, `providerOrderId`, `status`, `amountMinor`, `currency`, `idempotencyKey` | Payment lifecycle and reconciliation. |
| `bookings/{bookingId}` | `orderId`, `reservationId`, `seatIds`, attendee snapshot, `status` | Fulfilled booking record. |
| `outbox/{outboxId}` | event type, payload, attempts, status, timestamps | Reliable email/QR/notification retry after fulfillment. |
Use a reservation ID rather than using `userId` as the lock identity. Anonymous users need a cryptographically random session identity, and the reservation owner must not be accepted from an arbitrary request body field.
## Prompts for the coding agent
### Prompt 1 — Repository audit and safe migration plan
```text
You are working in the public Ash-Vish Event Demo repository. Before changing behavior, inspect the current React/Vite/TypeScript frontend, Express backend, Firebase Realtime Database integration, payment hooks, database rules, Netlify proxy configuration, and deployment documentation.
Create a written migration plan and a dependency map for replacing the current seat-selection and checkout flow without breaking admin, counter, walk-in, ticket, coupon, or payment features. Identify every read/write path involving events, seats, bookings, tickets, pending orders, processed orders, coupons, and payment callbacks. Do not delete the existing flow until the replacement is covered by tests.
Record these invariants:
1. A seat may be held by at most one active reservation.
2. A reservation must contain the exact event, showtime, seat IDs, price snapshot, owner identity, expiry, and idempotency key.
3. A client read is never proof that a seat is available.
4. Payment amount and seat ownership are recomputed and checked on the server.
5. Fulfillment is idempotent and can safely be retried.
6. No production code may accept a sandbox payment bypass.
Deliver: a file-by-file change list, migration risks, database migration strategy, rollback plan, and test plan. Do not implement yet.
```
### Prompt 2 — Build the step-by-step booking experience
```text
Replace the current single-form checkout with a guarded, accessible booking wizard. Keep the existing visual language, but separate the flow into these sections:
Step 1: Event and ticket configuration. Show event, showtime, ticket tier, quantity, and price range. Validate quantity against server-provided inventory.
Step 2: Seat selection. Show the map, legend, selected-seat count, reservation countdown, and realtime status. Disable unavailable, booked, and seats held by another reservation. Provide retry and reconnect states.
Step 3: Attendee information. Collect and validate full name, email, and phone. Do not create a ticket yet.
Step 4: Review and summary. Show event, date/time/timezone, venue, ticket tier, exact section/row/seat labels, quantity, base amount, discount, taxes/fees, currency, total, reservation expiry, attendee details, and selected payment provider. Require an explicit checkbox confirming the details.
Step 5: Payment. Enable the payment button only when the reservation is active, the summary is accepted, the amount matches the server quote, and attendee data is valid. Never render a payment widget before these checks pass.
Implement the wizard as a state machine, not a collection of loosely coupled booleans. Persist only recoverable session information. On refresh or direct navigation, reload the reservation from the server and redirect to the correct step. On back navigation, do not silently release an active reservation; ask whether the user wants to release it. On expiry, clear the selected seats, show the exact reason, and return the user to Step 2.
Acceptance criteria:
- Payment cannot be reached before Review.
- Review cannot be reached without an active reservation and valid attendee data.
- The summary is generated from a server quote and does not trust client price fields.
- All steps work on mobile and with keyboard navigation.
- Browser refresh, back, duplicate clicks, and slow network responses do not create duplicate orders.
```
### Prompt 3 — Replace seat selection with a reservation API
```text
Design and implement a server-authoritative reservation service. Do not let the browser write directly to seat inventory.
Add authenticated endpoints with strict schemas and rate limits:
- POST `/api/reservations`: `{ eventId, showtimeId, seatIds, quantity, idempotencyKey }`.
- GET `/api/reservations/:reservationId`.
- POST `/api/reservations/:reservationId/renew`.
- DELETE `/api/reservations/:reservationId`.
- POST `/api/reservations/:reservationId/quote`.
- POST `/api/orders`: creates a payment order only for an active reservation.
For `POST /api/reservations`, validate event, showtime, seat IDs, seat-map version, quantity, maximum ticket limit, and user/session ownership. Normalize and sort seat IDs before any write. Reject duplicates and unknown seats. Check every requested seat and create the hold only if all seats are available or already held by the same reservation. The operation must be all-or-nothing: if one seat is unavailable, no seat from this request may be newly held.
Use a single server constant for the hold TTL. Return `{ reservationId, status, seatIds, expiresAt, serverNow, quote, seatMapVersion }`. Never use the client clock as authority. Every mutation must include an idempotency key and return the previous result for a repeated key.
When using Firebase Realtime Database, implement the all-seat claim as a carefully designed atomic multi-location update or server-side transaction strategy. Do not claim seats one by one and then rely on best-effort rollback. If the chosen data store cannot guarantee the required multi-key atomicity for the complete operation, introduce a reservation coordinator record and a reconciliation worker, or move the authoritative inventory transaction to a datastore that supports the required transaction semantics.
Acceptance criteria:
- Two concurrent requests for the same seat result in exactly one successful active reservation.
- A concurrent multi-seat request either holds every requested seat or holds none of the newly requested seats.
- Expired reservations cannot be renewed or converted to payment.
- A reservation cannot be accessed or mutated by another user/session.
- Repeated requests with the same idempotency key do not create a second reservation.
- Unknown or stale seat-map versions are rejected with a recoverable response.
```
### Prompt 4 — Implement realtime seat-map updates correctly
```text
Refactor `SeatMap.tsx` so realtime data is a display projection, not a booking authority. Subscribe to a sanitized event/showtime seat-status path using Firebase `onValue` or the project’s chosen realtime transport. The listener must update seats held, released, booked, expired, or changed by another user while the current user is on the seat-selection step.
Represent local state separately as `pendingSeatIds` and server state as `seatProjection`. A click must call the reservation API and update local UI only after the server confirms success. If the request fails, do not add the seat locally. If another client claims one of the user’s pending seats, mark it as conflict, refresh the reservation, and require replacement selection.
Add connection-state UI, stale-data detection, reconnect refresh, and an accessible legend. Do not expose holder user IDs or attendee information. Display only `available`, `held`, `booked`, `expired`, `selectedByMe`, and `temporarilyPending` states. Debounce rapid clicks, disable duplicate requests per seat, and use an AbortController or request token so late responses cannot overwrite newer state.
Fix all pan/zoom click bugs. A drag or pinch gesture must not trigger a seat click. Keep the map within bounds, support keyboard seat navigation, add a reset control, and ensure seat buttons have stable keys, labels, focus styles, and disabled semantics.
Acceptance criteria:
- User A selects a seat; User B sees it change without refreshing.
- User B cannot select the seat after the realtime update, even if the UI was briefly stale.
- User A receives a clear conflict message if a reservation changes or expires.
- Network loss never turns an unsuccessful reservation request into a local hold.
- Mobile tap, drag, pinch-to-zoom, keyboard selection, and screen-reader labels work independently.
```
### Prompt 5 — Make payment and fulfillment idempotent
```text
and Cashfree integration around the reservation ID and a server-created order. The client may open the provider checkout, but it must not create tickets or mark seats booked.
At order creation, load the active reservation from the server, recompute the total from the event/tier/seat catalog, verify the reservation expiry, validate the coupon atomically, and create a provider order with the exact server amount and currency. Store a mapping between provider order ID and reservation ID.
At webhook/order verification, verify the provider signature using the raw request body where required, fetch the authoritative provider order/payment status, and require a real paid/captured state in every environment. Remove the current sandbox shortcut that treats all sandbox responses as paid. Reject mismatched amounts, currencies, event IDs, reservation IDs, and payment IDs.
Use an idempotent fulfillment function keyed by provider event/payment ID and reservation ID. It must safely handle duplicate webhooks, browser retries, provider polling, server restarts, and a payment-success response arriving before a webhook. Convert the reservation to booked exactly once, create the ticket and booking records, and write an outbox event for email/QR delivery. If fulfillment fails after payment, preserve the paid order and enqueue reconciliation rather than incorrectly releasing a paid seat.
Acceptance criteria:
- A duplicate webhook creates no duplicate ticket, booking, inventory decrement, or coupon usage.
- A paid order cannot fulfill a different reservation.
- A failed or cancelled payment releases the reservation according to the documented policy.
- A payment success with a failed fulfillment enters a visible retry/reconciliation state.
- No client callback alone can issue a ticket.
```
### Prompt 6 — Lock down Firebase and secrets for production
```text
Harden database access and deployment secrets. Remove the tracked Firebase service-account JSON from Git history if it contains real credentials, revoke and rotate the key, and add repository checks that fail when service-account files, private keys, or real `.env` files are tracked.
Rewrite Realtime Database rules using least privilege. Public clients may read only the sanitized seat projection and published event data. Clients may not directly write seats, events, coupons, bookings, tickets, pending orders, processed orders, or fulfillment records. Admin operations must be performed through authenticated server endpoints with role checks. Validate field types, allowed status transitions, owner identity, immutable fields, and server timestamps in rules where client access remains necessary.
Separate development, staging, and production Firebase projects and payment credentials. Set `CASHFREE_ENV` and provider modes from deployment configuration, not hard-coded fallbacks. Fail startup if required production secrets are absent or if a production environment is configured with sandbox credentials.
Add secure headers, CORS allowlisting, request body limits, structured logs with redacted payment and PII fields, rate limiting on reservation/order endpoints, health/readiness endpoints, and alerting for reservation conflicts, payment mismatch, fulfillment retries, and database errors.
Deliver a deployment runbook with migration order, backup/restore procedure, rollback steps, smoke tests against a dedicated test project, and a post-deploy verification checklist.
```
### Prompt 7 — Add regression, concurrency, and production verification tests
```text
Create automated tests for the new booking system. Use a dedicated test Firebase project or a deterministic repository abstraction; never run destructive tests against production.
Unit tests must cover seat-ID normalization, seat-map version checks, quantity limits, price calculations in minor currency units, coupon validation, reservation transitions, expiry, idempotency, and payment payload validation.
Integration tests must cover the complete flow from event selection through review, order creation, provider callback/webhook, fulfillment, confirmation, cancellation, expiry, refresh recovery, and retry.
Concurrency tests must launch at least two users selecting the same seat at nearly the same time, two users selecting overlapping multi-seat groups, repeated reservation calls with the same idempotency key, a late payment for an expired reservation, and duplicate provider webhooks. Assert that inventory, bookings, tickets, coupon counts, and payment/order records remain consistent.
Browser tests must cover keyboard-only use, mobile viewport behavior, map drag versus click, pinch/zoom or zoom controls, realtime changes from a second session, reconnect recovery, slow network, double-click payment, browser refresh, back navigation, and accessible error announcements.
The CI pipeline must run type-check, lint, unit tests, integration tests, build, secret scan, and a smoke test against a started test server. A smoke test must fail when the server is unavailable, but its output must distinguish infrastructure failure from endpoint failure.
```
## Recommended implementation order
Begin with the audit and data-contract work before touching the UI. Next, introduce reservation endpoints behind a feature flag and seed a staging seat catalog. Then implement the realtime seat projection and update the seat map to use the reservation API. Add the wizard and review gate after the reservation response shape is stable. Replace payment fulfillment only after reservation and quote validation are covered by integration tests. Finally, lock rules and secrets, migrate existing records, run concurrency tests, and enable the feature flag gradually.
Do not deploy the new UI before the new server reservation path is active. Do not deploy payment changes before webhook signature verification, idempotency, and reconciliation are tested in a provider test environment. Keep the old booking path disabled for production once the new path is enabled; maintaining two fulfillment authorities will reintroduce duplicate and race-condition risk.
## Production acceptance checklist
| Gate | Must be true before production |
|---|---|
| Reservation authority | All seat claims, renewals, releases, and conversions are server-authoritative. |
| Conflict behavior | Same-seat concurrency tests prove one winner and a clear recoverable loser path. |
| Multi-seat atomicity | A failed multi-seat request cannot leave newly held orphan seats. |
| Realtime UX | A second session sees state changes without refresh, and stale snapshots are reconciled. |
| Review gate | The user sees an exact summary and explicitly confirms it before payment opens. |
| Pricing | The server computes amount, currency, taxes/fees, discounts, and provider payload. |
| Payment | Webhook/signature/order status verification is real in staging and production; no sandbox bypass remains. |
| Fulfillment | Duplicate callbacks are safe and paid-but-unfulfilled orders are recoverable. |
| Security | Direct client writes to inventory and fulfillment records are blocked by rules. |
| Secrets | Service-account credentials are rotated and absent from Git history/current files. |
| Observability | Reservation conflicts, payment mismatches, expiry, and fulfillment retries are measurable and alertable. |
| Recovery | Backups, migration rollback, reconciliation, and incident runbooks have been tested. |
## References
[1]: https://firebase.google.com/docs/database "Firebase Realtime Database documentation"
[2]: https://github.com/Prathamesh404NotFound/ash-vish-event-demo "Ash-Vish Event Demo repository"
[3]: https://ash-vish.netlify.app "Ash-Vish Event Demo live website"
Webhooks documentation"
[5]: https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks "Cashfree Payment Webhooks documentation"
