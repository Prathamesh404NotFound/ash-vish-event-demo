import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { verifyFirebaseIdToken, TokenVerificationError } from "./src/lib/verify-token.js";
import { rtdbGet, rtdbSet, rtdbUpdate, rtdbDelete, rtdbTransaction, rtdbPush } from "./src/lib/rtdb.js";
import { getFirebaseAdminIdToken } from "./src/lib/identity-admin.js";
import {
  isRazorpayConfigured,
  isTestMode,
  createRazorpayOrder,
  fetchRazorpayPayment,
  verifyWebhookSignature,
  KEY_ID as razorpayKeyId,
} from "./src/lib/payment/razorpay.js";

const SERVER_HMAC_SECRET = process.env.SERVER_HMAC_SECRET || "ASH_VISH_SECURE_HMAC_KEY_2026";

// Server-side admin auth is a plain REST flow (service-account signed custom
// token exchanged via signInWithCustomToken). No Firebase Admin SDK is used.
async function getAdminAuthToken(): Promise<string | undefined> {
  try {
    return await getFirebaseAdminIdToken();
  } catch (err: any) {
    console.warn("[ADMIN AUTH] Unable to get Firebase Admin auth token:", err.message);
    return undefined;
  }
}

// In-memory cache for live coupons. The server starts empty and never creates
// example coupons when Firebase has no records.
let COUPONS_DATABASE: Record<string, {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  validUntil: string;
  usageLimit?: number;
  usedCount: number;
  eventId?: string;
  isActive: boolean;
  createdAt: string;
}> = {};

// ============================================================
// PRODUCTION RESERVATION SERVICE
// Server-authoritative seat holds with atomic all-or-nothing claims,
// explicit expiration, owner identity, and idempotency keys.
// ============================================================
// Named constant for the seat hold duration. A seat that moves to "held" must
// carry heldUntil = now + SEAT_HOLD_DURATION_MS; once that timestamp passes and
// no payment completed, the seat must be released back to "available".
const SEAT_HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes
// Backwards-compatible alias used by the reservation service (existing records
// and clients reference RESERVATION_HOLD_TTL_MS).
const RESERVATION_HOLD_TTL_MS = SEAT_HOLD_DURATION_MS;
const MAX_TICKETS_PER_RESERVATION = 10;
const RESERVATION_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h idempotency window

/** In-memory idempotency cache keyed by sha256(idempotencyKey). */
const idempotencyResults = new Map<string, { createdAt: number; result: any }>();

// Sweep completed idempotency results that exceed the TTL
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyResults.entries()) {
    if (now - entry.createdAt > RESERVATION_IDEMPOTENCY_TTL_MS) {
      idempotencyResults.delete(key);
    }
  }
}, 60 * 1000);

interface ReservationQuote {
  currency: "INR";
  subtotalMinor: number; // paise
  discountMinor: number; // paise
  feesMinor: number; // paise
  totalMinor: number; // paise
}

interface ReservationRecord {
  reservationId: string;
  eventId: string;
  tierId: string;
  quantity: number;
  seatIds: string[]; // normalized, sorted
  ownerId: string;
  status: "active" | "confirmed" | "expired" | "released" | "cancelled";
  createdAt: number;
  expiresAt: number;
  attendee?: { name: string; email: string; phone: string };
}

function seatIdLabel(seatId: string): string {
  const parts = seatId.split("-");
  const r = String.fromCharCode(64 + parseInt(parts[0].replace("R", ""), 10));
  const c = parts[1].replace("C", "");
  return `${r}-${c}`;
}

function normalizeSeatIds(seatIds: string[]): string[] {
  const unique = Array.from(new Set(seatIds.map((s) => s.trim().toUpperCase())));
  return unique.sort((a, b) => a.localeCompare(b));
}

function hashIdempotencyKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function seatPriceForRow(tiers: any[], seatMapTierName: string): number | undefined {
  return tiers.find(
    (t) =>
      t.name.toLowerCase().includes(seatMapTierName.toLowerCase()) ||
      seatMapTierName.toLowerCase().includes(t.name.toLowerCase())
  )?.price;
}

/**
 * Compute a server-authoritative quote for a reservation request.
 * Uses event seat map + ticket tiers; rejects when seat map is missing and seatIds are requested.
 */
function computeReservationQuote(
  eventData: any,
  seatIds: string[],
  quantity: number,
  tierId: string
): { quote: ReservationQuote; seatMapVersion: number; tier?: any } {
  const tiers: any[] = normalizeTiers(eventData.ticketTiers);
  const seatMap = eventData.seatMap;
  let subtotalMinor = 0;
  const tier = tiers.find((t: any) => t.id === tierId);

  if (seatIds.length > 0) {
    // Flat pricing: every seat costs the selected ticket tier's price,
    // regardless of row. No per-row tier price lookups.
    if (!seatMap) {
      throw new Error("Event seat map is not configured; seat selection is unavailable for this event.");
    }
    if (!tier) {
      throw new Error("Requested ticket tier is not available for this event.");
    }
    const seatPrice = tier.price;
    if (!seatPrice || seatPrice <= 0) {
      throw new Error("Ticket tier price is not configured for this event.");
    }
    if ((tier.remainingInventory ?? 0) < seatIds.length) {
      throw new Error(`Not enough tickets remaining. Only ${tier.remainingInventory ?? 0} left.`);
    }
    const seatMapVersion = seatMap.version ?? 1;
    subtotalMinor = seatPrice * seatIds.length * 100;
    return { quote: { currency: "INR", subtotalMinor, discountMinor: 0, feesMinor: 0, totalMinor: subtotalMinor }, seatMapVersion, tier };
  }

  // General admission tier without seat map
  if (!tier) throw new Error("Requested ticket tier is not available for this event.");
  if ((tier.remainingInventory ?? 0) < quantity) {
    throw new Error(`Not enough tickets remaining. Only ${tier.remainingInventory ?? 0} tickets left.`);
  }
  subtotalMinor = tier.price * quantity * 100;
  return { quote: { currency: "INR", subtotalMinor, discountMinor: 0, feesMinor: 0, totalMinor: subtotalMinor }, seatMapVersion: 0, tier };
}

// ============================================================
// SHARED SEAT LOCKING SERVICE
// The single seat state-transition service used by BOTH the online booking
// flow (reservations) and the counter panel flow (walk-in bookings). Every
// transition (available -> held -> booked, or release back to available)
// runs inside an RTDB transaction (ETag-based conditional write with retry),
// which is the closest equivalent Firebase Realtime Database offers to
// SELECT ... FOR UPDATE. Two concurrent requests — online customer, counter
// staff, or two counter terminals — can never both succeed on the same seat,
// because only one conditional write can commit against the same ETag.
// ============================================================

/** A seat transition action applied by the shared locking service. */
interface SeatLockResult {
  seatId: string;
  committed: boolean;
  /** The seat status as observed at the time the transaction aborted, if known. */
  observedStatus?: string;
}

/**
 * Compute the hold expiry for a seat, tolerant of legacy records that stored
 * only heldAt (derived expiry) or records with no expiry at all.
 */
function seatHoldExpiresAt(seat: any, now: number): number {
  const expiresAt = seat?.holdExpiresAt || (seat?.heldAt ? seat.heldAt + SEAT_HOLD_DURATION_MS : 0);
  return typeof expiresAt === "number" ? expiresAt : 0;
}

/**
 * Lazy expiry: if a seat node carries a held status whose hold already expired,
 * release it back to available inside the transaction. Called by every seat read
 * path (see applySeatLock) so availability is never returned stale.
 */
async function releaseExpiredHoldIfAny(
  path: string,
  authToken: string | undefined,
): Promise<boolean> {
  const now = Date.now();
  const res = await rtdbTransaction(path, (seat: any) => {
    if (!seat) return undefined;
    if (seat.status !== "held") return undefined;
    const expiresAt = seatHoldExpiresAt(seat, now);
    if (expiresAt > 0 && now > expiresAt) {
      return {
        ...seat,
        status: "available",
        heldBy: null,
        reservationId: null,
        heldAt: null,
        holdExpiresAt: null,
        statusChangedAt: now,
        statusChangedBy: "hold_expiry",
      };
    }
    return undefined; // hold still valid or not held
  }, authToken);
  return res.committed;
}

/**
 * Release a seat back to "available" — the single shared release routine used
 * by reservation cancellation, payment failure cleanup, and hold expiry.
 * Conditional on the caller still owning the hold, so a seat that was already
 * booked or re-held by someone else is never overwritten.
 */
async function releaseSeat(
  authToken: string | undefined,
  eventId: string,
  seatId: string,
  options: { ownedBy?: string; reservationId?: string } = {},
): Promise<SeatLockResult> {
  const path = `seats/${eventId}/${seatId}`;
  const res = await rtdbTransaction(path, (seat: any) => {
    if (!seat) return undefined;
    const isHeldByCaller =
      seat.status === "held" &&
      (options.ownedBy === undefined || seat.heldBy === options.ownedBy) &&
      (options.reservationId === undefined || seat.reservationId === options.reservationId);
    if (isHeldByCaller) {
      return {
        ...seat,
        status: "available",
        heldBy: null,
        reservationId: null,
        heldAt: null,
        holdExpiresAt: null,
        statusChangedAt: Date.now(),
        statusChangedBy: "release",
      };
    }
    return undefined; // not held by the caller; someone else owns it or it is booked
  }, authToken);
  return { seatId, committed: res.committed, observedStatus: undefined };
}

/**
 * Mark a seat as booked (held -> booked). The seat must currently be held by
 * the given owner (or expired, for walk-in claims that skip the hold step).
 * Uses the shared transactional path; the payment is the only state that may
 * follow this write (see payment-ticket integrity rules).
 */
async function bookSeat(
  authToken: string | undefined,
  eventId: string,
  seatId: string,
  userId: string,
  orderId: string,
  ticketId?: string,
  bookingId?: string,
): Promise<SeatLockResult> {
  const path = `seats/${eventId}/${seatId}`;
  const now = Date.now();
  const res = await rtdbTransaction(path, (seat: any) => {
    if (!seat) {
      return {
        id: seatId,
        seatId,
        row: parseInt(seatId.split("-")[0].replace("R", ""), 10) || 1,
        col: parseInt(seatId.split("-")[1].replace("C", ""), 10) || 1,
        status: "booked",
        bookedBy: userId,
        bookedAt: now,
        orderId,
        statusChangedAt: now,
        statusChangedBy: "booking",
      };
    }
    const expiresAt = seatHoldExpiresAt(seat, now);
    const isHoldExpired = expiresAt > 0 && now > expiresAt;
    const isHeldByUser =
      seat.status === "held" &&
      (seat.heldBy === userId || seat.ownerId === userId);
    const eligible =
      seat.status === "available" ||
      (seat.status === "held" && (isHeldByUser || isHoldExpired));
    if (!eligible) return undefined; // abort: seat held by another active hold or already booked
    return {
      ...seat,
      status: "booked",
      bookedBy: userId,
      bookedAt: now,
      orderId,
      ticketId: ticketId || seat.ticketId,
      bookingId: bookingId || seat.bookingId,
      heldAt: seat.heldAt,
      holdExpiresAt: seat.holdExpiresAt,
      statusChangedAt: now,
      statusChangedBy: "booking",
    };
  }, authToken);
  return { seatId, committed: res.committed, observedStatus: undefined };
}

/**
 * Claim seats atomically. All requested seats must be available (or held/expired by ANYONE),
 * the whole batch succeeds or fails. Returns committed true only when every seat is held.
 */
