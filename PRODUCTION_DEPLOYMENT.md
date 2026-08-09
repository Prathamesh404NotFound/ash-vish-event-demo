# Production Deployment Topology & API Routing Guide

This document details the production architecture, netlify proxy routing rules, CORS security configuration, and post-deployment API smoke testing procedures.

---

## 1. System Deployment Topology

```
+------------------------------------+        Proxy /api/* redirects         +---------------------------------------+
|        Netlify Frontend            | -------------------------------------> |        Always-On Express API          |
|  (Static Assets: SPA index.html)   |   (Status 200 via netlify.toml)       |     (Cloud Run / VPS Node / Bun)      |
|    Domain: ash-vish.netlify.app    |                                       | Port: 3000 / Environment Variables    |
+------------------------------------+                                       +---------------------------------------+
```

1. **Frontend Tier (Netlify)**:
   - Hosts static SPA assets (`dist/`).
   - Handles client-side routing (`/*` -> `/index.html`).
   - Uses `netlify.toml` and `public/_redirects` to proxy `/api/*` requests to the always-on backend server with `status = 200` (rewrite mode).

2. **Backend Tier (Cloud Run / Node Express Server)**:
   - Always-on Express application bundled into `dist/server.cjs` or running via `tsx server.ts`.
   - Binds to `0.0.0.0:3000` with CORS middleware enabling credentials and headers (`Authorization`, `X-User-Role`).
   - Manages stateful concerns like seat-hold timers, real-time ticket verifications, HMAC-SHA256 signatures, and Firebase Realtime Database synchronizations.

---

## 2. API Proxy Configuration (`netlify.toml` & `public/_redirects`)

To prevent 404/405 errors on Netlify, the following rules are active:

### `netlify.toml`
```toml
[build]
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/api/*"
  to = "https://ais-dev-ic33ibe3lcgrjqy6qdkija-130685679103.asia-southeast1.run.app/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### `public/_redirects`
```
/api/*  https://ais-dev-ic33ibe3lcgrjqy6qdkija-130685679103.asia-southeast1.run.app/api/:splat  200!
/*      /index.html  200
```

---

## 3. Endpoints Matrix & Security Matrix

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Health & database connectivity check |
| `POST` | `/api/auth/verify` | Authenticated | Server-side Firebase ID token verification & role sync |
| `GET` | `/api/coupons` | Admin (`verifyRole(['admin'])`) | Retrieve list of server-managed coupons |
| `POST` | `/api/coupons/validate` | Public | Validate coupon code against event & calculate discount |
| `POST` | `/api/coupons/create` | Admin (`verifyRole(['admin'])`) | Create new discount coupon |
| `POST` | `/api/coupons/toggle` | Admin (`verifyRole(['admin'])`) | Enable / disable coupon |
| `DELETE` | `/api/coupons/:code` | Admin (`verifyRole(['admin'])`) | Delete coupon |
| `GET` | `/api/admin/reviews` | Admin (`verifyRole(['admin'])`) | Fetch all event reviews for moderation |
| `GET` | `/api/events/:eventId/reviews` | Public | Fetch published reviews for an event |
| `POST` | `/api/events/:eventId/reviews` | Public / Buyer | Submit fan review |
| `POST` | `/api/admin/reviews/toggle-visibility` | Admin (`verifyRole(['admin'])`) | Publish / Hide review |
| `DELETE` | `/api/admin/reviews/:reviewId` | Admin (`verifyRole(['admin'])`) | Delete fan review |
| `GET` | `/api/organizers` | Admin (`verifyRole(['admin'])`) | Fetch organizer applications |
| `POST` | `/api/organizers/register` | Public / User | Apply for organizer account |
| `GET` | `/api/organizers/status` | Admin (`verifyRole(['admin'])`) | Fetch organizer approval status |
| `POST` / `PATCH` | `/api/organizers/status` | Admin (`verifyRole(['admin'])`) | Approve or reject organizer application |

---

## 4. Smoke Testing Safeguard

Run the automated smoke test script locally or in CI/CD pipeline:

```bash
# Run against local dev server
npm run test:smoke

# Run against live production deployment
TEST_BASE_URL=https://ash-vish.netlify.app npm run test:smoke
```

---

## 5. Required Environment Variables

| Variable | Purpose | Location |
| :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | Firebase Realtime DB Project | Server `.env` |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin Service Account Email | Server `.env` |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin RSA Private Key | Server `.env` |
| `RAZORPAY_KEY_ID` | Razorpay Gateway Credentials | Server `.env` |
| `RAZORPAY_KEY_SECRET` | Razorpay Gateway Secret | Server `.env` |
| `CASHFREE_APP_ID` | Cashfree Gateway Credentials | Server `.env` |
| `CASHFREE_SECRET_KEY` | Cashfree Gateway Secret | Server `.env` |
