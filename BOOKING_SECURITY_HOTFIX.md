# BOOKING SECURITY HOTFIX — Production Report

**Date:** 2026-09-03  
**Scope:** Hardening the ticket booking and payment flow  
**Risk Level:** Targeted production security patch — minimal code changes

---

## Changes Made

### 1. Webhook Signature Verification — Fail-Closed (`src/lib/payment/phonepe.ts`)

**What changed:** `verifyPhonePeWebhookSignature()` now returns `false` when the `x-verify` signature header or `CLIENT_SECRET` is missing.

**Why:** The previous implementation returned `true` when no signature was present, treating a missing signature as valid. This is a fail-open vulnerability — an attacker could send a webhook without any signature and have it accepted.

**Security impact:** All PhonePe webhook callbacks now require a valid HMAC-SHA256 signature. Requests without a signature are rejected with HTTP 401.

**Production data safety:** No existing data is affected. Only new webhook callbacks are impacted.

---

### 2. Rate Limiting on Critical Booking Endpoints (`server.ts`)

**What changed:** Added in-memory rate limiting using the existing `checkRateLimit()` function to:

| Endpoint | Window | Limit | Key |
|---|---|---|---|
| `POST /api/reservations` | 60s | 10 requests | IP + Session ID |
| `POST /api/phonepe/verify-payment` | 60s | 15 requests | IP |
| `POST /api/phonepe/create-order` | 60s | 5 requests | IP + Session ID |
| `POST /api/phonepe/recover-booking` | 60s | 5 requests | IP |
| `POST /api/phonepe/webhook` | 60s | 30 requests | IP |
| `POST /api/coupons/validate` | 60s | 20 requests | IP |

**Why:** Rate limiting was only applied to OTP endpoints. Reservation creation, payment verification, and coupon validation had no rate protection, enabling:
- Seat-hold abuse (flooding reservation creation to hold all seats)
- Payment verification abuse (spamming verification to find valid orders)
- Coupon enumeration (brute-forcing coupon codes)

**Security impact:** Legitimate customers are not affected (limits are generous). Automated attacks are throttled.

**Production data safety:** No existing data is modified. Only new requests are rate-limited.

---

### 3. Cryptographically Secure Random IDs (`server.ts`)

**What changed:** Added `secureRandomHex()` helper using `crypto.randomBytes()` and replaced all security-sensitive `Math.random()` usage for:

- Reservation IDs (`rsrv_*`)
- Order IDs (`ord_*`, `ord_coc_*`)
- Merchant Order IDs (`m_*`)
- Ticket IDs (`tkt_*`)
- Booking IDs (`bkg_*`)

**Why:** `Math.random()` is not cryptographically secure. An attacker who can predict the PRNG state could:
- Predict order IDs to access other customers' pending orders
- Predict reservation IDs to manipulate holds
- Predict ticket IDs to forge credentials

**Security impact:** All new identifiers are now generated from cryptographically secure randomness, making prediction computationally infeasible.

**Production data safety:** Only new IDs use the secure generator. Existing IDs are not regenerated.

---

### 4. Cross-Event Seat Validation (`server.ts`)

**What changed:** Before claiming seats atomically, the reservation endpoint now verifies that every requested seat ID exists in the event's seat map at `seats/{eventId}`.

**Why:** Without this check, an attacker could:
- Submit seat IDs from a different event to claim seats they shouldn't access
- Fabricate seat IDs that don't exist, potentially causing confusion in the booking flow

**Security impact:** Seat claims are now validated against the event's actual seat configuration. Cross-event seat manipulation and fabricated seat IDs are rejected with HTTP 400.

**Production data safety:** Only new reservation attempts are validated. Existing sold seats are not affected.

---

### 5. Coupon Response Stripping (`server.ts`)

**What changed:** The `POST /api/coupons/validate` endpoint no longer returns the full `coupon` object in the response. Only the safe fields (`couponCode`, `discountType`, `discountValue`, `discountAmount`, `originalAmount`, `finalAmount`) are returned.

**Why:** The previous response included the full coupon record with internal fields like:
- `usedCount` — reveals how many times a coupon has been used
- `usageLimit` — reveals the total usage limit
- `createdAt` — reveals administrative metadata
- `eventId` — reveals event-specific restrictions

This information enables coupon enumeration and abuse.

**Security impact:** Customers can no longer enumerate coupon internals. The coupon validation response only reveals the discount applied.

**Production data safety:** No coupon data is modified. Only the API response format changes.

---

### 6. Attendee Details Required Before Payment (`server.ts`)

**What changed:** The `POST /api/phonepe/create-order` endpoint now requires attendee details (name, email, phone) to be present on the reservation before creating a PhonePe payment order.

**Why:** Without this check, a payment order could be created without attendee details, leading to:
- Incomplete bookings reaching the payment gateway
- Fulfillment failures when tickets need attendee information
- Potential abuse by creating payment orders for unclaimed reservations

**Security impact:** Attendee details must be saved to the reservation (via `POST /api/reservations/:id/attendee`) before payment can be initiated.

**Production data safety:** Only new payment orders are affected. Existing reservations with or without attendee details continue to work.