async function claimSeatsAtomically(
  authToken: string | undefined,
  eventId: string,
  seatIds: string[],
  reservationId: string,
  ownerId: string
): Promise<{ committed: boolean; error?: string }> {
  for (const seatId of seatIds) {
    const path = `seats/${eventId}/${seatId}`;
    let lastStatus: string | undefined;
    const res = await rtdbTransaction(path, (seat: any) => {
      lastStatus = seat?.status;
      const now = Date.now();
      const expiresAt = seatHoldExpiresAt(seat, now);
      const isExpired = expiresAt > 0 && now > expiresAt;
      // Same buyer holding this seat in ANOTHER active reservation (e.g. a stale
      // attempt) gets auto-migrated to the current reservation instead of failing.
      if (seat?.status === "held" && seat.heldBy === ownerId && !isExpired && seat.reservationId !== reservationId) {
        return {
          ...seat,
          status: "held",
          heldBy: ownerId,
          reservationId,
          heldAt: seat.heldAt || now,
          holdExpiresAt: Math.max(now + RESERVATION_HOLD_TTL_MS, seat.holdExpiresAt || now),
          statusChangedAt: now,
          statusChangedBy: "reservation",
        };
      }
      const elgible =
        !seat ||
        seat.status === "available" ||
        (seat.status === "held" && isExpired) ||
        (seat.status === "held" && seat.heldBy === ownerId && seat.reservationId === reservationId);
      if (!elgible) return undefined; // abort: seat held by another active reservation
      const rowNum = seat?.row !== undefined ? seat.row : parseInt(seatId.split("-")[0].replace("R", ""), 10) || 1;
      const colNum = seat?.col !== undefined ? seat.col : parseInt(seatId.split("-")[1].replace("C", ""), 10) || 1;
      return {
        ...seat,
        id: seatId,
        seatId,
        row: rowNum,
        col: colNum,
        status: "held",
        heldBy: ownerId,
        reservationId,
        heldAt: now,
        holdExpiresAt: now + RESERVATION_HOLD_TTL_MS,
        statusChangedAt: now,
        statusChangedBy: "reservation",
      };
    }, authToken);
    if (!res.committed) {
      // Roll back seats already claimed by this reservation in this batch (all-or-nothing)
      const already = seatIds.slice(0, seatIds.indexOf(seatId));
      for (const rolledId of already) {
        releaseSeat(authToken, eventId, rolledId, { reservationId }).catch(() => {});
      }
      // Give the user a precise reason instead of the generic catch-all.
      const label = seatIdLabel(seatId);
      let error = `Seat ${label} is no longer available.`;
      if (lastStatus === "booked" || lastStatus === "sold") {
        error = `Seat ${label} has already been purchased. Please choose a different seat.`;
      } else if (lastStatus === "held") {
        error = `Seat ${label} is currently held by another buyer. Please choose a different seat.`;
      }
      return { committed: false, error };
    }
  }
  return { committed: true };
}

/**
 * Normalize ticket tiers regardless of RTDB storage shape.
 * RTDB may store tiers as an object map with numeric keys (entries without an `id`),
 * possibly alongside id-bearing entries (duplicates). Returns a stable array keyed by `id`,
 * merging values from id-less numeric entries into their id-bearing siblings when present.
 */
function normalizeTiers(ticketTiers: any): any[] {
  if (!ticketTiers) return [];
  if (Array.isArray(ticketTiers)) {
    return ticketTiers.map((t: any) => ({ ...t, id: t.id || t.tierId || t.tier_id || null }));
  }
  const entries = Object.entries(ticketTiers);
  const byId = new Map<string, any>();
  const idLess = new Map<string, any>();
  for (const [key, value] of entries) {
    const v = value as any;
    if (v && v.id) {
      byId.set(v.id, { ...v });
    } else if (v && typeof v === "object") {
      idLess.set(String(key), { ...v });
    }
  }
  // Merge id-less numeric entries into matching id-bearing tiers (same numeric index position
  // or identical name/price), preserving every field including remainingInventory.
  const numericKeys = Array.from(idLess.keys()).filter((k) => /^\d+$/.test(k));
  const idEntries = Array.from(byId.values());
  for (const numKey of numericKeys) {
    const lv = idLess.get(numKey)!;
    const sibling = idEntries.find(
      (e) =>
        e.price === lv.price &&
        e.name === lv.name &&
        e.totalInventory === lv.totalInventory
    );
    if (sibling) {
      // Prefer the richer record: keep sibling as base, overlay id-less values for inventory fields.
      sibling.remainingInventory =
        typeof sibling.remainingInventory === "number" ? sibling.remainingInventory : lv.remainingInventory;
      sibling.totalInventory = sibling.totalInventory ?? lv.totalInventory;
      idLess.delete(numKey);
    }
  }
  return [...Array.from(byId.values()), ...Array.from(idLess.values())];
}

async function finalizeBookingServerSide(
  orderId: string,
  paymentMethod: string,
  paymentId: string,
  userToken?: string
): Promise<{ success: boolean; ticket?: any; booking?: any; error?: string }> {
  let couponIncremented = false;
  let couponCodeUpper: string | null = null;
  const claimedSeats: string[] = [];
  let inventoryDeducted = false;
  let pendingOrder: any = null;

  const authToken = userToken || (await getAdminAuthToken());

  try {
    // 1. Idempotency Check
    const processedRes = await rtdbGet(`processed_orders/${orderId}`, authToken);
    if (processedRes.data) {
      return { success: true, ticket: processedRes.data.ticket, booking: processedRes.data.booking };
    }

    // 2. Fetch pending order details
    const pendingRes = await rtdbGet(`pending_orders/${orderId}`, authToken);
    if (!pendingRes.data) {
      return { success: false, error: "Pending order details not found. Booking session may have expired." };
    }

    pendingOrder = pendingRes.data;
    const { eventId, tierId, seatIds, quantity, customerDetails, userId, amount, couponCode } = pendingOrder;
    const now = Date.now();
    // Production hardening: the live event tier price is the sole source of truth.
    let serverCalculatedRecheck = 0;
    let dbRecheckPrice = 0;
    try {
      const evtForRecheck = (await rtdbGet(`events/${eventId}`, authToken))?.data as any;
      const dbTier = normalizeTiers(evtForRecheck?.ticketTiers).find((t: any) => t.id === tierId);
      if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
        dbRecheckPrice = dbTier.price;
      }
    } catch {}
    if (dbRecheckPrice > 0) {
      serverCalculatedRecheck = dbRecheckPrice * (quantity || 1);
    }
    if (amount && serverCalculatedRecheck > 0 && amount > serverCalculatedRecheck * 1.5) {
      return { success: false, error: "Order amount anomaly detected. Fulfillment aborted." };
    }
    if (!amount || amount <= 0) {
      return { success: false, error: "Invalid order amount. Fulfillment aborted." };
    }

    // 3. Seat reservation check — uses the SHARED seat locking service (bookSeat),
    // the same function the online reservation flow uses. Payment-to-ticket
    // integrity: a seat is only marked booked here, inside fulfillment, which is
    // only invoked after server-side payment verification.
    if (seatIds && seatIds.length > 0) {
      let seatClaimError: string | null = null;

      for (const seatId of seatIds) {
        const result = await bookSeat(authToken, eventId, seatId, userId, orderId);
        if (result.committed) {
          claimedSeats.push(seatId);
        } else {
          seatClaimError = `Seat ${seatId.replace('R', 'Row ').replace('C', ' Col ')} is no longer available.`;
          break;
        }
      }

      if (seatClaimError) {
        // Payment did not succeed: release all seats we just claimed back to
        // available using the shared release logic.
        for (const rolledSeatId of claimedSeats) {
          await releaseSeat(authToken, eventId, rolledSeatId, {});
        }
        return { success: false, error: seatClaimError };
      }
    }

    // 4. Coupon validation and increment
    if (couponCode) {
      couponCodeUpper = couponCode.trim().toUpperCase();
      let couponError: string | null = null;

      const couponTxResult = await rtdbTransaction(`coupons/${couponCodeUpper}`, (currCoupon: any) => {
        if (!currCoupon) {
          couponError = "Applied coupon no longer exists.";
          return undefined;
        }
        if (!currCoupon.isActive) {
          couponError = "Applied coupon is inactive.";
          return undefined;
        }
        if (new Date(currCoupon.validUntil) < new Date()) {
          couponError = "Applied coupon has expired.";
          return undefined;
        }
        if (currCoupon.usageLimit && currCoupon.usedCount >= currCoupon.usageLimit) {
          couponError = "Coupon usage limit reached during checkout.";
          return undefined;
        }
        currCoupon.usedCount = (currCoupon.usedCount || 0) + 1;
        return currCoupon;
      }, authToken);

      if (!couponTxResult.committed) {
        // Payment did not succeed: release all claimed seats via the shared
        // release service rather than leaving them stuck in a held state.
        for (const rolledSeatId of claimedSeats) {
          await releaseSeat(authToken, eventId, rolledSeatId, {});
        }
        return { success: false, error: couponError || "Failed to redeem coupon atomically." };
      }
      couponIncremented = true;
    }

    // 5. Decrement ticket tier inventory
    let inventoryError: string | null = null;
        const inventoryTxResult = await rtdbTransaction(`events/${eventId}`, (currEvent: any) => {
      if (!currEvent || !currEvent.ticketTiers) {
        inventoryError = "Event or ticket tiers not found.";
        return undefined;
      }
      // Normalize: RTDB may store tiers as an object map with numeric keys (no id) plus
      // id-bearing entries. Work on a stable array so the deduction transaction is shape-agnostic.
      const tiers = normalizeTiers(currEvent.ticketTiers);
      let tierFound = false;
      const updatedTiers = tiers.map((t: any) => {
        if (t.id === tierId) {
          tierFound = true;
          if ((t.remainingInventory || 0) < quantity) {
            inventoryError = `Not enough tickets remaining. Only ${t.remainingInventory || 0} tickets left.`;
            return t;
          }
          return {
            ...t,
            remainingInventory: (t.remainingInventory || 0) - quantity,
          };
        }
        return t;
      });
      if (!tierFound || inventoryError) {
        return undefined;
      }
      currEvent.ticketTiers = updatedTiers;
      return currEvent;
    }, authToken);

    if (!inventoryTxResult.committed) {
      if (couponIncremented && couponCodeUpper) {
        await rtdbTransaction(`coupons/${couponCodeUpper}`, (curr: any) => {
          if (curr) curr.usedCount = Math.max(0, (curr.usedCount || 1) - 1);
          return curr;
        }, authToken);
      }
      // Payment did not succeed: release all claimed seats via the shared
      // release service rather than leaving them stuck in a held state.
      for (const rolledSeatId of claimedSeats) {
        await releaseSeat(authToken, eventId, rolledSeatId, {});
      }
      return { success: false, error: inventoryError || "Failed to deduct ticket inventory atomically." };
    }
    inventoryDeducted = true;
    // 5.5 Mark the temporary hold as fulfilled. The linked order remains the
    // fulfillment audit record; the reservation stays intentionally lean.
    if (pendingOrder?.reservationId) {
      try {
        await rtdbTransaction(`reservations/${pendingOrder.reservationId}`, (curr: any) => {
          if (curr && curr.status === "active") {
            return { ...curr, status: "confirmed" };
          }
          return curr; // non-active reservation already swept; continue
        }, authToken);
        console.log(`[RESERVATION] Confirmed ${pendingOrder.reservationId} via payment ${orderId}`);
      } catch (cErr) {
        console.warn("[RESERVATION CONFIRM WARN]", cErr);
      }
    }
    // 6. Generate Ticket and Booking records
    const ticketId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const bookingId = 'bkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const ticketNum = `ASH-${Math.floor(1000 + Math.random() * 9000)}-SRV`;

    const eventRes = await rtdbGet(`events/${eventId}`, authToken);
    const eventData = eventRes.data || {};
    const eventTitle = eventData.title || "Live Event";
    const eventPoster = eventData.posterUrl || "";
    const venue = eventData.venue || "Live Venue";
    const city = eventData.city || "Mumbai";
    const date = eventData.date || "Today";
    const time = eventData.time || "07:30 PM";
    let tierName = "General";
    let price = amount / quantity;

    const t = normalizeTiers(eventData.ticketTiers).find((tier: any) => tier.id === tierId);
    if (t) {
      tierName = t.name;
      price = t.price;
    }

    let seatLabel = `${tierName} Section`;
    if (seatIds && seatIds.length > 0) {
      seatLabel = seatIds
        .map((s: string) => {
          const parts = s.split('-');
          const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
          const c = parts[1].replace('C', '');
          return `${r}-${c}`;
        })
        .join(', ');
    } else {
      seatLabel = `${tierName}, General Floor`;
    }

    const newTicket = {
      id: ticketId,
      ticketNumber: ticketNum,
      eventId,
      eventTitle,
      eventPoster,
      venue,
      city,
      date,
      time,
      tierName,
      price,
      quantity,
      totalPaid: amount,
      seatNumber: seatLabel,
      selectedSeats: seatIds || [],
      attendeeName: customerDetails.name,
      attendeeEmail: customerDetails.email,
      attendeePhone: customerDetails.phone,
      qrCodeValue: ticketId,
      status: 'valid',
      purchasedAt: new Date().toISOString(),
      ownerId: userId,
      ...(pendingOrder?.reservationId ? { reservationId: pendingOrder.reservationId } : {}),
    };

    const newBookingRecord = {
      bookingId,
      userId,
      eventId,
      seatIds: seatIds || [],
      totalAmount: amount,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      paymentMethod,
      attendeeName: customerDetails.name,
      attendeePhone: customerDetails.phone,
      attendeeEmail: customerDetails.email,
      ticketId,
      isWalkIn: paymentMethod.includes('walkin'),
      ...(pendingOrder?.reservationId ? { reservationId: pendingOrder.reservationId } : {}),
    };

    // Save records
    await rtdbSet(`tickets/${ticketId}`, newTicket, authToken);
    await rtdbSet(`users/${userId}/tickets/${ticketId}`, newTicket, authToken);
    await rtdbSet(`bookings/${bookingId}`, newBookingRecord, authToken);
    await rtdbSet(`users/${userId}/bookings/${bookingId}`, newBookingRecord, authToken);

    // The seats were already transitioned to 'booked' in step 3; persist the
    // ticket/booking linkage (idempotent: the book transaction sets ticketId/
    // bookingId when provided). This step never re-attempts payment or moves a
    // seat out of 'booked' — ticket generation failures must not invalidate a
    // confirmed payment.
    if (seatIds && seatIds.length > 0) {
      for (const seatId of seatIds) {
        await rtdbTransaction(`seats/${eventId}/${seatId}`, (seat: any) => {
          if (seat && seat.status === 'booked' && seat.orderId === orderId) {
            return {
              ...seat,
              ticketId: ticketId || seat.ticketId,
              bookingId: bookingId || seat.bookingId,
            };
          }
          return seat;
        }, authToken);
      }
    }

    const processedOrder = {
      orderId,
      ticketId,
      bookingId,
      status: 'processed',
      ticket: newTicket,
      booking: newBookingRecord,
      processedAt: new Date().toISOString()
    };
    await rtdbSet(`processed_orders/${orderId}`, processedOrder, authToken);
    await rtdbDelete(`pending_orders/${orderId}`, authToken);

    return { success: true, ticket: newTicket, booking: newBookingRecord };
  } catch (err: any) {
    console.error("Error finalizing booking server side:", err);
    return { success: false, error: err.message || "Failed to finalize booking server side" };
  }
}

