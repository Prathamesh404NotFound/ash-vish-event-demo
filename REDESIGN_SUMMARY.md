# Booking System Redesign — Production Release

**Event:** Ash-vish Events (`ash-vish.netlify.app`, backend on Cloud Run)
**Scope:** Stepwise checkout wizard, pre-payment review summary, atomic seat reservations with real-time seat map, and production-hardening fixes.
**Validated:** TypeScript strict build, production build, and a 17-assertion end-to-end suite (reservation lifecycle, double-booking races, idempotency, payments, inventory deduction) — all passing.

## 1. Stepwise Booking Wizard (`src/pages/CheckoutWizard.tsx`, route `/checkout`)

The checkout is now a five-step wizard that shows exactly one section at a time, in order:

| Step | Section | What happens |
|---|---|---|
| 1 | Tickets | Tier + quantity confirmation |
| 2 | Seats | Interactive seat map; selection is held server-side for 5 minutes |
| 3 | Attendee | Name, email, phone (persisted to server; survives reload) |
| 4 | Review | Full summary of event, tier, seats, attendee, coupons and **server-authoritative total** |
| 5 | Payment | Razorpay / Cashfree, bound to the reservation |

Back/forward navigation between steps is enforced (no jumping ahead). The reservation is released if the user abandons the wizard (with StrictMode-safe unmount guards that prevent the dev double-invocation from releasing a freshly-created hold).

## 2. Pre-Payment Review Summary (Step 4)

The review step renders every user selection — event, tier and price, seats with letter-row labels, attendee contact details, coupon discounts, and the **total amount fetched fresh from the server quote endpoint** — before any payment button appears. The displayed total can never diverge from what is actually charged, because the payment handlers re-validate the reservation and quote server-side.

## 3. Atomic Reservation System (server-authoritative, no double-booking)

The old client-side seat claims are removed entirely. The new flow:

- `POST /api/reservations` runs an **RTDB transaction** per seat: a seat can only be held if it is `available`, and the hold record is written inside the transaction — two concurrent requests for the same seat physically cannot both succeed (verified with a 10-way concurrent hammer test: all challengers get `409`).
- Holds expire automatically after 5 minutes (max 3 extensions via `PUT /api/reservations/:id/renew`).
- Seat changes are atomic: `PUT /api/reservations/:id/selection` releases the old seats and claims the new ones in one transaction.
- Idempotency keys prevent duplicate reservations on retries.
- Payment finalization validates the attached reservation (`POST /api/razorpay|cashfree/create-order` requires a `reservationId`; the verify/finalize path re-checks the reservation is still active and locks it to the paid booking).
- **Price source of truth is the database**, not the client: the quote and finalize paths both read `events/{id}/ticketTiers` and reject anomalous order amounts (>1.5x server-calculated total).

## 4. Real-Time Seat Map

`BookingContext` subscribes to `seats/{eventId}` via Firebase `onValue`; every client sees seat status changes (held → available → booked) the instant they happen on the server. The map shows **"Selected by You"** (matched against the server-returned `ownerId`, so identity is consistent across page reloads), "Held", and "Booked" states. Users not in the seat step still receive live updates.

## 5. Production Bugs Found and Fixed

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | **Ticket inventory never decremented** — the finalize inventory transaction used `.map()` on the RTDB REST shape (numeric-key object), threw, and silently returned failure while the ticket was still issued. Payments "succeeded" but inventory overselling could never be detected. | Critical | `normalizeTiers()` helper converts object-map tiers to arrays for every server path (quote, price recheck, inventory deduction, price lookups); inventory now decrements atomically inside the transaction (verified VIP 100 → 99 on finalize) |
| 2 | **Seat buttons treated as drag targets** — the seat map's drag handler swallowed clicks, so seat selection appeared broken. | Critical (UI) | Seat buttons are drag-exempt |
| 3 | **"isMine" identity mismatch** — seat ownership compared the client's raw session ID against the server's hashed owner ID, so held seats never showed as "yours". | High | `ownerId` returned in the reservation response; SeatMap matches on it |
| 4 | **React 18 StrictMode races** — dev double-invocation aborted the pending reservation request, surfacing `signal is aborted without reason`, and created duplicate reservations. | High | Abort-token self-abort suppression, in-flight request guard, 400 ms unmount threshold for reservation release |
| 5 | **Stale idempotency cache** — a cached response for a now-expired reservation was replayed instead of creating a fresh one. | Medium | Server discards cached entries referencing terminal/expired reservations |
| 6 | **Price display mismatch** — review step fell back to the client's cached tier price (stored in minor units) and rendered it as rupees (e.g. ₹24,000 instead of ₹240) when the server quote hadn't been refreshed. | High (trust) | Quote is refreshed on entering the review step; restored checkout sessions are sanitized against live DB tiers; a dead restored reservation clamps the wizard back to the seat step |
| 7 | **Attendee form reset to demo placeholders** on every render. | Low | Form initializes from the server reservation's persisted attendee details |
| 8 | **Payment amount unit confusion** — finalize recheck and Cashfree orders now consistently use minor units (paise) against DB prices | Medium | Amount validation + `amountInPaise` for Cashfree |
| 9 | **Weak payment test/assertion** — the verify endpoint could return HTTP 409 with `verified:true` while finalization failed. | Medium | e2e now requires `"success":true`; finalize returns proper error codes |
| 10 | **Firebase security rules** — client writes to reservations/seats were not fully denied. | Medium | `database.rules.json`: sensitive paths require admin auth; client reads only where needed |

## 6. Deployment Checklist

1. **Backend (Cloud Run):** rebuild the Docker image from this commit (`server.ts` at repo root) and redeploy. Environment variables required: `FIREBASE_PRIVATE_KEY` (service account), `FIREBASE_PROJECT_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `CASHFREE_CLIENT_ID`, `CASHFREE_SECRET_KEY`.
2. **Firebase RTDB rules:** `firebase deploy --only database` (rules file: `database.rules.json`).
3. **Frontend (Netlify):** `npm run build` → deploy `dist/` (or connect Netlify to this branch).
4. **Smoke test in production:** `bash scripts/e2e_test.sh` against the live URL (change `BASE` in the script) — covers the full lifecycle including a 10-way concurrency race.

## 7. Files Changed

`server.ts` (backend), `src/pages/CheckoutWizard.tsx` (new), `src/pages/CheckoutPage.tsx` (legacy route kept but `/checkout` points to the wizard), `src/contexts/BookingContext.tsx`, `src/components/SeatMap.tsx`, `src/App.tsx`, `src/main.tsx`, `database.rules.json`, plus new test scripts under `scripts/` (`e2e_test.sh`, `db_admin.ts`, `cleanup_reservations.ts`, `reset_seat.ts`, `get_seat_status.ts`, `dump_reservations.ts`, `restore_inventory_after_tests.ts`).
