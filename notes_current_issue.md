# Current Issue (2026-08-12)

## User screenshot shows (live ash-vish-event.vercel.app):
1. ERROR: `POST /api/razorpay/create-order → 409` (empty body per console)
2. Fallback: "Razorpay backend unavailable — running client-side sandbox flow"
3. "Running Sandbox Razorpay Flow (no SDK / no key)" → payment modal never opens with real gateway
4. Console still shows Razorpay preload warnings (user viewing a build older than a0eb720 OR the strip hook not in build) — they said "fix this pls"

## Prior verification (done earlier today):
- Live create-order works when called with FULL body: eventId, tierId, seatIds matching reservation, amount=rec.quote total, X-Session-Id SAME as reservation creation.
- Real Razorpay API order created OK on production (keys ARE set in Vercel): rzp_order_1786558237691_4k6el3
- create-order validations (server.ts ~line 2111-2135):
  - reservation must be active + owned: ownerId must equal (userId || "anon_user") OR expectedGuest hash (sha256(IP|UA|X-Session-Id) slice 0,16) → 409 "no longer active" if mismatch
  - seatIds normalized must EXACTLY match rec.seatIds → 409 "Seat selection no longer matches"
  - amountInPaise (from body eventId/tierId server price * numSeats - coupon) must be within 50 of rec.quote.totalMinor → 409 "Order amount no longer matches the reviewed total"
- NOTE: body `amount` (user-supplied, from reviewed quote) is used as amountInPaise when reservationId absent?? Actually line: amountInPaise = serverCalculatedAmount*100 always. So mismatch can occur when the user's reviewed quote differs from live server quote (e.g., inventory price changes, or quantity mismatch).

## Suspected root cause of user's 409:
- Frontend (useRazorpay.ts) calls create-order with body built from the REVIEW quote; any deviation (missing eventId/tierId, qty mismatch, coupon difference) → 409
- Need to inspect useRazorpay.ts processRazorpayPayment body construction + CheckoutWizard payment call
- Also possible: reservation expired (5min TTL) between review and payment; then fallback kicks in.

## Recent commits on main:
- 79eff82 (pushed) precise seat-conflict errors + same-buyer hold auto-migration
- 50465e7 isMine fix, a0eb720 preload strip, 60a7e37 step persistence, 910756e step revert fix, fe79d54 Razorpay-only

## Key files:
- src/hooks/useRazorpay.ts (SDK lazy-load + MutationObserver preload strip; processRazorpayPayment builds order body)
- src/pages/CheckoutWizard.tsx (payment step, calls processRazorpayPayment with quote+attendee+reservation)
- server.ts create-order endpoint (line ~2060), validate-payment, webhook
- Vercel deployment for 79eff82 still building when last checked (18:13 UTC)

## Test session for probes:
- SESSION header must be CONSISTENT between reservation create and create-order (guest identity hash includes it)
- Probe reservation auto-expires in 5 min (TTL 300000ms)