---

## Security Regression Test Suite

**File:** `scripts/test-booking-security.ts`

The following security scenarios are tested:

| Test | Scenario | Expected Result |
|---|---|---|
| A | Same seat concurrent reservation | Only one succeeds |
| B | Fake payment success | No ticket issued |
| C | Amount manipulation | Server computes correct amount |
| D | Order IDOR | Cross-user access denied |
| E | Coupon manipulation | Fake coupon rejected |
| F | Cross-event seat booking | Seat not in event map rejected |
| G | Invalid webhook signature | HTTP 401 rejected |
| H | Missing webhook signature | Fail-closed, HTTP 401 |
| I | Coupon response internal fields | Fields stripped |
| J | Rate limiting reservation | HTTP 429 after limit |
| K | Empty seat array | HTTP 400 rejected |
| L | Absurd ticket quantity | HTTP 400 rejected |
| M | Duplicate seat IDs | Normalized or rejected |
| N | Unauthorized order access | HTTP 401/403 denied |
| O | Coupon response structure | Safe fields only |
| P | Attendee required for payment | HTTP 400 if missing |

Run with: `TEST_BASE_URL=http://localhost:3000 bunx tsx scripts/test-booking-security.ts`

---

## Production Data Safety

**Confirmed — no existing production data is modified:**

- ✅ Existing users unchanged
- ✅ Existing passwords unchanged
- ✅ Existing PINs unchanged
- ✅ Existing tickets unchanged
- ✅ Existing orders unchanged
- ✅ Existing payments unchanged
- ✅ Existing events unchanged
- ✅ Existing sold seats unchanged
- ✅ Existing QR codes unchanged
- ✅ Existing coupon records unchanged
- ✅ Existing refund records unchanged

All changes apply ONLY to new booking operations.

---

## New Booking Protection Summary

| Protection | Status |
|---|---|
| Seat locking (atomic transactions) | ✅ Already implemented |
| Server-side price calculation | ✅ Already implemented |
| Coupon validation (server-side) | ✅ Already implemented |
| Reservation ownership checks | ✅ Already implemented |
| Payment verification (PhonePe API) | ✅ Already implemented |
| Webhook signature verification | ✅ **Fixed — now fail-closed** |
| Duplicate fulfillment prevention | ✅ Already implemented (idempotency lock) |
| Rate limiting on booking operations | ✅ **Fixed — now applied** |
| Cross-event seat validation | ✅ **Fixed — now validated** |
| Cryptographically secure IDs | ✅ **Fixed — now uses crypto.randomBytes** |
| Coupon internal field exposure | ✅ **Fixed — now stripped** |
| Attendee validation before payment | ✅ **Fixed — now required** |

---

## Changed Files

| File | Change | Lines Changed |
|---|---|---|
| `src/lib/payment/phonepe.ts` | Webhook fail-closed | ~2 |
| `server.ts` | Rate limiting (6 endpoints) | ~40 |
| `server.ts` | Secure random IDs | ~15 |
| `server.ts` | Cross-event seat validation | ~12 |
| `server.ts` | Coupon response stripping | ~3 |
| `server.ts` | Attendee validation | ~3 |
| `scripts/test-booking-security.ts` | Security test suite (new file) | ~380 |

---

## Known Remaining Risks

### Deferred — Requires Production Migration

1. **Existing订单的ID使用了Math.random()**: The existing production tickets, bookings, and orders were generated with `Math.random()`. Regenerating them would affect production data. This is acceptable because:
   - The IDs are opaque and not used as security credentials
   - QR codes and pass slugs are HMAC-signed separately
   - An attacker predicting an old ID would still need to pass HMAC verification

2. **Firebase Realtime Database Rules**: This patch operates at the API layer (server.ts). Firebase RTDB rules are not modified because:
   - The existing rules were working with the current frontend
   - Changing rules could break existing production features
   - Server-side validation provides the security boundary
   - **Recommendation**: Audit Firebase RTDB rules separately to ensure customers cannot directly write to `seats/`, `tickets/`, `payments/`, or `orders/` paths

3. **Rate limiting is in-memory only**: The `checkRateLimit()` function uses `Map` state which is lost on server restart. For multi-instance deployments, this is a limitation.
   - **Recommendation**: For production multi-instance deployments, consider using Redis-backed rate limiting

4. **Webhook body verification**: The current webhook handler parses the body and looks up the matching pending order by `merchantOrderId`. It does not verify the exact payment amount from the webhook payload. Amount verification happens in the `verify-payment` endpoint.
   - **Recommendation**: Consider adding amount verification in the webhook handler as an additional safety layer

---

## Deployment Checklist

- [x] Type check passes (`tsc --noEmit`)
- [x] No existing data modified
- [x] All security-sensitive IDs use crypto.randomBytes
- [x] Webhook signature verification is fail-closed
- [x] Rate limiting applied to all booking endpoints
- [x] Cross-event seat validation added
- [x] Coupon response stripped of internal fields
- [x] Attendee details required before payment
- [x] Security test suite created
- [x] Backward compatible with existing production data
