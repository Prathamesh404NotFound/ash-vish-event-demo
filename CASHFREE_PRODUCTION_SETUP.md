# Cashfree Production Setup — Ash-Vish Event Ticketing

Cashfree is the **only** payment gateway in this application. Razorpay has been fully removed.

## Server Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/cashfree/create-order` | Validates the seat reservation (active, owned by this session, seats match, quote matches), then creates a Cashfree order and stores the pending order with a reservation binding in Firebase RTDB. |
| `POST /api/cashfree/verify-payment` | Verifies the webhook signature, confirms the payment status with Cashfree (even in sandbox mode when keys are configured), and finalizes the booking server-side: books the seats, issues the ticket, and decrements inventory. Idempotent — duplicate verifications never double-book. |
| `POST /api/cashfree/webhook` | Cashfree's server-to-server payment notifications. Signature verified with HMAC-SHA256 over `order_id|webhook_timestamp` using `CASHFREE_SECRET_KEY`. Handles `order.paid`, `order.completed`, `payment.authorized`, and `payment.captured`. |

## Environment Variables (Vercel → Settings → Environment Variables)

| Variable | Scope | Value |
|---|---|---|
| `CASHFREE_APP_ID` | Production | Your Cashfree App ID (e.g. `TEST111139115867c9e9c207f88fef0311931111` for sandbox) |
| `CASHFREE_SECRET_KEY` | Production | Your Cashfree Secret Key (e.g. `cfsk_ma_test_...` for sandbox) |
| `CASHFREE_ENV` | Production | `sandbox` for test keys, `production` for live keys |

For live payments, create a production app in the Cashfree Dashboard (Production → API Keys) and set `CASHFREE_ENV=production`.

## Webhook Registration

In the Cashfree Dashboard, register the webhook URL and secret:

- **Webhook URL:** `https://ash-vish-event.vercel.app/api/cashfree/webhook`
- **Webhook Secret:** the same value as `CASHFREE_SECRET_KEY`

Cashfree signs each webhook with `X-Webhook-Signature = HMAC-SHA256(order_id|webhook_timestamp, secret)` sent in the `X-Webhook-Signature` header (header name: `X-Webhook-Signature`-style; the server also accepts `x-cashfree-webhook-signature` and `x-webhook-signature` aliases). Unsigned requests are rejected.

## Fallback Behavior

If the Cashfree API is unreachable (network issue, CDN geo-block, or keys not yet configured), `create-order` transparently falls back to a **local sandbox order** so the checkout is never dead-ended. The payment can then be verified and finalized through the same `verify-payment` endpoint. Once Cashfree keys are configured and reachable, all orders go through the real gateway.

## Testing

- Sandbox test cards: use Cashfree's sandbox mode (`CASHFREE_ENV=sandbox`) with the `TEST...` app ID.
- Local end-to-end suite: `bash scripts/e2e_test.sh` — 17 checks covering atomic seat reservation, idempotency, quote, attendee, order creation, payment verification/finalization, idempotent re-verification, seat conflict, the 10-way concurrent claim race, and hold expiry sweep.
- `npm run build` and `npx tsc --noEmit` should both be clean before deploying.

## Post-Deploy Checklist

1. Set `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` in Vercel (Production scope).
2. Register the webhook URL in the Cashfree Dashboard.
3. Smoke-test: book a ticket on production with a sandbox test card; confirm the QR pass is issued and the seat is marked `booked` in Firebase.
4. Switch to live keys + `CASHFREE_ENV=production` when ready for real payments.
