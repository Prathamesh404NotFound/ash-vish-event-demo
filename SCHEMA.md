# Ash-Vish Events — Realtime Database Schema

This document outlines the base structure and data models for the Ash-Vish Events ticket booking platform.

## 1. `users` Node (`/users/$uid`)
Stores customer and account profiles. The `role` field defaults to `"customer"` on signup and can only be modified by an administrator server-side.

```json
{
  "users": {
    "$uid": {
      "id": "string (Firebase Auth UID)",
      "name": "string",
      "email": "string",
      "phone": "string (optional)",
      "photoUrl": "string (optional)",
      "role": "customer | admin | ticket_counter",
      "createdAt": "ISO 8601 string"
    }
  }
}
```

## 2. `staff` Node (`/staff/$uid`)
Protected read-only node managed exclusively by administrators to grant operational system privileges (`admin` or `ticket_counter`).

```json
{
  "staff": {
    "$uid": {
      "id": "string (Firebase Auth UID)",
      "email": "string",
      "role": "admin | ticket_counter | auditor",
      "status": "active | suspended",
      "assignedBy": "string (Admin UID)",
      "assignedAt": "ISO 8601 string",
      "createdAt": "ISO 8601 string",
      "updatedAt": "ISO 8601 string (optional)",
      "suspendedAt": "ISO 8601 string (optional)"
    }
  }
}
```

### Server-side RBAC hierarchy

The server maps legacy Firebase roles into a four-level RBAC hierarchy enforced by the `requireRole()` middleware on every admin/counter endpoint:

| Firebase role | RBAC role | Level | Capabilities |
|---|---|---|---|
| `admin` | `super_admin` | 4 | Everything; staff account management; audit log |
| `organizer` | `event_manager` | 3 | Event CRUD, seat map deployment, coupons, ticket token generation |
| `ticket_counter` | `counter_staff` | 2 | Walk-in bookings, ticket redemption, token generation |
| `auditor` | `auditor` | 1 | Read-only: audit log and staff listing |

A higher level implicitly grants all permissions of lower levels. `counter_staff` requesting an `event_manager`-only endpoint is rejected with HTTP 403. Staff records are keyed by a Firebase Auth uid; a Firebase user must exist before a staff record can grant them a role.

## 2a. `audit_log` Node (`/audit_log/$pushId`)
Immutable append-only log of every state-changing action in the admin and counter panels. The `actor_id` is always the specific staff member that performed the action — never a generic `system` actor.

```json
{
  "audit_log": {
    "$pushId": {
      "id": "string",
      "actor_id": "string (Staff UID)",
      "actor_role": "string (RBAC role at the time of the action)",
      "action": "string (e.g. event.created, event.updated, event.deleted, event.seats.updated, coupon.created, coupon.toggled, coupon.deleted, order.created.walk_in, seats.sweep, staff.created, staff.updated)",
      "entity_type": "string (event | coupon | order | seats | staff)",
      "entity_id": "string | null",
      "before_state": "any | null",
      "after_state": "any | null",
      "timestamp": "ISO 8601 string"
    }
  }
}
```

Read-only endpoint: `GET /api/audit-log` (super_admin, event_manager, auditor). No public write path exists; entries are created only by the internal `writeAuditEntry()` helper.

## 3. `events` Node (`/events/$eventId`)
Catalog of concerts, comedy shows, plays, and festivals.

```json
{
  "events": {
    "$eventId": {
      "id": "string",
      "title": "string",
      "artist": "string",
      "category": "music | comedy | theater | festival | sports",
      "date": "string (YYYY-MM-DD)",
      "time": "string (HH:MM AM/PM)",
      "venue": "string",
      "city": "string",
      "posterUrl": "string (URL)",
      "bannerUrl": "string (URL)",
      "description": "string",
      "minPrice": "number",
      "cashOnCounterOnly": "boolean (optional, default false - online booking defers payment until counter arrival)",
      "status": "upcoming | ongoing | sold_out | completed",
      "ticketTiers": [
        {
          "id": "string",
          "name": "string",
          "price": "number",
          "capacity": "number",
          "soldCount": "number",
          "perks": ["string"]
        }
      ],
      "seatMap": {
        "rows": "number",
        "columns": "number",
        "aisles": ["number"]
      },
      "createdAt": "ISO 8601 string"
    }
  }
}
```

