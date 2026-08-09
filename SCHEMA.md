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
      "uid": "string",
      "email": "string",
      "role": "admin | ticket_counter",
      "assignedBy": "string (Admin UID)",
      "assignedAt": "ISO 8601 string"
    }
  }
}
```

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
Tracks real-time seat availability and temporary holding state during checkout.

```json
{
  "seats": {
    "$eventId": {
      "$seatId": {
        "id": "string (e.g. R1-C5)",
        "status": "available | held | sold",
        "priceTierId": "string",
        "heldBy": "string (User UID)",
        "heldAt": "number (timestamp ms)",
        "ticketId": "string (optional)"
      }
    }
  }
}
```

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
      "paymentMethod": "cashfree | counter_cash | counter_upi",
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
Issued digital QR entry passes.

```json
{
  "tickets": {
    "$ticketId": {
      "id": "string",
      "bookingId": "string",
      "ownerId": "string (User UID)",
      "eventId": "string",
      "tierId": "string",
      "tierName": "string",
      "price": "number",
      "seatNumber": "string (optional)",
      "qrCodeData": "string",
      "status": "valid | used | cancelled",
      "issuedAt": "ISO 8601 string",
      "scannedAt": "ISO 8601 string (optional)",
      "scannedBy": "string (Staff UID, optional)"
    }
  }
}
```
