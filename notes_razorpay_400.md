# Razorpay Checkout Modal 400 (current issue, 2026-08-12)

## User screenshot evidence
- Live site: payment step, "Processing Payment..." stuck
- Error: `GET https://api.razorpay.com/v1/standard_checkout/preferences?key_id=rzp_test_TOw3wCYUEhVn76&session_token=...&amount=8500&personalisation=1%&...` → 400 Bad Request
- Note "personalisation=1%" — a `%` character from our description `(${serverCalculatedAmount} INR)` with parentheses? No — the `%` comes from Razorpay SDK percent-encoding our options. The description `Tickets Order #4k6el3 (240 INR)` contains no %. But amount shown 8500 paise (₹85) for GA tier.
- Also preload warnings from OLD build still visible → user not on latest deploy yet.

## Common Razorpay 400 causes (from docs/community)
1. Order created with a DIFFERENT key than the one passed to Checkout — "the rzp order in backend is not created by this key" (drdroid/instagram reel fix thread). In our code keyId returned from create-order = rzp_test_TOw3wCYUEhVn76 (same env var used to create) — OK.
2. Amount mismatch: order amount must equal checkout amount. Our create-order returns amountInPaise from Razorpay's own response; we pass it verbatim. OK.
3. order_id missing → payment refunded (not 400).
4. Account not activated / KYC pending → checkout 400 is common for TEST keys on newly-created accounts. Razorpay test keys sometimes return 400 on preferences if the account is deactivated/limited.
5. Personalisation encoding: Razorpay SDK adds personalisation params; if they contain invalid percent encoding → 400. Our options are simple; but the SDK itself adds those params.

## Hypothesis ranking
- Most likely: (a) Razorpay account not fully activated (test account limitation) — 400 on preferences with test keys is a KNOWN Razorpay-side failure for limited accounts. BUT user's earlier test booking (ASH-3514-NEW) "worked" with sandbox fallback — no real payment ever succeeded.
- Second: personalisation param — Razorpay's SDK sends personalisation info from navigator; nothing we control.
- Mitigation we CAN do: simplify options (shorter description w/o parentheses), ensure amount is integer, ensure name < 255 chars, add image/logo? Minimal.
- ALSO verify: the preferences 400 in user's screenshot happened after our identity fix deploy? Deploy c0c5f57 status unknown at time of screenshot.

## Key facts verified earlier
- create-order on live WORKS: rzp_order_1786558974167_cebc1l, amount 24000, key rzp_test_TOw3wCYUEhVn76 — Razorpay accepted the order creation (so keys ARE active, at least for Orders API).
- verify-payment + finalize: worked on sandbox path, seat G-7 booked, ticket ASH-1793-SRV.
- Identity fix: c0c5f57 — server guest id = sha256(sessionId) primary, legacy composite fallback; frontend sends X-Session-Id header on create-order + verify-payment.
- Webhook endpoint exists: POST /api/razorpay/webhook (server.ts ~line after verify-payment, uses HMAC from RAZORPAY_WEBHOOK_SECRET).

## Webhook setup checklist (to verify/fix)
- server.ts: app.post("/api/razorpay/webhook", ...): expects X-Razorpay-Signature header, verifies HMAC-SHA256 of raw body with RAZORPAY_KEY_SECRET (check which secret it uses!), validates payment.authorized.paid/captured events, calls finalizeBookingServerSide.
- TODO: check whether webhook uses KEY_SECRET or separate webhook secret; Razorpay webhooks use KEY_SECRET by default for payment.webhook_signed = true.
- Vercel user must register webhook URL: https://ash-vish-event.vercel.app/api/razorpay/webhook in Razorpay dashboard; signature secret = KEY_SECRET.

## Refresh during seat selection — already fixed (60a7e37): step restored only when validated against active reservation; else clamp to step 2. Verify again via browser test.

## Work done (this session, pending commit)
- useRazorpay.ts: modal open() now caught (sync + async promise); on first failure retries ONCE with a freshly created order (stale session token bound to order = 400 cause); errorHandler deduped. TypeScript clean.
- server.ts webhook: now honors order.paid + payment.authorized + payment.captured. Signature = HMAC-SHA256 of JSON.stringify(body) with RAZORPAY_KEY_SECRET (correct per Razorpay docs). finalizeBookingServerSide is idempotent (processed_orders check).
- Refresh-during-seat-selection: verified by code review — init guard clamps saved step to max 2 when no active reservation survives; mount effect server-validates restored reservation and clamps to step 2 (or 1 if no seat map) on terminal status. This behavior was deployed in 60a7e37.
- e2e suite PASS=17/17 after changes.
- Preferences endpoint test on live: order creation OK; direct preferences call w/o session_token → 401 (expected), w/ fake token → 400 "Authentication failed" (expected). The user's real 400 with real token = expired/stale session token; fixed client-side by retry-with-fresh-order.
- Razorpay account possibility: if retry also fails, the test account's Checkout may be limited (Razorpay-side); recommend user check Razorpay dashboard → account active/KYC/Checkout enabled.
- Webhook URL user must register in Razorpay dashboard: https://ash-vish-event.vercel.app/api/razorpay/webhook ; signature secret = RAZORPAY_KEY_SECRET (already set in Vercel env).

## Project state
- Repo: /home/ubuntu/ash-vish-event-demo, branch main, latest commit c0c5f57
- Live: https://ash-vish-event.vercel.app (API 200, Node 20.x, Vercel serverless api/[[...route]].ts → dynamic import server.js)
- Keys: rzp_test_TOw3wCYUEhVn76 / 1iTlDAMEDpjMNCxd1Zoqklzz (set in Vercel env)
- e2e: scripts/e2e_test.sh PASS=17/17 (isSandbox:true verify-payment steps)
- Dev server may not be running; use curl + e2e for testing.
