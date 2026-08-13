# Production Deployment Instructions
**Author:** Manus AI · **Date:** August 13, 2026
**Target environments:** Frontend and backend on [Vercel](https://ash-vish-event.vercel.app), database on Firebase Realtime Database.
This document describes how to move the redesigned booking system to the live production site. The changes have been validated locally against a TypeScript strict build, a production build, and a 17-assertion end-to-end suite that exercises the complete reservation lifecycle including a ten-way concurrent double-booking race. **Note:** this commit removes all external payment gateways — booking confirmation is now fully server-authoritative via `/api/purchase` (reservation re-validation, coupon application, and atomic seat claim + ticket issuance on the server). There are no payment gateway secrets required anywhere.
## Overview of What Changed
The checkout flow is now a five-step wizard that presents exactly one section at a time — tickets, seats, attendee details, a full review summary, and finally payment — so users can never reach the payment screen without first confirming their selections. Behind it sits a fully server-authoritative reservation system: seats are no longer claimed from the client; instead every claim runs inside a Firebase Realtime Database transaction on the server, which makes it physically impossible for two simultaneous requests to hold the same seat. A realtime subscription pushes every seat status change to all connected users within milliseconds.
The most important production fix in this release is a **critical inventory bug**: payment finalization was silently failing to decrement ticket inventory because the server's inventory transaction called `.map()` on the tier collection in the shape returned by the RTDB REST API (a numeric-key object rather than an array), which threw and short-circuited the deduction while the ticket was still issued. A `normalizeTiers()` helper now converts the REST shape into a stable array for every server path that touches tiers — quote computation, price revalidation, inventory deduction, and price lookups — and inventory was verified to decrement atomically inside the payment transaction (VIP tier moved from 100 to 99 on a completed payment during validation).
## Step 1 — Backend: Rebuild and Redeploy to Cloud Run
The backend is the single `server.ts` file at the repository root, containerized for Cloud Run. Rebuild the image from the pushed commit and redeploy the service.
```bash
# Build the image from the pushed commit
gcloud builds submit --tag gcr.io/PROJECT_ID/ash-vish-backend .
# Redeploy the Cloud Run service
gcloud run deploy ash-vish-backend \
  --image gcr.io/PROJECT_ID/ash-vish-backend \
  --region REGION \
  --port 8080
```
Replace `PROJECT_ID` with your Google Cloud project ID and `REGION` with the service region. Confirm the environment variables are set on the service; the required variables for the new functionality are the same as before, with no new secrets required:
| Variable | Purpose |
|---|---|
| `FIREBASE_PRIVATE_KEY` / `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` | Admin access to RTDB for reservations, inventory transactions, and bookings |
| (no payment gateway secrets required) | Booking confirmation is server-authoritative via `/api/purchase` — there is no external payment gateway |
After redeploying, verify the health endpoint responds and run the smoke suite once against the live URL:
```bash
sed 's|http://localhost:3000|https://YOUR_CLOUD_RUN_URL|' scripts/e2e_test.sh > /tmp/e2e_live.sh
bash /tmp/e2e_live.sh
```
The suite releases its own test seats and restores tier inventory on completion, so it is safe to run against production inventory for the demo event.
## Step 2 — Firebase Realtime Database Rules
The hardened security rules deny all client writes to reservations, seats, and order paths; only the server (admin SDK) can modify them. Deploy them with the Firebase CLI:
```bash
firebase deploy --only database --project ashevents-aa490
```
The rules file in this commit is `database.rules.json`. Client reads are preserved for the event catalog, coupons, tickets, and bookings so the frontend continues to render without admin privileges.
## Step 3 — Frontend: Deploy to Netlify
The frontend builds to `dist/` and is served by the backend container; for Netlify, build the React app and publish the static output:
```bash
npm install
npm run build
# Upload the dist/ folder to Netlify (drag-and-drop on app.netlify.com, or use the CLI)
npx netlify deploy --prod --dir=dist
```
Alternatively, connect the Netlify site to the GitHub branch so deploys happen automatically on push. Note that the wizard is mounted at the `/checkout` route, which `src/App.tsx` now resolves; the legacy `CheckoutPage.tsx` remains in the tree but is no longer the active route, so no further action is needed.
## Step 4 — Post-Deploy Verification
Work through one real booking on the live site and confirm each of the following: selecting a seat shows it marked **"Selected by You"**; opening the same event page in a second browser or incognito window shows that seat as **"Held"** within seconds; completing the review step shows the server-fetched total before payment; and clicking **Confirm &amp; Book** issues the ticket (returned by the server) while the event page's tier inventory decreases by one.
The table below summarizes the validation already completed locally:
| Validation | Result |
|---|---|
| `npx tsc --noEmit` (strict) | Pass |
| `npm run build` (production) | Pass |
| End-to-end suite, run 1 | 17/17 pass |
| End-to-end suite, run 2 (repeatability) | 17/17 pass |
| 10-way concurrent claim race on one seat | All 10 challengers rejected (409), holder intact |
| Inventory decrement on payment finalize | Verified (VIP 100 → 99) |
| Browser walkthrough of full wizard | Verified end-to-end |
## Rollback
If any issue appears after deployment, the backend and frontend can be rolled back independently to the previous commit (`ee610f6`), which contains the earlier codebase. The database rules change is reversible by redeploying the previous rules file, and the new reservation records will simply expire after five minutes without affecting existing bookings.
