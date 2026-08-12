# Razorpay-Only Production Setup (Vercel)

Cashfree has been fully removed from the application. **Razorpay is the only payment gateway.** The latest commit on `main` restores the complete Razorpay flow: order creation with atomic reservation binding, payment verification with webhook HMAC signature checking, and the checkout wizard's Razorpay modal (UPI, Cards, Netbanking, Wallets).

## Required Environment Variables (Vercel → Project → Settings → Environment Variables → Production)

| Variable | Where to get it | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | Razorpay dashboard → Settings → API Keys | e.g. `rzp_test_...` (sandbox) or `rzp_live_...` (production) |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → Settings → API Keys | Keep this secret; never commit it |
| `RAZORPAY_ENV` | Set manually | `sandbox` for testing, `production` for live payments |

All other variables (Firebase, security settings) stay exactly as they are. Delete any `CASHFREE_*` variables if they still exist in the dashboard.

## Test vs Live

| Mode | `RAZORPAY_ENV` | Keys to use | Webhook note |
|---|---|---|---|
| Test | `sandbox` | Razorpay **sandbox** key ID + secret (`rzp_test_...`) | Test cards work out of the box |
| Live | `production` | Razorpay **live** key ID + secret (`rzp_live_...`) | Orders are real; enable payment notifications |

## Webhook Configuration

In the Razorpay dashboard (Settings → Webhooks), point the payment notification URL to:

```
https://<your-vercel-domain>/api/razorpay/webhook
```

The webhook verifies the `x-razorpay-signature` header (HMAC-SHA256 of `order_id|payment_id` using your key secret) before finalizing any seat claim.

## Post-Deploy Checklist

1. Vercel redeploys automatically from `main`.
2. On the site: pick event → seats → attendee → review → pay. The payment screen shows **Razorpay only** (no gateway selector, no Cashfree).
3. The Razorpay Checkout modal opens with UPI/Card/Netbanking options. In sandbox, use Razorpay's test card numbers (e.g. `4111 1111 1111 1111`, any future date, any OTP).
4. After a successful test payment, the QR pass is issued and the seat is marked booked in real time for all viewers.

## Test Cards (sandbox)

Use Razorpay's standard test numbers: Card `4111 1111 1111 1111`, expiry any future date, CVV any 3 digits, OTP any value. UPI succeeds with any test UPI ID.
