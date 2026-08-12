# Cashfree-Only Production Setup (Vercel)

Razorpay has been fully removed from the application. **Cashfree is the only payment gateway.** Commit `0638b31` ("feat: remove Razorpay, Cashfree-only payment gateway") on `main` is the deployment target.

## 1. Push Status

- Commit `0638b31` is pushed to `main` at `Prathamesh404NotFound/ash-vish-event-demo`.
- Vercel automatically builds from `main`. If the last deployment (commit `8a015b4`) is currently live, trigger a new deployment: either wait for the webhook from the push, or in the Vercel dashboard open the project and click **Redeploy** on the latest commit.
- The build command is unchanged (`npm run build` = vite build + esbuild for the serverless backend), so the build step in your Vercel log will pass exactly as before.

## 2. Required Environment Variables in Vercel

In the Vercel dashboard, open the project → **Settings → Environment Variables** and make sure these exist (add/verify both Production and Preview):

| Variable | Where to get it | Required? |
|---|---|---|
| `CASHFREE_APP_ID` | Cashfree dashboard → Settings → API Keys (your App ID) | Yes |
| `CASHFREE_SECRET_KEY` | Cashfree dashboard → Settings → API Keys (Secret Key, prefixed `cfsk_`) | Yes |
| `CASHFREE_ENV` | `production` for live payments; `sandbox` for testing with Cashfree sandbox keys | Yes |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase service account JSON (already configured) | Yes |
| `VITE_FIREBASE_*` (all client keys) | Firebase project settings (already configured) | Yes |
| `GEMINI_API_KEY`, `APP_URL`, `SERVER_HMAC_SECRET` | Existing setup (already configured) | As before |

**Remove (do not set) any Razorpay variables** that may still be configured in Vercel:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- Any other `RAZORPAY_*` entry

The code no longer reads these; leaving them set does no harm, but removing them keeps the deployment clean.

## 3. Switching Between Test and Live Payments

| Mode | `CASHFREE_ENV` | Keys to use | Webhook note |
|---|---|---|---|
| Test | `sandbox` | Cashfree **sandbox** App ID + Secret Key | Configure `https://<your-domain>/api/cashfree/webhook` in Cashfree sandbox settings |
| Live | `production` | Cashfree **live (production)** App ID + Secret Key | Configure the same URL in Cashfree production settings and enable payment notifications |

The sandbox e2e bypass header (`X-Cashfree-E2E`) is code-gated to `CASHFREE_ENV=sandbox`, so it can never succeed in a production deployment.

## 4. Post-Deploy Verification Checklist

1. Deploy completes with no build errors (commit `0638b31` builds cleanly — verified: typecheck + production build + e2e 17/17).
2. On the site: pick seats → fill attendee → review → pay. The payment screen should show **Cashfree only** (no gateway selector, no Razorpay).
3. Complete a real test payment (sandbox or live ₹1-style test), then check:
   - Ticket issued with the correct seat(s)
   - Seat on the map shows **booked** in real time for all viewers
   - Second user cannot reserve the same seat (atomic server-authoritative hold)
4. In Cashfree dashboard, confirm the order appears under Orders.

## 5. Webhook URL

Point Cashfree's payment notification/webhook URL to:

```
https://<your-vercel-domain>/api/cashfree/webhook
```

The webhook signature is validated with `CASHFREE_SECRET_KEY` (HMAC-SHA256 over the base64 payload) before any booking finalization.