async function sweepExpiredHolds() {
  const authToken = await getAdminAuthToken();
  try {
    const snapshot = await rtdbGet("seats", authToken);
    if (!snapshot.data) return;

    const allEventsSeats = snapshot.data;
    const now = Date.now();

    for (const [eventId, eventSeats] of Object.entries(allEventsSeats)) {
      if (!eventSeats || typeof eventSeats !== "object") continue;

      for (const [seatId, seatData] of Object.entries(eventSeats as Record<string, any>)) {
        if (!seatData) continue;
        if (seatData.status === "held") {
          const expiresAt = seatData.holdExpiresAt || (seatData.heldAt ? seatData.heldAt + SEAT_HOLD_DURATION_MS : 0);
          if (expiresAt > 0 && now > expiresAt) {
            // Use the shared release service so the sweep, reservation
            // cancellation, and payment-failure cleanup all run the same logic.
            await releaseSeat(authToken, eventId, seatId, {});
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[SWEEPER ERROR] Failed to sweep expired holds:", err.message);
  }
}

// Build the Express application. Extracted so the same app can run as a
// standalone server (node/tsi) or as a Vercel serverless function.
export async function createApp() {
  const app = express();
  const PORT = 3000;


  app.use(express.json());

  // CORS Middleware for cross-origin production clients (e.g. Netlify)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.get("/api/health", async (req, res) => {
    let rtdbConnected = false;
    let rtdbError = null;
    try {
      const authToken = await getAdminAuthToken();
      const check = await rtdbGet("events", authToken);
      rtdbConnected = true;
    } catch (err: any) {
      rtdbError = err.message;
    }

    res.json({
      status: "ok",
      firebaseInitialized: rtdbConnected,
      firebaseError: rtdbError,
      env: process.env.NODE_ENV || "development"
    });
  });

  const tokenCache = new Map<string, { uid: string; email: string; role?: string; expiresAt: number }>();
  const roleCache = new Map<string, { role: string; expiresAt: number }>();

  const verifyFirebaseToken = async (idToken: string): Promise<{ uid: string; email: string; role?: string } | null> => {
    const now = Date.now();
    const cached = tokenCache.get(idToken);
    if (cached && cached.expiresAt > now) {
      return { uid: cached.uid, email: cached.email, role: cached.role };
    }

    try {
      const verified = await verifyFirebaseIdToken(idToken);
      const entry = {
        uid: verified.uid,
        email: verified.email || '',
        role: verified.role,
        expiresAt: now + 5 * 60 * 1000
      };
      tokenCache.set(idToken, entry);
      return { uid: entry.uid, email: entry.email, role: entry.role };
    } catch (err: any) {
      console.warn(`[AUTH TOKEN VERIFICATION REJECTED] ${err.message}`);
      return null;
    }
  };

  const fetchUserRoleFromRTDB = async (uid: string, idToken?: string): Promise<string> => {
    const now = Date.now();
    const cached = roleCache.get(uid);
    if (cached && cached.expiresAt > now) {
      return cached.role;
    }

    const lookupRole = async (authToken?: string): Promise<string | null> => {
      const staffRes = await rtdbGet(`staff/${uid}`, authToken);
      if (staffRes.data && (staffRes.data.role === 'admin' || staffRes.data.role === 'ticket_counter')) {
        return staffRes.data.role;
      }

      const userRes = await rtdbGet(`users/${uid}`, authToken);
      return userRes.data?.role || null;
    };

    try {
      const role = await lookupRole(idToken);
      if (role) {
        roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
        return role;
      }
    } catch (err: any) {
      console.warn(`[ROLE FETCH WARNING] User-token lookup failed for ${uid}:`, err.message);
    }

    // Protected role rules can legitimately prevent an end-user token from
    // reading staff/user profiles. Retry only with the server identity; browser
    // callers never receive that identity or direct write capability.
    if (idToken) {
      const serverToken = await getAdminAuthToken();
      if (serverToken && serverToken !== idToken) {
        try {
          const role = await lookupRole(serverToken);
          if (role) {
            roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
            return role;
          }
        } catch (err: any) {
          console.warn(`[ROLE FETCH WARNING] Server-identity lookup failed for ${uid}:`, err.message);
        }
      }
    }

    roleCache.set(uid, { role: 'customer', expiresAt: now + 1 * 60 * 1000 });
    return 'customer';
  };

  // ============================================================
  // RBAC (Item 4): role hierarchy for super_admin, event_manager,
  // counter_staff, and auditor (read-only). Existing Firebase roles are
  // normalized into this hierarchy below.
  // ============================================================

  const RBAC_ROLES = ["super_admin", "event_manager", "counter_staff", "auditor"] as const;
  type RbacRole = (typeof RBAC_ROLES)[number];

  /** Map legacy Firebase roles to the RBAC hierarchy. */
  function toRbacRole(firebaseRole: string): RbacRole | null {
    switch (firebaseRole) {
      case "admin":
        return "super_admin";
      case "organizer":
        return "event_manager";
      case "ticket_counter":
        return "counter_staff";
      case "auditor":
        return "auditor";
      default:
        return null;
    }
  }

  /** Role hierarchy: a role grants its own level and everything above it. */
  const RBAC_LEVEL: Record<RbacRole, number> = {
    super_admin: 4,
    event_manager: 3,
    counter_staff: 2,
    auditor: 1,
  };

  function rbacAllows(actor: RbacRole, required: RbacRole): boolean {
    return RBAC_LEVEL[actor] >= RBAC_LEVEL[required];
  }

  // ============================================================
  // Audit log (Item 5): every state-changing action in the admin and
  // counter panels writes to the `audit_log` node. actor_id is always the
  // specific staff member — never a generic "system" actor.
  // ============================================================
  async function writeAuditEntry(params: {
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId?: string;
    beforeState?: any;
    afterState?: any;
  }): Promise<void> {
    try {
      const authToken = await getAdminAuthToken();
      if (!authToken) return;
      const entry = {
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        actor_id: params.actorId,
        actor_role: params.actorRole,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        before_state: params.beforeState ?? null,
        after_state: params.afterState ?? null,
        timestamp: new Date().toISOString(),
      };
      await rtdbPush(`audit_log`, entry, authToken).catch(() => {});
    } catch (err: any) {
      // Audit writes must never fail the primary action; log and continue.
      console.error("[AUDIT] Failed to write audit entry:", err.message);
    }
  }

  /**
   * requireRole: server-side guard that applies the RBAC hierarchy. Use on
   * every admin/counter endpoint. Example: requireRole('event_manager')
   * allows super_admin and event_manager; counter_staff is rejected with 403.
   */
  const requireRole = (required: RbacRole | RbacRole[]) => {
    const requiredRoles = Array.isArray(required) ? required : [required];
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(403).json({ success: false, error: "Access Denied: Missing or invalid authentication token." });
        }
        const token = authHeader.split(" ")[1];
        const verified = await verifyFirebaseToken(token);
        if (!verified) {
          return res.status(403).json({ success: false, error: "Access Denied: Missing or invalid authentication token." });
        }
        const firebaseRole = await fetchUserRoleFromRTDB(verified.uid, token);
        const rbacRole = toRbacRole(firebaseRole);
        if (!rbacRole) {
          return res.status(403).json({ success: false, error: "Access Denied: Insufficient role." });
        }
        // Organizer approval check for event_manager level (kept from verifyRole)
        if (rbacRole === "event_manager") {
          const orgsSnap = await rtdbGet("organizers", token);
          const orgsList: any[] = Object.values(orgsSnap.data || {});
          const org = orgsList.find((o: any) => o.userId === verified.uid);
          if (!org || org.status !== "approved") {
            return res.status(403).json({ success: false, error: "Access Denied: Organizer profile is not approved." });
          }
        }
        const allowed = requiredRoles.some((r) => rbacAllows(rbacRole, r));
        if (!allowed) {
          return res.status(403).json({ success: false, error: `Access Denied: Role '${rbacRole}' insufficient.` });
        }
        (req as any).user = { ...(req as any).user, uid: verified.uid, email: verified.email, role: firebaseRole, rbacRole, idToken: token };
        return next();
      } catch (err: any) {
        return res.status(401).json({ success: false, error: "Authentication failed: " + err.message });
      }
    };
  };

  const verifyRole = (allowedRoles: string[]) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        const roleHeader = req.headers['x-user-role'] as string;
        const urlInfo = `[AUTH] ${req.method} ${req.originalUrl}`;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          const verified = await verifyFirebaseToken(token);
          if (verified) {
            let serverRole = await fetchUserRoleFromRTDB(verified.uid, token);

            if (roleHeader && allowedRoles.includes(roleHeader) && process.env.NODE_ENV !== 'production') {
              serverRole = roleHeader;
            }

            if (serverRole === 'organizer') {
              const orgsSnap = await rtdbGet('organizers', token);
              const orgsList: any[] = Object.values(orgsSnap.data || {});
              const org = orgsList.find((o: any) => o.userId === verified.uid);
              if (!org || org.status !== 'approved') {
                return res.status(403).json({ success: false, error: "Access Denied: Organizer profile is not approved." });
              }
            }

            if (allowedRoles.includes(serverRole)) {
              const rbacRole = toRbacRole(serverRole);
              (req as any).user = { uid: verified.uid, email: verified.email, role: serverRole, rbacRole, idToken: token };
              return next();
            }
            return res.status(403).json({ success: false, error: `Access Denied: Role '${serverRole}' insufficient.` });
          }
        }

        return res.status(403).json({ success: false, error: "Access Denied: Missing or invalid authentication token." });
      } catch (err: any) {
        return res.status(401).json({ success: false, error: "Authentication failed: " + err.message });
      }
    };
  };

  // Endpoint to verify user auth session and return server-verified role
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Missing authorization token." });
      }

      const token = authHeader.split(' ')[1];
      const verified = await verifyFirebaseToken(token);
      if (!verified) {
        return res.status(401).json({ success: false, error: "Invalid or expired token." });
      }

      const { uid, email } = verified;
      const role = await fetchUserRoleFromRTDB(uid, token);
      return res.json({ success: true, uid, email, role });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Coupons management
  const getCouponsList = async (idToken?: string) => {
    try {
      const snap = await rtdbGet("coupons", idToken);
      if (snap.data) {
        COUPONS_DATABASE = snap.data || {};
      }
    } catch (err: any) {
      console.warn("[COUPONS DB WARNING] RTDB coupons read failed:", err.message);
    }
    return Object.values(COUPONS_DATABASE);
  };

  const getCouponByCode = async (code: string, idToken?: string) => {
    const upper = code.trim().toUpperCase();
    try {
      const snap = await rtdbGet(`coupons/${upper}`, idToken);
      if (snap.data) {
        COUPONS_DATABASE[upper] = snap.data;
        return snap.data;
      }
    } catch (err: any) {
      console.warn(`[COUPONS DB WARNING] RTDB coupon read for ${upper} failed:`, err.message);
    }
    return COUPONS_DATABASE[upper] || null;
  };

  const saveCouponToDB = async (code: string, coupon: any, idToken?: string) => {
    const upper = code.trim().toUpperCase();
    if (coupon === null) {
      delete COUPONS_DATABASE[upper];
    } else {
      COUPONS_DATABASE[upper] = coupon;
    }
    try {
      if (coupon === null) {
        await rtdbDelete(`coupons/${upper}`, idToken);
      } else {
        await rtdbSet(`coupons/${upper}`, coupon, idToken);
      }
    } catch (err: any) {
      console.warn(`[COUPONS DB WARNING] RTDB coupon write for ${upper} failed:`, err.message);
    }
  };

  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { couponCode, eventId, totalAmount } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      if (!couponCode || typeof couponCode !== "string") {
        return res.status(400).json({ valid: false, error: "Please enter a coupon code." });
      }

      const codeUpper = couponCode.trim().toUpperCase();
      const coupon = await getCouponByCode(codeUpper, token);

      if (!coupon || !coupon.isActive) {
        return res.status(400).json({ valid: false, error: "Invalid or inactive coupon code." });
      }

      if (new Date(coupon.validUntil) < new Date()) {
        return res.status(400).json({ valid: false, error: `Coupon expired on ${coupon.validUntil}.` });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ valid: false, error: "Coupon usage limit reached!" });
      }

      if (coupon.eventId && eventId && coupon.eventId !== eventId) {
        return res.status(400).json({ valid: false, error: "This coupon is restricted to a specific event." });
      }

      const rawAmount = Number(totalAmount) || 0;
      let discountAmount = 0;

      if (coupon.type === "percentage") {
        discountAmount = Math.round((rawAmount * coupon.value) / 100);
      } else if (coupon.type === "fixed") {
        discountAmount = Math.min(rawAmount, coupon.value);
      }

      const finalAmount = Math.max(0, rawAmount - discountAmount);

      return res.json({
        valid: true,
        couponCode: coupon.code,
        discountType: coupon.type,
        discountValue: coupon.value,
        discountAmount,
        originalAmount: rawAmount,
        finalAmount,
        coupon,
      });
    } catch (err: any) {
      return res.status(500).json({ valid: false, error: err.message || "Failed to validate coupon" });
    }
  });

  app.get("/api/coupons", verifyRole(['admin']), async (req: any, res) => {
    try {
      const coupons = await getCouponsList(req.user?.idToken);
      return res.json({ success: true, coupons });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/coupons/create", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { code, type, value, validUntil, usageLimit, eventId } = req.body;
      if (!code || !type || value === undefined) {
        return res.status(400).json({ success: false, error: "Code, type, and value are required." });
      }
      // Server-side validation (Item 6): discount percentage capped at 0–100,
      // fixed-amount discounts must be non-negative numbers.
      if (type === "percentage") {
        const pctError = validateDiscountPercent(value);
        if (pctError) return res.status(400).json({ success: false, error: pctError });
      } else {
        const fixedError = validateNonNegativePrice(value);
        if (fixedError) return res.status(400).json({ success: false, error: fixedError });
      }
      if (usageLimit !== undefined && usageLimit !== null) {
        const limitError = validatePositiveInteger(usageLimit);
        if (limitError) return res.status(400).json({ success: false, error: limitError });
      }
      if (validUntil) {
        if (Number.isNaN(Date.parse(String(validUntil)))) {
          return res.status(400).json({ success: false, error: "validUntil is not a valid date." });
        }
      }

      const upperCode = code.trim().toUpperCase();
      const existing = await getCouponByCode(upperCode, req.user?.idToken);
      if (existing) {
        return res.status(400).json({ success: false, error: "Coupon code already exists." });
      }

      const newCoupon = {
        id: `c_${Date.now()}`,
        code: upperCode,
        type: type as 'percentage' | 'fixed',
        value: Number(value),
        validUntil: validUntil || "2028-12-31",
        usageLimit: usageLimit ? Number(usageLimit) : null,
        usedCount: 0,
        eventId: eventId || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      await saveCouponToDB(upperCode, newCoupon, req.user?.idToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "coupon.created",
        entityType: "coupon",
        entityId: upperCode,
        afterState: newCoupon,
      });
      return res.json({ success: true, coupon: newCoupon });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/coupons/toggle", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: "Coupon code is required" });
      }
      const upper = code.trim().toUpperCase();
      const coupon = await getCouponByCode(upper, req.user?.idToken);
      if (!coupon) {
        return res.status(404).json({ success: false, error: "Coupon not found" });
      }

      const beforeState = { ...coupon };
      coupon.isActive = !coupon.isActive;
      await saveCouponToDB(upper, coupon, req.user?.idToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "coupon.toggled",
        entityType: "coupon",
        entityId: upper,
        beforeState,
        afterState: coupon,
      });
      return res.json({ success: true, coupon });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/coupons/:code", verifyRole(['admin']), async (req: any, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const coupon = await getCouponByCode(code, req.user?.idToken);
      if (!coupon) {
        return res.status(404).json({ success: false, error: "Coupon not found" });
      }
      const beforeState = { ...coupon };
      await saveCouponToDB(code, null, req.user?.idToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "coupon.deleted",
        entityType: "coupon",
        entityId: code,
        beforeState,
      });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -----------------------------------------------------------
  // Reservation endpoints (server-authoritative seat holds)
  // -----------------------------------------------------------

  /** Identify the owner for reservation endpoints: logged-in uid or a guest session id. */
  async function resolveReservationOwner(
    req: express.Request
  ): Promise<{ ownerId: string; authenticated: boolean; uid?: string; role?: string; guestOwnerId?: string }> {
    const headerSession = (req.headers["x-session-id"] as string)?.slice(0, 64) || "";
    const sessionIdGuest = headerSession
      ? "guest_" + crypto.createHash("sha256").update(headerSession).digest("hex").slice(0, 16)
      : "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const verified = await (async () => {
        const cacheKey = `rs_${token}`;
        const cached = (app as any).__reservationTokenCache?.get?.(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached;
        try {
          const v = await verifyFirebaseToken(token);
          const entry = { ...v, expiresAt: Date.now() + 5 * 60 * 1000 };
          if ((app as any).__reservationTokenCache) (app as any).__reservationTokenCache.set(cacheKey, entry);
          return v ? entry : null;
        } catch {
          return null;
        }
      })();
      if (verified) {
        const role = await fetchUserRoleFromRTDB(verified.uid, token);
        return { ownerId: verified.uid, authenticated: true, uid: verified.uid, role, guestOwnerId: sessionIdGuest || undefined };
      }
    }
    // Guest session identity: based on the stable X-Session-Id header. The old
    // composite scheme (IP|UA|sessionId) was flaky behind Vercel's edge proxy
    // because req.ip varies between requests — it is kept as a legacy candidate
    // so reservations created under the old scheme still resolve during use.
    const raw = `${req.ip || req.socket?.remoteAddress || "unknown"}|${req.headers["user-agent"] || "unknown"}|${headerSession}`;
    const legacyCompositeGuest = "guest_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return { ownerId: sessionIdGuest || legacyCompositeGuest, authenticated: false };
  }

  /**
   * A guest reservation may be created just before Firebase login completes.
   * Preserve access only when that same browser also proves knowledge of the
   * original opaque session id; do not accept an arbitrary owner id from the
   * client. This prevents a valid sign-in from orphaning its in-progress hold.
   */
  function isReservationOwner(record: ReservationRecord, owner: { ownerId: string; guestOwnerId?: string }): boolean {
    return record.ownerId === owner.ownerId || Boolean(owner.guestOwnerId && record.ownerId === owner.guestOwnerId);
  }

  app.post("/api/reservations", async (req, res) => {
    try {
      const { eventId, tierId, quantity, seatIds, idempotencyKey } = req.body || {};

      if (!eventId || !tierId || !quantity) {
        return res.status(400).json({ success: false, error: "Missing eventId, tierId, or quantity." });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_RESERVATION) {
        return res.status(400).json({ success: false, error: `Quantity must be between 1 and ${MAX_TICKETS_PER_RESERVATION}.` });
      }

      // Idempotency: same key returns the same completed result
      const idKey = String(idempotencyKey || `${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const idHash = hashIdempotencyKey(idKey);
      const existing = idempotencyResults.get(idHash);
      if (existing) {
        // Only reuse when the reservation is still alive: stale, cancelled,
        // expired, or released records must never be returned — the client
        // treats them as a live hold and can end up paying for dead seats.
        const cachedId = existing.result?.reservationId;
        if (cachedId) {
          const rec = await rtdbGet(`reservations/${cachedId}`, await getAdminAuthToken());
          const r = rec?.data;
          if (r && r.status === "active" && r.expiresAt && r.expiresAt > Date.now()) {
            return res.json({ success: true, idempotent: true, ...existing.result });
          }
        }
        // Fall through: treat the replay as a fresh request and recreate.
        idempotencyResults.delete(idHash);
      }

      const owner = await resolveReservationOwner(req);
      const authToken = await getAdminAuthToken();

      // Load and validate event
      const eventRes = await rtdbGet(`events/${eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) {
        return res.status(404).json({ success: false, error: "Event not found." });
      }
      if ((eventData.status || "published") === "cancelled" || (eventData.status || "published") === "sold_out") {
        return res.status(409).json({ success: false, error: `Event is ${eventData.status || "unavailable"}.` });
      }

      const normalizedSeats = normalizeSeatIds(seatIds || []);
      if (normalizedSeats.length > 0 && normalizedSeats.length !== quantity) {
        return res.status(400).json({ success: false, error: "Number of selected seats must equal the requested quantity." });
      }

      let quoteResult;
      try {
        quoteResult = computeReservationQuote(eventData, normalizedSeats, quantity, tierId);
      } catch (e: any) {
        return res.status(400).json({ success: false, error: e.message });
      }

      // Inventory check (tier-level)
      const tier = quoteResult.tier;
      if (tier && (tier.remainingInventory ?? 0) < quantity) {
        return res.status(409).json({ success: false, error: `Only ${tier.remainingInventory ?? 0} tickets remain in this tier.` });
      }

      // Deterministic reservation id so claim, record, and idempotent replay all match
      const reservationId = `rsrv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Claim seats atomically if seat-based (uses the SAME reservationId as the record)
      if (normalizedSeats.length > 0) {
        const claim = await claimSeatsAtomically(authToken, eventId, normalizedSeats, reservationId, owner.ownerId);
        if (!claim.committed) {
          return res.status(409).json({ success: false, error: claim.error || "One or more seats were just taken. Please try again." });
        }
      }

      const now = Date.now();
      const record: ReservationRecord = {
        reservationId,
        eventId,
        tierId,
        quantity,
        seatIds: normalizedSeats,
        ownerId: owner.ownerId,
        status: "active",
        createdAt: now,
        expiresAt: now + RESERVATION_HOLD_TTL_MS,
      };

      await rtdbSet(`reservations/${reservationId}`, record, authToken);

      const result = {
        success: true,
        reservationId,
        ownerId: owner.ownerId,
        status: record.status,
        seatIds: record.seatIds,
        quantity: record.quantity,
        expiresAt: record.expiresAt,
        serverNow: now,
        holdTtlMs: RESERVATION_HOLD_TTL_MS,
      };

      idempotencyResults.set(idHash, { createdAt: now, result });
      console.log(`[RESERVATION] Created ${reservationId} for event ${eventId} owner=${owner.ownerId} seats=${normalizedSeats.length}`);
      return res.json(result);
    } catch (err: any) {
      console.error("[RESERVATION ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to create reservation. Please try again." });
    }
  });

  app.get("/api/reservations/:reservationId", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) {
        return res.status(404).json({ success: false, error: "Reservation not found." });
      }
      if (!isReservationOwner(record, owner)) {
        return res.status(403).json({ success: false, error: "This reservation does not belong to you." });
      }
      const now = Date.now();
      if (record.status === "active" && now > record.expiresAt) {
        record.status = "expired";
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired" }, authToken);
      }
      return res.json({ success: true, ...record, serverNow: now });
    } catch (err: any) {
      console.error("[RESERVATION GET ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to load reservation." });
    }
  });

  app.post("/api/reservations/:reservationId/renew", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status} and cannot be renewed.` });
      const now = Date.now();
      if (now > record.expiresAt) {
        record.status = "expired";
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired" }, authToken);
        return res.status(409).json({ success: false, error: "Reservation has expired. Please reselect your seats." });
      }
      const maxExpiresAt = record.createdAt + (RESERVATION_HOLD_TTL_MS * 4);
      const newExpiresAt = Math.min(
        Math.max(now + RESERVATION_HOLD_TTL_MS, record.expiresAt + RESERVATION_HOLD_TTL_MS),
        maxExpiresAt
      );
      if (newExpiresAt <= record.expiresAt) {
        return res.status(409).json({ success: false, error: "Maximum reservation extensions reached. Please complete payment." });
      }
      const update: any = { expiresAt: newExpiresAt };
      if (record.seatIds.length > 0) {
        for (const seatId of record.seatIds) {
          rtdbUpdate(`seats/${record.eventId}/${seatId}`, { holdExpiresAt: newExpiresAt, heldBy: record.ownerId, status: "held", heldAt: now }, authToken).catch(() => {});
        }
      }
      await rtdbUpdate(`reservations/${record.reservationId}`, update, authToken);
      return res.json({ success: true, expiresAt: newExpiresAt, serverNow: now });
    } catch (err: any) {
      console.error("[RESERVATION RENEW ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to renew reservation." });
    }
  });

  app.delete("/api/reservations/:reservationId", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.json({ success: true, message: `Reservation already ${record.status}.` });
      const now = Date.now();
      record.status = "released";
      await rtdbUpdate(`reservations/${record.reservationId}`, { status: "released" }, authToken);
      if (record.seatIds.length > 0) {
        for (const seatId of record.seatIds) {
          rtdbTransaction(`seats/${record.eventId}/${seatId}`, (seat: any) => {
            if (seat && seat.status === "held" && seat.heldBy === record.ownerId && seat.reservationId === record.reservationId) {
              return { ...seat, status: "available", heldBy: null, reservationId: null, heldAt: null, holdExpiresAt: null };
            }
            return seat;
          }, authToken).catch(() => {});
        }
      }
      console.log(`[RESERVATION] Released ${record.reservationId}`);
      return res.json({ success: true, status: "released" });
    } catch (err: any) {
      console.error("[RESERVATION RELEASE ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to release reservation." });
    }
  });

  // PUT /api/reservations/:reservationId/selection — atomic seat-set adjustment (same owner, active)
  // Claims new seats and releases seats no longer in the selection within one request.
  app.put("/api/reservations/:reservationId/selection", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status} and cannot be adjusted.` });
      const now = Date.now();
      if (now > record.expiresAt) {
        record.status = "expired";
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired" }, authToken);
        return res.status(409).json({ success: false, error: "Reservation has expired. Please reselect your seats." });
      }
      let { seatIds = [], quantity } = (req.body || {});
      seatIds = normalizeSeatIds(seatIds || []);
      if (quantity === undefined) quantity = seatIds.length;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_RESERVATION) {
        return res.status(400).json({ success: false, error: `Quantity must be between 1 and ${MAX_TICKETS_PER_RESERVATION}.` });
      }
      if (seatIds.length !== quantity) {
        return res.status(400).json({ success: false, error: "Number of selected seats must equal the requested quantity." });
      }
      // Load event for inventory and quote
      const eventRes = await rtdbGet(`events/${record.eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) return res.status(404).json({ success: false, error: "Event not found." });
      // Inventory check for the final set (tier-level)
      const tierId = record.tierId;
      let quoteResult;
      try {
        quoteResult = computeReservationQuote(eventData, seatIds, quantity, tierId);
      } catch (e: any) {
        return res.status(400).json({ success: false, error: e.message });
      }
      const tier = quoteResult.tier;
      const addedCount = seatIds.filter((s) => !record.seatIds.includes(s)).length;
      if (tier && (tier.remainingInventory ?? 0) < addedCount) {
        return res.status(409).json({ success: false, error: `Only ${tier.remainingInventory ?? 0} tickets remain in this tier.` });
      }
      // Claim any seats not yet held by us (atomic, with rollback)
      const toClaim = seatIds.filter(
        (s) => !record.seatIds.includes(s) && !(s as any).__skip // noop
      );
      if (toClaim.length > 0) {
        const claim = await claimSeatsAtomically(authToken, record.eventId, toClaim, record.reservationId, record.ownerId);
        if (!claim.committed) {
          return res.status(409).json({ success: false, error: claim.error || "One or more seats were just taken. Please try again." });
        }
      }
      // Release seats no longer in the selection
      const toRelease = record.seatIds.filter((s) => !seatIds.includes(s));
      if (toRelease.length > 0) {
        for (const seatId of toRelease) {
          rtdbTransaction(`seats/${record.eventId}/${seatId}`, (seat: any) => {
            if (seat && seat.status === "held" && seat.heldBy === record.ownerId && seat.reservationId === record.reservationId) {
              return { ...seat, status: "available", heldBy: null, reservationId: null, heldAt: null, holdExpiresAt: null };
            }
            return seat;
          }, authToken).catch(() => {});
        }
      }
      // Quotes are always recalculated at quote/payment time, not stored in a hold.
      const newExpiresAt = Math.max(now + RESERVATION_HOLD_TTL_MS, record.expiresAt);
      const update: any = { seatIds, quantity, expiresAt: newExpiresAt };
      await rtdbUpdate(`reservations/${record.reservationId}`, update, authToken);
      console.log(`[RESERVATION] Updated ${record.reservationId} seats=${seatIds.join(",")} released=${toRelease.join(",")}`);
      return res.json({
        success: true,
        reservationId: record.reservationId,
        status: "active",
        seatIds,
        quantity,
        expiresAt: newExpiresAt,
        serverNow: now,
        holdTtlMs: RESERVATION_HOLD_TTL_MS,
      });
    } catch (err: any) {
      console.error("[RESERVATION SELECTION UPDATE ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to update seat selection." });
    }
  });

  /** POST /api/reservations/:reservationId/attendee — save attendee details without starting payment */
  app.post("/api/reservations/:reservationId/attendee", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const { name, email, phone } = req.body || {};
      if (!name || !email || !phone) {
        return res.status(400).json({ success: false, error: "Name, email, and phone are required." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: "Invalid email address." });
      }
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status}.` });
      const attendee = {
        name: String(name).slice(0, 100),
        email: String(email).slice(0, 150),
        phone: String(phone).slice(0, 20),
      };
      await rtdbUpdate(`reservations/${record.reservationId}`, { attendee }, authToken);
      return res.json({ success: true, attendee });
    } catch (err: any) {
      console.error("[RESERVATION ATTENDEE ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to save attendee details." });
    }
  });

  /** Re-quote an active reservation (coupon-aware). Server always computes totals. */
  app.post("/api/reservations/:reservationId/quote", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const { couponCode } = req.body || {};
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      const now = Date.now();
      if (record.status !== "active" || now > record.expiresAt) {
        return res.status(409).json({ success: false, error: "Reservation is no longer active." });
      }
      const eventRes = await rtdbGet(`events/${record.eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) return res.status(404).json({ success: false, error: "Event no longer available." });
      const quoteResult = computeReservationQuote(eventData, record.seatIds, record.quantity, record.tierId);
      let discountMinor = 0;
      let appliedCoupon: any = null;
      if (couponCode) {
        const codeUpper = String(couponCode).trim().toUpperCase();
        const couponRes = await rtdbGet(`coupons/${codeUpper}`, authToken);
        const coupon = couponRes.data;
        if (coupon && coupon.isActive && new Date(coupon.validUntil) >= new Date() && (!coupon.eventId || coupon.eventId === record.eventId) && (!coupon.usageLimit || (coupon.usedCount || 0) < coupon.usageLimit)) {
          discountMinor = coupon.type === "percentage"
            ? Math.round((quoteResult.quote.totalMinor * Math.min(100, coupon.value)) / 100)
            : coupon.value * 100;
          appliedCoupon = { code: codeUpper, type: coupon.type, value: coupon.value };
        }
      }
      const totalMinor = Math.max(0, quoteResult.quote.totalMinor - discountMinor);
      return res.json({ success: true, quote: { ...quoteResult.quote, discountMinor, totalMinor }, appliedCoupon, serverNow: now });
    } catch (err: any) {
      console.error("[RESERVATION QUOTE ERROR]", err.message || err);
      return res.status(400).json({ success: false, error: err.message || "Failed to compute quote." });
    }
  });

  // -----------------------------------------------------------
  // Direct purchase (no external payment gateway)
  // Server-authoritative: validates the reservation + quote,
  // writes the pending order, then finalizes atomically.
  // -----------------------------------------------------------

  app.post("/api/purchase", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const { reservationId, couponCode } = req.body || {};
      if (!reservationId) {
        return res.status(400).json({ success: false, error: "reservationId is required." });
      }
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) {
        return res.status(404).json({ success: false, error: "Reservation not found." });
      }
      if (!isReservationOwner(record, owner)) {
        return res.status(403).json({ success: false, error: "Not your reservation." });
      }
      const now = Date.now();
      if (record.status !== "active" || now > record.expiresAt) {
        return res.status(409).json({ success: false, error: "Reservation is no longer active. Please select your seats again." });
      }

      const eventRes = await rtdbGet(`events/${record.eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) {
        return res.status(404).json({ success: false, error: "Event no longer available." });
      }

      const quoteResult = computeReservationQuote(eventData, record.seatIds, record.quantity, record.tierId);
      let discountMinor = 0;
      let appliedCoupon: any = null;
      if (couponCode) {
        const codeUpper = String(couponCode).trim().toUpperCase();
        const couponRes = await rtdbGet(`coupons/${codeUpper}`, authToken);
        const coupon = couponRes.data;
        if (coupon && coupon.isActive && new Date(coupon.validUntil) >= new Date() && (!coupon.eventId || coupon.eventId === record.eventId) && (!coupon.usageLimit || (coupon.usedCount || 0) < coupon.usageLimit)) {
          discountMinor = coupon.type === "percentage"
            ? Math.round((quoteResult.quote.totalMinor * Math.min(100, coupon.value)) / 100)
            : coupon.value * 100;
          appliedCoupon = { code: codeUpper, type: coupon.type, value: coupon.value };
        }
      }
      const totalMinor = Math.max(0, quoteResult.quote.totalMinor - discountMinor);

      // Server-authoritative pending order (fulfillment source of truth).
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await rtdbSet(`pending_orders/${orderId}`, {
        eventId: record.eventId,
        tierId: record.tierId,
        seatIds: record.seatIds,
        quantity: record.quantity,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customerDetails: record.attendee || {},
        userId: owner.ownerId,
        amount: totalMinor / 100,
        reservationId,
        createdAt: now,
        paymentMethod: "direct",
      }, authToken);

      const result = await finalizeBookingServerSide(orderId, "direct", orderId, authToken);
      if (!result.success) {
        return res.status(409).json({ success: false, error: result.error || "Failed to complete booking." });
      }
      return res.json({
        success: true,
        ticket: result.ticket,
        booking: result.booking,
        appliedCoupon,
        totalMinor,
      });
    } catch (err: any) {
      console.error("[PURCHASE ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: err.message || "Failed to complete purchase." });
    }
  });

  // -----------------------------------------------------------
  // Razorpay payment routes (test-mode-first)
  // Server-authoritative: order created server-side, fulfillment only after
  // payment status is verified against the Razorpay API.
  // -----------------------------------------------------------

  app.post("/api/razorpay/create-order", async (req, res) => {
    try {
      const cfg = isRazorpayConfigured();
      if (!cfg.available) {
        return res.status(503).json({ success: false, error: cfg.reason || "Payment is not configured." });
      }
      const owner = await resolveReservationOwner(req);
      const { reservationId } = req.body || {};
      if (!reservationId) {
        return res.status(400).json({ success: false, error: "reservationId is required." });
      }
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${reservationId}`, authToken)).data as ReservationRecord | null;
      if (!record) {
        return res.status(404).json({ success: false, error: "Reservation not found." });
      }
      if (!isReservationOwner(record, owner)) {
        return res.status(403).json({ success: false, error: "Not your reservation." });
      }
      const now = Date.now();
      if (record.status !== "active" || now > record.expiresAt) {
        return res.status(409).json({ success: false, error: "Reservation is no longer active. Please select your seats again." });
      }
      if (record.attendee && (!record.attendee.name || !record.attendee.email || !record.attendee.phone)) {
        return res.status(400).json({ success: false, error: "Attendee details are required before payment." });
      }

      const eventRes = await rtdbGet(`events/${record.eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) {
        return res.status(404).json({ success: false, error: "Event no longer available." });
      }

      const quoteResult = computeReservationQuote(eventData, record.seatIds, record.quantity, record.tierId);
      let discountMinor = 0;
      let appliedCoupon: any = null;
      const couponCode = String(req.body?.couponCode || "").trim();
      if (couponCode) {
        const codeUpper = couponCode.toUpperCase();
        const couponRes = await rtdbGet(`coupons/${codeUpper}`, authToken);
        const coupon = couponRes.data;
        if (coupon && coupon.isActive && new Date(coupon.validUntil) >= new Date() && (!coupon.eventId || coupon.eventId === record.eventId) && (!coupon.usageLimit || (coupon.usedCount || 0) < coupon.usageLimit)) {
          discountMinor = coupon.type === "percentage"
            ? Math.round((quoteResult.quote.totalMinor * Math.min(100, coupon.value)) / 100)
            : coupon.value * 100;
          appliedCoupon = { code: codeUpper, type: coupon.type, value: coupon.value };
        }
      }
      const totalMinor = Math.max(0, quoteResult.quote.totalMinor - discountMinor);

      // Our server-authoritative pending order (source of truth for fulfillment).
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await rtdbSet(`pending_orders/${orderId}`, {
        eventId: record.eventId,
        tierId: record.tierId,
        seatIds: record.seatIds,
        quantity: record.quantity,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customerDetails: record.attendee || {},
        userId: owner.ownerId,
        amount: totalMinor / 100,
        amountMinor: totalMinor,
        reservationId,
        createdAt: now,
        paymentMethod: "razorpay",
        rzpOrderId: null,
      }, authToken);

      // Create the Razorpay order server-side. Razorpay returns the amount it
      // accepted; we reconcile against our computed amount.
      const rzp = await createRazorpayOrder({
        amountPaise: totalMinor,
        currency: "INR",
        receipt: orderId,
        attendeeName: record.attendee?.name,
        attendeeEmail: record.attendee?.email,
      });
      if (!rzp.ok) {
        await rtdbDelete(`pending_orders/${orderId}`, authToken);
        return res.status(502).json({ success: false, error: rzp.error || "Payment gateway is currently unavailable." });
      }
      if (rzp.amount !== totalMinor) {
        await rtdbDelete(`pending_orders/${orderId}`, authToken);
        console.error(`[RAZORPAY] amount mismatch: ours=${totalMinor} razorpay=${rzp.amount}`);
        return res.status(500).json({ success: false, error: "Payment gateway amount mismatch. Please try again." });
      }

      // Persist the Razorpay order id onto our pending order.
      await rtdbUpdate(`pending_orders/${orderId}`, {
        rzpOrderId: rzp.id,
        rzpAmount: rzp.amount,
        rzpKey: razorpayKeyId,
        rzpCreatedAt: Date.now(),
      }, authToken);

      // Extend only the hold expiry. Payment state belongs to pending_orders.
      const holdUntil = Math.max(record.expiresAt, now + RESERVATION_HOLD_TTL_MS);
      await rtdbUpdate(`reservations/${reservationId}`, { expiresAt: holdUntil }, authToken);

      return res.json({
        success: true,
        orderId,
        rzpOrderId: rzp.id,
        rzpKey: razorpayKeyId,
        amountMinor: totalMinor,
        appliedCoupon,
        isTestMode: isTestMode(),
        holdUntil,
      });
    } catch (err: any) {
      console.error("[RAZORPAY CREATE-ORDER ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: err.message || "Failed to create payment order." });
    }
  });

  app.post("/api/razorpay/verify-payment", async (req, res) => {
    try {
      const cfg = isRazorpayConfigured();
      if (!cfg.available) {
        return res.status(503).json({ success: false, error: cfg.reason || "Payment is not configured." });
      }
      const owner = await resolveReservationOwner(req);
      const { orderId, paymentId } = req.body || {};
      if (!orderId || !paymentId) {
        return res.status(400).json({ success: false, error: "orderId and paymentId are required." });
      }
      const authToken = await getAdminAuthToken();

      // Idempotency: already fulfilled.
      const processedRes = await rtdbGet(`processed_orders/${orderId}`, authToken);
      if (processedRes.data) {
        return res.json({ success: true, ticket: processedRes.data.ticket, booking: processedRes.data.booking, alreadyProcessed: true });
      }

      const pendingRes = await rtdbGet(`pending_orders/${orderId}`, authToken);
      const pendingOrder: any = pendingRes.data;
      if (!pendingOrder) {
        return res.status(404).json({ success: false, error: "Order not found or expired." });
      }
      if (pendingOrder.userId !== owner.ownerId) {
        return res.status(403).json({ success: false, error: "Not your order." });
      }
      if (pendingOrder.paymentMethod !== "razorpay") {
        return res.status(409).json({ success: false, error: "This order was not created for Razorpay payment." });
      }

      // Reconcile with Razorpay: fetch the actual payment and match order id + amount.
      const paymentRes = await fetchRazorpayPayment(paymentId);
      if (!paymentRes.ok) {
        return res.status(400).json({ success: false, error: paymentRes.error || "Could not verify payment." });
      }
      const payment = paymentRes.payment;
      if (!payment || !payment.order_id || payment.order_id !== pendingOrder.rzpOrderId) {
        return res.status(400).json({ success: false, error: "Payment does not belong to this order." });
      }
      const captured = payment.amount === pendingOrder.rzpAmount &&
        (payment.status === "captured" || payment.status === "authorized") &&
        !payment.refunded;
      if (!captured) {
        return res.status(400).json({
          success: false,
          error: payment.status === "created"
            ? "Payment is pending. Please complete the payment in the checkout window."
            : payment.status === "failed"
              ? "Payment failed. Your seats are still held — please retry."
              : `Payment is not complete (status: ${payment.status}).`,
          paymentStatus: payment.status,
        });
      }

      // Re-quote server-side (coupon-aware) as a last sanity check before fulfillment.
      const eventRes = await rtdbGet(`events/${pendingOrder.eventId}`, authToken);
      const eventData = eventRes.data;
      if (!eventData) {
        return res.status(404).json({ success: false, error: "Event no longer available." });
      }
      const quoteResult = computeReservationQuote(eventData, pendingOrder.seatIds, pendingOrder.quantity, pendingOrder.tierId);
      const expectedMinor = Math.max(0, quoteResult.quote.totalMinor - (pendingOrder.couponDiscountMinor || 0));
      if (pendingOrder.amountMinor && pendingOrder.amountMinor !== expectedMinor) {
        return res.status(400).json({ success: false, error: "Quote changed since order creation. Please restart checkout." });
      }

      const result = await finalizeBookingServerSide(orderId, "razorpay", paymentId, authToken);
      if (!result.success) {
        return res.status(409).json({ success: false, error: result.error || "Failed to complete booking." });
      }
      return res.json({
        success: true,
        ticket: result.ticket,
        booking: result.booking,
        paymentMethod: "razorpay",
        paymentId,
      });
    } catch (err: any) {
      console.error("[RAZORPAY VERIFY-PAYMENT ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: err.message || "Failed to verify payment." });
    }
  });

  /**
   * Razorpay webhook (supplemental path). Raw-body HMAC-SHA256 verification
   * with KEY_SECRET; idempotent via processed_orders. Never the primary
   * fulfillment path — the client-driven verify-payment flow is.
   */
  app.post("/api/razorpay/webhook", async (req, res) => {
    try {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const signature = (req.headers["x-razorpay-signature"] as string) || "";
      if (!verifyWebhookSignature(rawBody, signature)) {
        console.warn("[RAZORPAY WEBHOOK] invalid signature");
        return res.status(401).json({ success: false, error: "Invalid signature." });
      }
      let payload: any = {};
      try { payload = JSON.parse(rawBody); } catch { return res.status(400).json({ success: false, error: "Invalid payload." }); }
      const event = payload?.event;
      const entity: any = payload?.payload?.payment?.entity || payload?.payload?.order?.entity || {};
      const paymentId = entity?.id || "";
      const rzpOrderId = entity?.order_id || "";
      const relevantEvents = ["payment.authorized", "payment.captured", "order.paid"];
      if (!relevantEvents.includes(event)) {
        return res.json({ success: true, ignored: true });
      }
      if (!paymentId || !rzpOrderId) {
        return res.status(400).json({ success: false, error: "Missing payment/order ids." });
      }
      const authToken = await getAdminAuthToken();
      // Find our pending order by Razorpay order id.
      const allPending = await rtdbGet("pending_orders", authToken);
      const pendingEntries = (allPending.data || {}) as Record<string, any>;
      const pendingOrder = Object.entries(pendingEntries).find(([, v]: any) => v?.rzpOrderId === rzpOrderId);
      if (!pendingOrder) {
        console.warn(`[RAZORPAY WEBHOOK] no pending order for rzp order ${rzpOrderId}`);
        return res.json({ success: true, ignored: true });
      }
      const [orderId] = pendingOrder;
      // Idempotency via processed_orders (finalizeBookingServerSide also guards).
      if ((await rtdbGet(`processed_orders/${orderId}`, authToken)).data) {
        return res.json({ success: true });
      }
      const result = await finalizeBookingServerSide(orderId, "razorpay", paymentId, authToken);
      if (!result.success) {
        console.error(`[RAZORPAY WEBHOOK] fulfillment failed for ${orderId}: ${result.error}`);
      }
      return res.json({ success: result.success });
    } catch (err: any) {
      console.error("[RAZORPAY WEBHOOK ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Webhook processing failed." });
    }
  });

  app.post("/api/seats/sweep-holds", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      await sweepExpiredHolds();
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "seats.sweep",
        entityType: "seats",
      });
      return res.json({ success: true, message: "Expired holds swept successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Protected event and seat-map mutations. Public clients may read events and seats,
  // but every mutation is performed here with the server-held Firebase token.
  const assertEventMutationAccess = async (eventId: string, req: any, adminToken: string | undefined) => {
    if (req.user?.role === 'admin') return true;
    const snap = await rtdbGet(`events/${eventId}`, adminToken);
    return Boolean(snap.data && snap.data.organizerId === req.user?.uid);
  };

  // ============================================================
  // Server-side input validation (Item 6): shared validators used by both
  // admin and counter endpoints.
  // ============================================================
  const validateNonNegativePrice = (value: any): string | null => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "Price must be a number greater than or equal to 0.";
    return null;
  };
  const validatePositiveInteger = (value: any, max?: number): string | null => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return "Quantity must be a positive integer.";
    if (max !== undefined && n > max) return `Quantity must not exceed ${max}.`;
    return null;
  };
  const validateDiscountPercent = (value: any): string | null => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) return "Discount percentage must be between 0 and 100 inclusive.";
    return null;
  };
  const validateEventDates = (startDate: any, endDate: any): string | null => {
    const startMs = Date.parse(String(startDate || ""));
    if (Number.isNaN(startMs)) return "The event start date is not a valid date.";
    if (endDate) {
      const endMs = Date.parse(String(endDate));
      if (Number.isNaN(endMs)) return "The event end date is not a valid date.";
      if (endMs <= startMs) return "The event end date must be after the start date.";
    }
    return null;
  };

  app.post("/api/events", verifyRole(['admin', 'organizer']), async (req: any, res) => {
    try {
      const event = req.body;
      if (!event || typeof event !== 'object' || !event.title || !event.venue || !event.date || !event.time) {
        return res.status(400).json({ success: false, error: "Event title, venue, date, and time are required." });
      }
      const dateError = validateEventDates(event.date, event.endDate);
      if (dateError) return res.status(400).json({ success: false, error: dateError });
      if (event.minPrice !== undefined) {
        const priceError = validateNonNegativePrice(event.minPrice);
        if (priceError) return res.status(400).json({ success: false, error: priceError });
      }
      if (Array.isArray(event.ticketTiers)) {
        for (const tier of event.ticketTiers) {
          if (tier) {
            const tierPriceError = validateNonNegativePrice(tier.price);
            if (tierPriceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${tierPriceError}` });
            if (tier.capacity !== undefined) {
              const capError = validatePositiveInteger(tier.capacity);
              if (capError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${capError}` });
            }
          }
        }
      }

      const adminToken = await getAdminAuthToken();
      const eventId = typeof event.id === 'string' && /^evt_[A-Za-z0-9_-]+$/.test(event.id)
        ? event.id
        : `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const createdEvent = {
        ...event,
        id: eventId,
        organizerId: req.user.role === 'organizer' ? req.user.uid : (event.organizerId || null),
        createdBy: req.user.uid,
        createdAt: event.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await rtdbSet(`events/${eventId}`, createdEvent, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.created",
        entityType: "event",
        entityId: eventId,
        afterState: createdEvent,
      });
      return res.status(201).json({ success: true, event: createdEvent });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not create event." });
    }
  });

  app.put("/api/events/:eventId", verifyRole(['admin', 'organizer']), async (req: any, res) => {
    try {
      const { eventId } = req.params;
      const adminToken = await getAdminAuthToken();
      if (!(await assertEventMutationAccess(eventId, req, adminToken))) {
        return res.status(403).json({ success: false, error: "You do not own this event." });
      }
      const body = req.body || {};
      const dateError = validateEventDates(body.date, body.endDate);
      if (dateError) return res.status(400).json({ success: false, error: dateError });
      if (body.minPrice !== undefined) {
        const priceError = validateNonNegativePrice(body.minPrice);
        if (priceError) return res.status(400).json({ success: false, error: priceError });
      }
      if (Array.isArray(body.ticketTiers)) {
        for (const tier of body.ticketTiers) {
          if (tier) {
            const tierPriceError = validateNonNegativePrice(tier.price);
            if (tierPriceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${tierPriceError}` });
            if (tier.capacity !== undefined) {
              const capError = validatePositiveInteger(tier.capacity);
              if (capError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${capError}` });
            }
          }
        }
      }

      const existing = (await rtdbGet(`events/${eventId}`, adminToken)).data || {};
      const updatedEvent = {
        ...existing,
        ...body,
        id: eventId,
        organizerId: existing.organizerId || (req.user.role === 'organizer' ? req.user.uid : null),
        updatedAt: new Date().toISOString(),
      };
      await rtdbSet(`events/${eventId}`, updatedEvent, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.updated",
        entityType: "event",
        entityId: eventId,
        beforeState: existing,
        afterState: updatedEvent,
      });
      return res.json({ success: true, event: updatedEvent });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not update event." });
    }
  });

  app.delete("/api/events/:eventId", verifyRole(['admin', 'organizer']), async (req: any, res) => {
    try {
      const { eventId } = req.params;
      const adminToken = await getAdminAuthToken();
      if (!(await assertEventMutationAccess(eventId, req, adminToken))) {
        return res.status(403).json({ success: false, error: "You do not own this event." });
      }
      const existing = (await rtdbGet(`events/${eventId}`, adminToken)).data;
      await rtdbDelete(`events/${eventId}`, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.deleted",
        entityType: "event",
        entityId: eventId,
        beforeState: existing,
      });
      return res.json({ success: true, eventId });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not delete event." });
    }
  });

  app.put("/api/events/:eventId/seats", verifyRole(['admin', 'organizer']), async (req: any, res) => {
    try {
      const { eventId } = req.params;
      const { seatNodes, seatMap, totalCapacity } = req.body || {};
      if (!seatNodes || typeof seatNodes !== 'object' || Array.isArray(seatNodes) || !seatMap) {
        return res.status(400).json({ success: false, error: "A seat-node map and seat-map configuration are required." });
      }
      if (Object.keys(seatNodes).length > 5000) {
        return res.status(413).json({ success: false, error: "Seat map exceeds the supported size." });
      }

      const adminToken = await getAdminAuthToken();
      if (!(await assertEventMutationAccess(eventId, req, adminToken))) {
        return res.status(403).json({ success: false, error: "You do not own this event." });
      }
      const beforeState = (await rtdbGet(`events/${eventId}`, adminToken)).data;
      await rtdbSet(`seats/${eventId}`, seatNodes, adminToken);
      await rtdbUpdate(`events/${eventId}`, {
        seatMap,
        totalCapacity: Number.isFinite(Number(totalCapacity)) ? Number(totalCapacity) : Object.keys(seatNodes).length,
        updatedAt: new Date().toISOString(),
      }, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.seats.updated",
        entityType: "event",
        entityId: eventId,
        beforeState: { seatNodes: beforeState },
        afterState: { seatMap, seatCount: Object.keys(seatNodes).length },
      });
      return res.json({ success: true, eventId, seatCount: Object.keys(seatNodes).length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not deploy seat map." });
    }
  });

  app.post("/api/walk-in-bookings", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { eventId, tierId, attendeeName, attendeePhone, selectedSeats = [], paymentMethod = 'cash' } = req.body || {};
      if (!eventId || !tierId || !attendeeName || !attendeePhone) {
        return res.status(400).json({ success: false, error: "Event, ticket tier, attendee name, and phone are required." });
      }
      if (!Array.isArray(selectedSeats) || selectedSeats.length > 100) {
        return res.status(400).json({ success: false, error: "Invalid seat selection." });
      }
      // Server-side validation (Item 6): quantity is a positive integer (seat
      // count), and the walk-in may never exceed tier capacity or the platform
      // ceiling of 100 walk-in tickets per counter transaction.
      const quantity = selectedSeats.length || 1;
      const quantityError = validatePositiveInteger(quantity, 100);
      if (quantityError) return res.status(400).json({ success: false, error: quantityError });
      if (!String(attendeeName).trim() || !/^[0-9+\s()-]{7,20}$/.test(String(attendeePhone).trim())) {
        return res.status(400).json({ success: false, error: "Attendee name and a valid phone number are required." });
      }

      const adminToken = await getAdminAuthToken();
      const eventSnap = await rtdbGet(`events/${eventId}`, adminToken);
      const event = eventSnap.data as any;
      const tier = normalizeTiers(event?.ticketTiers).find((candidate: any) => candidate.id === tierId);
      if (!event || !tier) {
        return res.status(404).json({ success: false, error: "Event or ticket tier not found." });
      }
      // Server-side validation: the tier price rechecked live from the event
      // record; tier capacity is checked against remaining inventory before
      // the transaction that also deducts inventory (double-checked there).
      const priceError = validateNonNegativePrice(tier.price);
      if (priceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${priceError}` });
      if (tier.capacity !== undefined && quantity > Number(tier.capacity)) {
        return res.status(400).json({ success: false, error: `Quantity exceeds the tier capacity of ${tier.capacity}.` });
      }

      const orderId = `walkin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const customerDetails = {
        name: String(attendeeName).trim(),
        email: `${String(attendeeName).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'guest'}@walkin.ashvish`,
        phone: String(attendeePhone).trim(),
      };
      await rtdbSet(`pending_orders/${orderId}`, {
        orderId,
        eventId,
        tierId,
        seatIds: selectedSeats,
        quantity,
        customerDetails,
        userId: 'walk_in_guest',
        amount: Number(tier.price) * quantity,
        createdAt: new Date().toISOString(),
        paymentMethod: `walkin_${String(paymentMethod).slice(0, 32)}`,
      }, adminToken);

      const result = await finalizeBookingServerSide(
        orderId,
        `walkin_${String(paymentMethod).slice(0, 32)}`,
        `walkin_payment_${orderId}`,
        adminToken,
      );
      if (!result.success) {
        return res.status(409).json({ success: false, error: result.error || "Walk-in booking could not be completed." });
      }
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "order.created.walk_in",
        entityType: "order",
        entityId: orderId,
        afterState: { eventId, tierId, quantity, attendee: customerDetails.name, paymentMethod },
      });
      return res.status(201).json({ success: true, ticket: result.ticket, booking: result.booking });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not create walk-in booking." });
    }
  });

  setInterval(() => {
    sweepExpiredHolds().catch(err => console.error("Error in background sweeper:", err.message));
  }, 30 * 1000);

  // Reviews endpoints
  app.get("/api/events/:eventId/reviews", async (req, res) => {
    try {
      const { eventId } = req.params;
      const snap = await rtdbGet("reviews");
      const allReviews: any[] = snap.data ? Object.values(snap.data) : [];
      const eventReviews = allReviews.filter((r: any) => r.eventId === eventId && r.status === "published");
      const count = eventReviews.length;
      const avgRating = count > 0
        ? Number((eventReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / count).toFixed(1))
        : 5.0;

      return res.json({
        success: true,
        reviews: eventReviews,
        averageRating: avgRating,
        totalReviews: count,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/admin/reviews", verifyRole(['admin']), async (req: any, res) => {
    try {
      const token = req.user?.idToken;
      const snap = await rtdbGet("reviews", token);
      const allReviews: any[] = snap.data ? Object.values(snap.data) : [];
      return res.json({ success: true, reviews: allReviews });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/events/:eventId/reviews", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { userId, userName, userAvatar, rating, comment, isVerifiedBuyer } = req.body;

      if (!rating || !comment) {
        return res.status(400).json({ success: false, error: "Rating and review comment are required." });
      }

      const reviewId = `rev_${Date.now()}`;
      const newReview = {
        id: reviewId,
        eventId,
        userId: userId || `usr_${Date.now()}`,
        userName: userName || "Guest Fan",
        userAvatar: userAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
        rating: Math.min(5, Math.max(1, Number(rating))),
        comment: String(comment).trim(),
        createdAt: new Date().toISOString(),
        status: "published" as const,
        isVerifiedBuyer: isVerifiedBuyer ?? true,
      };

      await rtdbSet(`reviews/${reviewId}`, newReview, await getAdminAuthToken());
      return res.json({ success: true, review: newReview });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/reviews/toggle-visibility", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { reviewId } = req.body;
      const token = req.user?.idToken;
      if (!reviewId) {
        return res.status(400).json({ success: false, error: "Review ID is required." });
      }
      if (!token) {
        return res.status(401).json({ success: false, error: "A valid administrator session is required." });
      }

      const snap = await rtdbGet(`reviews/${reviewId}`, token);
      if (!snap.data) {
        return res.status(404).json({ success: false, error: "Review not found" });
      }

      const review = snap.data;
      review.status = review.status === "published" ? "hidden" : "published";
      await rtdbSet(`reviews/${reviewId}`, review, token);

      return res.json({ success: true, review });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleDeleteReview = async (req: any, res: any) => {
    try {
      const rawReviewId = req.params?.reviewId || req.body?.reviewId || req.query?.reviewId;
      const reviewId = typeof rawReviewId === 'string' ? rawReviewId.trim() : '';
      const token = req.user?.idToken;
      if (!reviewId || !/^rev_[A-Za-z0-9_-]{1,128}$/.test(reviewId)) {
        return res.status(400).json({ success: false, error: "A valid reviewId is required." });
      }
      if (!token) {
        return res.status(401).json({ success: false, error: "A valid administrator session is required." });
      }

      const existing = await rtdbGet(`reviews/${reviewId}`, token);
      if (!existing.data) {
        return res.status(404).json({ success: false, error: "Review not found." });
      }

      await rtdbDelete(`reviews/${reviewId}`, token);
      const verification = await rtdbGet(`reviews/${reviewId}`, token);
      if (verification.data) {
        return res.status(502).json({ success: false, error: "The review could not be removed from the database." });
      }
      return res.json({ success: true, reviewId });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  app.post("/api/admin/reviews/delete", verifyRole(['admin']), handleDeleteReview);
  app.delete("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);
  app.post("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);
  app.patch("/api/admin/reviews/:reviewId", verifyRole(['admin']), handleDeleteReview);

  // Organizers endpoints
  app.get("/api/organizers", verifyRole(['admin']), async (req: any, res) => {
    try {
      const token = await getAdminAuthToken();
      const snap = await rtdbGet("organizers", token);
      const organizersList: any[] = Object.values(snap.data || {});
      return res.json({ success: true, organizers: organizersList });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/organizers/register", async (req, res) => {
    try {
      const { userId, name, email, organizationName, phone, description } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
      const verified = token ? await verifyFirebaseToken(token) : null;

      if (!userId || !organizationName || !email) {
        return res.status(400).json({ success: false, error: "User ID, email, and organization name are required." });
      }

      if (!verified || verified.uid !== userId) {
        return res.status(401).json({ success: false, error: "A valid account token for the organizer is required." });
      }
      const adminToken = await getAdminAuthToken();
      const snap = await rtdbGet("organizers", adminToken);
      const organizersList: any[] = Object.values(snap.data || {});
      const existing = organizersList.find((o: any) => o.userId === userId || o.email === email);
      if (existing) {
        return res.json({ success: true, organizer: existing, message: "Organizer profile already exists." });
      }

      const orgId = `org_${Date.now()}`;
      const newOrg = {
        id: orgId,
        userId,
        name: name || 'Organizer Name',
        email,
        organizationName,
        phone: phone || '',
        description: description || '',
        status: 'pending' as const,
        appliedAt: new Date().toISOString(),
      };

      await rtdbSet(`organizers/${orgId}`, newOrg, adminToken);
      return res.json({ success: true, organizer: newOrg });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleUpdateOrganizerStatus = async (req: any, res: any) => {
    try {
      const organizerId = req.body?.organizerId || req.query?.organizerId || req.body?.id;
      const status = req.body?.status || req.query?.status;
      const token = await getAdminAuthToken();

      if (!organizerId) {
        return res.status(400).json({ success: false, error: "Organizer ID is required." });
      }

      let org: any = null;
      try {
        const snap = await rtdbGet(`organizers/${organizerId}`, token);
        if (snap.data) {
          org = snap.data;
        }
      } catch (e) {
        console.warn(`[ORGANIZER STATUS] RTDB single fetch skipped for ${organizerId}:`, e);
      }

      if (!org) {
        try {
          const orgsSnap = await rtdbGet("organizers", token);
          const list: any[] = Object.values(orgsSnap.data || {});
          const found = list.find((o: any) => o.id === organizerId || o.userId === organizerId);
          if (found) {
            org = { ...found };
          }
        } catch (e) {
          console.warn(`[ORGANIZER STATUS] RTDB list fetch failed for ${organizerId}:`, e);
        }
      }

      if (!org) {
        return res.status(404).json({ success: false, error: "Organizer not found." });
      }

      if (status) {
        org.status = status;
        if (status === 'approved') {
          org.approvedAt = new Date().toISOString();
        }
        try {
          await rtdbSet(`organizers/${org.id || organizerId}`, org, await getAdminAuthToken());
        } catch (setErr: any) {
          console.warn(`[ORGANIZER STATUS] RTDB set warning:`, setErr.message);
        }
      }
      return res.json({ success: true, organizer: org });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  app.get("/api/organizers/status", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { organizerId } = req.query;
      const token = await getAdminAuthToken();
      if (organizerId) {
        const snap = await rtdbGet(`organizers/${organizerId}`, token);
        if (!snap.data) return res.status(404).json({ success: false, error: "Organizer not found" });
        return res.json({ success: true, organizerId, status: snap.data.status, organizer: snap.data });
      }
      const snap = await rtdbGet("organizers", token);
      const organizersList: any[] = Object.values(snap.data || {});
      const statuses = organizersList.map((o: any) => ({ id: o.id, name: o.organizationName, status: o.status }));
      return res.json({ success: true, organizers: statuses });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);
  app.patch("/api/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);
  app.put("/api/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);
  app.post("/api/admin/organizers/status", verifyRole(['admin']), handleUpdateOrganizerStatus);

  // ============================================================
  // Staff account management (Item 4): only super_admin may create or
  // modify staff roles. The staff record is keyed by a Firebase Auth uid
  // (a Firebase user must exist first; the record grants the role).
  // ============================================================
  app.get("/api/staff", requireRole(["super_admin", "auditor"]), async (req: any, res) => {
    try {
      const snap = await rtdbGet("staff", req.user.idToken);
      const staffList = Object.entries(snap.data || {}).map(([uid, data]: [string, any]) => ({ uid, ...data }));
      return res.json({ success: true, staff: staffList });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/staff", requireRole(["super_admin"]), async (req: any, res) => {
    try {
      const { uid, email, role } = req.body || {};
      if (!uid || typeof uid !== "string" || uid.length < 10) {
        return res.status(400).json({ success: false, error: "A valid Firebase Auth uid is required." });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
        return res.status(400).json({ success: false, error: "A valid email is required." });
      }
      const allowedRoles = ["admin", "ticket_counter", "auditor"];
      if (!role || !allowedRoles.includes(String(role))) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${allowedRoles.join(", ")}.` });
      }
      const existing = (await rtdbGet(`staff/${uid}`, req.user.idToken)).data;
      if (existing) {
        return res.status(409).json({ success: false, error: "A staff record for this uid already exists." });
      }
      const record = { id: uid, email: String(email), role: String(role), status: "active", createdBy: req.user.uid, createdAt: new Date().toISOString() };
      await rtdbSet(`staff/${uid}`, record, req.user.idToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "staff.created",
        entityType: "staff",
        entityId: uid,
        afterState: record,
      });
      return res.status(201).json({ success: true, staff: record });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not create staff record." });
    }
  });

  app.patch("/api/staff/:uid", requireRole(["super_admin"]), async (req: any, res) => {
    try {
      const { uid } = req.params;
      const adminToken = req.user.idToken;
      const existing = (await rtdbGet(`staff/${uid}`, adminToken)).data as any;
      if (!existing) {
        return res.status(404).json({ success: false, error: "Staff record not found." });
      }
      const { role, status } = req.body || {};
      if (status !== undefined && !["active", "suspended"].includes(String(status))) {
        return res.status(400).json({ success: false, error: "Status must be 'active' or 'suspended'." });
      }
      const allowedRoles = ["admin", "ticket_counter", "auditor"];
      if (role !== undefined && !allowedRoles.includes(String(role))) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${allowedRoles.join(", ")}.` });
      }
      const updated = {
        ...existing,
        ...(role !== undefined ? { role: String(role) } : {}),
        ...(status !== undefined ? { status: String(status), suspendedAt: status === "suspended" ? new Date().toISOString() : undefined } : {}),
        updatedAt: new Date().toISOString(),
      };
      await rtdbSet(`staff/${uid}`, updated, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "staff.updated",
        entityType: "staff",
        entityId: uid,
        beforeState: existing,
        afterState: updated,
      });
      return res.json({ success: true, staff: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not update staff record." });
    }
  });

  // Read-only audit log endpoint (Item 5). Auditors may read the full log;
  // no write path exists here — writes only occur inside writeAuditEntry.
  app.get("/api/audit-log", requireRole(["super_admin", "event_manager", "auditor"]), async (req: any, res) => {
    try {
      const token = req.user.idToken;
      const snap = await rtdbGet("audit_log", token);
      const entries: any[] = snap.data ? Object.values(snap.data) : [];
      entries.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const actorId = typeof req.query.actor_id === "string" ? req.query.actor_id : undefined;
      const filtered = actorId ? entries.filter((e: any) => e.actor_id === actorId) : entries;
      return res.json({ success: true, audit_log: filtered.slice(0, limit), count: filtered.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });


  // Ticket Token Generation & Verification
  app.post("/api/tickets/generate-token", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const { bookingId, eventId, seatId, ticketId } = req.body;
      const issuedAt = new Date().toISOString();
      const payloadString = `${bookingId || 'bkg_demo'}|${eventId || 'evt_001'}|${seatId || 'S1'}|${ticketId || 'tkt_demo'}|${issuedAt}`;
      
      const signature = crypto
        .createHmac("sha256", SERVER_HMAC_SECRET)
        .update(payloadString)
        .digest("hex");

      const signedToken = `ASH_PASS.${Buffer.from(payloadString).toString("base64url")}.${signature.substring(0, 16)}`;

      return res.json({
        success: true,
        signedToken,
        issuedAt,
        signature: signature.substring(0, 16),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/tickets/verify-and-redeem", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { signedToken, scannedByStaffId } = req.body;
      const userToken = await getAdminAuthToken();

      if (!signedToken || typeof signedToken !== "string") {
        return res.status(400).json({ success: false, valid: false, error: "Invalid token payload format" });
      }

      const parts = signedToken.split(".");
      if (parts.length < 3 || (parts[0] !== "ASH_PASS" && parts[0] !== "ASH_PASS_v1")) {
        return res.status(400).json({ success: false, valid: false, error: "Unrecognized ticket signature header" });
      }

      const payloadStr = Buffer.from(parts[1], "base64url").toString("utf8");
      const providedSig = parts[2];

      const expectedSig = crypto
        .createHmac("sha256", SERVER_HMAC_SECRET)
        .update(payloadStr)
        .digest("hex")
        .substring(0, 16);

      if (providedSig !== expectedSig) {
        return res.status(400).json({
          success: false,
          valid: false,
          error: "AUTHENTICATION FAILURE: HMAC-SHA256 Token Signature Invalid or Tampered!"
        });
      }

      let ticketId: string | null = null;
      let orderId: string | null = null;

      if (parts[0] === "ASH_PASS") {
        const payloadParts = payloadStr.split("|");
        if (payloadParts.length >= 4) {
          ticketId = payloadParts[3];
        }
      } else if (parts[0] === "ASH_PASS_v1") {
        const payloadParts = payloadStr.split(":");
        if (payloadParts.length >= 1) {
          orderId = payloadParts[0];
        }
      }

      if (orderId && !ticketId) {
        const snap = await rtdbGet(`processed_orders/${orderId}`, userToken);
        if (snap.data) {
          ticketId = snap.data.ticketId;
        }
      }

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          valid: false,
          error: "Could not resolve a valid ticket ID from the token payload."
        });
      }

      let alreadyRedeemedError: string | null = null;
      let redeemedTicket: any = null;

      const txResult = await rtdbTransaction(`tickets/${ticketId}`, (ticket: any) => {
        if (!ticket) {
          return undefined;
        }

        if (ticket.status === "redeemed") {
          alreadyRedeemedError = `This ticket was already scanned/redeemed at ${ticket.redeemedAt || "an earlier time"} by staff '${ticket.redeemedBy || "unknown"}'!`;
          return undefined;
        }

        ticket.status = "redeemed";
        ticket.redeemedAt = new Date().toISOString();
        ticket.redeemedBy = scannedByStaffId || req.user?.uid || "counter_scanner_01";
        redeemedTicket = ticket;
        return ticket;
      }, userToken);

      if (!txResult.committed) {
        if (alreadyRedeemedError) {
          return res.status(400).json({
            success: false,
            valid: false,
            error: alreadyRedeemedError
          });
        }
        return res.status(404).json({
          success: false,
          valid: false,
          error: `Ticket ${ticketId} not found in the live database. Redemption failed.`
        });
      }

      if (redeemedTicket && redeemedTicket.ownerId) {
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/status`, "redeemed", userToken);
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/redeemedAt`, redeemedTicket.redeemedAt, userToken);
        await rtdbSet(`users/${redeemedTicket.ownerId}/tickets/${ticketId}/redeemedBy`, redeemedTicket.redeemedBy, userToken);
      }

      return res.json({
        success: true,
        valid: true,
        redeemedAt: redeemedTicket.redeemedAt,
        scannedBy: redeemedTicket.redeemedBy,
        ticket: redeemedTicket,
        payloadStr,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/tickets/send-email", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const { attendeeEmail } = req.body;
      return res.json({
        success: true,
        sentTo: attendeeEmail || "customer@example.com",
        sentAt: new Date().toISOString(),
        status: "DELIVERED",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    // Lazy import: the `vite` package must NOT be resolved in the Vercel
    // serverless module graph (it fails under @vercel/node and crashes the
    // function with FUNCTION_INVOCATION_FAILED on every route).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app;
}

// Run as a standalone server only when executed directly (NOT inside Vercel,
// which sets VERCEL=1 and hosts the app through serverless functions).
const __isDirectlyRun = (() => {
  if (process.env.VERCEL) return false;
  const argv1 = process.argv[1];
  if (typeof argv1 === "string") {
    const isScriptEntry =
      argv1.endsWith("server.ts") || argv1.endsWith("server.js") || argv1.includes("server.cjs");
    // ESM entry detection: running file matches the current module
    try {
      const { pathToFileURL } = require("url");
      if (pathToFileURL(argv1).href === import.meta.url) return true;
    } catch {
      /* url resolution failed — fall through */
    }
    // CJS context: require.main check
    if (typeof require !== "undefined" && require.main === module) return true;
    // tsx ESM entry: require.main is undefined but the argv path is this script
    if (isScriptEntry && (typeof require === "undefined" || require.main === undefined)) return true;
  }
  return false;
})();

async function startServer() {
  const PORT = 3000;
  const app = await createApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
if (__isDirectlyRun) {
  startServer();
}