## 4. `seats` Node (`/seats/$eventId/$seatId`)
Tracks real-time seat availability and temporary holding state during checkout. This is the **single source of truth** for seat availability for both the online booking flow and the counter panel; neither maintains a separate cache.

```json
{
  "seats": {
    "$eventId": {
      "$seatId": {
        "id": "string (e.g. R1-C5)",
        "seatId": "string",
        "status": "available | held | booked | sold",
        "priceTierId": "string",
        "row": "number (optional)",
        "col": "number (optional)",
        "heldBy": "string (User UID)",
        "ownerId": "string (legacy alias for hold owner)",
        "reservationId": "string (reservation holding this seat)",
        "heldAt": "number (timestamp ms)",
        "holdExpiresAt": "number (timestamp ms = now + SEAT_HOLD_DURATION_MS, 10 minutes)",
        "bookedBy": "string (User UID)",
        "bookedAt": "number (timestamp ms)",
        "ticketId": "string (optional)",
        "bookingId": "string (optional)",
        "orderId": "string (order that booked this seat)",
        "statusChangedAt": "number (timestamp ms)",
        "statusChangedBy": "string (reservation | booking | hold_expiry | release)"
      }
    }
  }
}
```

### Seat state machine

All seat transitions run inside server-side transactions (Firebase RTDB ETag conditional writes, which are the closest equivalent RTDB offers to `SELECT ... FOR UPDATE`):

```
available ──(claimSeatsAtomically)──▶ held ──(finalizeBookingServerSide / bookSeat)──▶ booked ──(sold)──▶ sold
   ▲                                     │                                                    │
   │                                     │ (hold expires after SEAT_HOLD_DURATION_MS)         │
   └────(releaseSeat / hold expiry)──────┘                                                    │
                                                                                              ▼
                                                                                never eligible for a new claim
```

- **available → held**: all-or-nothing across the requested seat set; if any seat fails, every already-claimed seat is released back to `available` via the shared `releaseSeat()` helper.
- **held → booked**: only inside `finalizeBookingServerSide`, invoked after server-side payment verification (Razorpay webhook HMAC or verified direct purchase). A seat can only be booked if its hold belongs to the paying buyer or has expired.
- **hold expiry**: lazy — every transaction re-reads the current seat value; expired holds are released by `releaseExpiredHoldIfAny()` / `releaseSeat()` and by the 30-second background `sweepExpiredHolds()` job plus the manual `/api/seats/sweep-holds` endpoint, all of which run the same shared release logic.
- **booked / sold**: the seat is permanently unavailable; booked tickets are never re-sold.

## 5. `bookings` Node (`/bookings/$bookingId`)
Financial transaction and reservation records.

```json
{
  "bookings": {
    "$bookingId": {
      "id": "string",
      "userId": "string (User UID)",
      "eventId": "string",
      "eventTitle": "string",
      "totalAmount": "number",
      "paymentStatus": "paid | pending | failed",
      "amountDue": "number (INR, 0 once paid)",
      "paymentMethod": "cashfree | counter_cash | counter_upi | reservation_pending",
      "paymentId": "string (Cashfree Order ID / Transaction Ref)",
      "attendeeDetails": {
        "name": "string",
        "email": "string",
        "phone": "string"
      },
      "seats": ["string"],
      "createdAt": "ISO 8601 string"
    }
  }
}
```

## 6. `tickets` Node (`/tickets/$ticketId`)
Issued digital QR entry passes and reservation passes.

