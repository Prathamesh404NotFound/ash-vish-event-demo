# Firebase Realtime Database Security Rules & Public Pass Setup

## Overview

Ash-Vish Events uses Firebase Realtime Database (RTDB) to store events, bookings, tickets, counters, and digital passes.
To support instant, login-free digital pass verification at event gates (without requiring customers to log in or exposing Firebase Admin credentials to the client), the `passes` node in RTDB is configured as publicly readable.

## Database Rules (`database.rules.json`)

The security model relies on unguessable 24-byte base64url pass slugs combined with 16-character HMAC-SHA256 signatures derived from the server's secret key (`SERVER_HMAC_SECRET`).

```json
{
  "rules": {
    "passes": {
      ".read": true,
      ".write": "auth != null"
    },
    "tickets": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "bookings": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "events": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

## How Public Pass Resolution Works

1. **At Booking Fulfillment:**
   When a booking is confirmed, `server.ts` writes a document to `passes/${passId}` containing the full public ticket payload (`ticketNumber`, `eventTitle`, `venue`, `city`, `date`, `time`, `tierName`, `seatNumber`, `attendeeName`, `qrCodeValue`, `passType`, `paymentStatus`, `amountDue`, `eventGoogleMapsQuery`).

2. **When Customer Opens Pass Link (`/pass/:slug/:signature`):**
   - The browser fetches `/api/passes/:slug/:signature`.
   - `server.ts` performs an anonymous read of `passes/${slug}` from RTDB (`.read: true`).
   - `server.ts` verifies the signature using `crypto.timingSafeEqual` against HMAC-SHA256(`slug|ticketId`).
   - The full pass data is served directly to the browser without requiring a Firebase Admin Auth token or user sign-in.
   - If RTDB anonymous read ever fails, `server.ts` falls back non-blocking to an authenticated admin read.

## Deployment Instructions

To deploy security rules to Firebase RTDB:
```bash
firebase deploy --only database
```
Or update the rules directly in the Firebase Console under **Realtime Database > Rules**.