```json
{
  "tickets": {
    "$ticketId": {
      "id": "string",
      "ticketNumber": "string (ASH-####-SRV or ASH-RES-####)",
      "bookingId": "string",
      "ownerId": "string (User UID)",
      "eventId": "string",
      "tierId": "string",
      "tierName": "string",
      "price": "number",
      "seatNumber": "string (optional)",
      "qrCodeValue": "string (signed HMAC token ASH_PASS.* or ASH_RES.*)",
      "passType": "entry | reservation (entry = gate-valid, reservation = unpaid reservation pass)",
      "paymentStatus": "paid | pending",
      "amountDue": "number (INR, 0 once paid)",
      "status": "valid | used | redeemed | cancelled | void",
      "issuedAt": "ISO 8601 string",
      "scannedAt": "ISO 8601 string (optional)",
      "scannedBy": "string (Staff UID, optional)"
    }
  }
}
```

## Admin Panel (Prompt B) additions

### Event lifecycle (`events/$eventId`)

The `status` field now drives the public/counter visibility model: `draft` events are never visible on the customer-facing site or counter panel; `published` events are visible and bookable; `archived` events are hidden from active lists but retained for historical reporting; `cancelled`/`sold_out` keep their existing meanings. Two optional scheduled-transition fields are supported:

```json
{
  "scheduledPublishAt": "ISO 8601 string (optional)",
  "scheduledUnpublishAt": "ISO 8601 string (optional)"
}
```

Transitions are applied lazily on every event read (`applyScheduledTransitions()`) and by a 60-second background job plus a manual `/api/admin/events/apply-lifecycle` endpoint.

### Seat records (`seats/$eventId/$seatId`)

Two new fields extend the seat record:

```json
{
  "seatType": "regular | premium | accessible | obstructed-view",
  "pricingTierId": "string (id of a tier in events/$eventId/ticketTiers)"
}
```

`seatType` determines the seat's visual class on the customer seat map; `pricingTierId` links each seat to a pricing tier, overriding the section default. Seat labels must be unique within a row, enforced by the seat-map deploy endpoint.

### Coupons (`coupons/$code`)

The existing coupon record gains optional event-scoping and expiry semantics consistent with the schema already in use; `eventId` null means all events, and null/empty `validUntil`/`usageLimit` mean no expiry / unlimited uses:

```json
{
  "code": "string (unique, stored uppercase)",
  "type": "percentage | fixed",
  "value": "number",
  "validUntil": "ISO date string (optional; null = never expires)",
  "usageLimit": "number (optional; null = unlimited)",
  "usedCount": "number",
  "eventId": "string | null (null = all events)",
  "isActive": "boolean",
  "createdAt": "ISO 8601 string"
}
```

Redemption increments `usedCount` atomically inside `finalizeBookingServerSide` (transactional, already prevents over-redemption under concurrency). The seat-map deploy endpoint additionally validates per-row label uniqueness.

### Orders (`orders/$orderId`)

A canonical admin-dashboard order record is written alongside every fulfilled booking (online, counter, and manual):

```json
{
  "orderId": "string",
  "eventId": "string",
  "tierId": "string",
  "seatIds": ["string"],
  "quantity": "number",
  "customerDetails": { "name": "string", "email": "string", "phone": "string" },
  "amount": "number",
  "discount": "number",
  "couponCode": "string | null",
  "paymentMethod": "string",
  "paymentStatus": "paid | pending",
  "amountDue": "number (optional)",
  "channel": "online | counter | manual",
  "status": "confirmed | cancelled | refunded",
  "refundReason": "string | null",
  "refundAmount": "number | null",
  "ticketId": "string | null",
  "bookingId": "string | null",
  "createdAt": "ISO 8601 string",
  "createdBy": "string (staff uid | 'system')"
}
```

### Notifications (`notifications/$id`)

```json
{
  "id": "string",
  "eventId": "string",
  "subject": "string",
  "message": "string",
  "recipientCount": "number",
  "status": "queued | sent | failed",
  "sentAt": "ISO 8601 string (optional)",
  "createdBy": "string (staff uid)"
}
```

Email delivery uses the optional `SMTP_*` environment configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). When SMTP is not configured, emails are logged and recorded in `notifications` with status `sent` marked as "no-mail-mode" rather than failing.
