import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { verifyFirebaseIdToken, TokenVerificationError } from "./src/lib/verify-token.js";
import { rtdbGet, rtdbSet, rtdbUpdate, rtdbDelete, rtdbTransaction } from "./src/lib/rtdb.js";
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

// Event Price Catalog for Server-Side Price Verification
const EVENT_PRICES_CATALOG: Record<string, Record<string, number>> = {
  evt_001: { tier_vip: 2499, tier_gold: 1499, tier_silver: 799 },
  evt_002: { tier_vvip: 3999, tier_vip: 1999, tier_gen: 999 },
  evt_003: { tier_front: 1299, tier_balcony: 699 },
  evt_004: { tier_arena: 1899, tier_stand: 999 },
  evt_005: { tier_pass: 1599 },
};

// Server-Managed Coupons Database Fallback
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
}> = {
  "WELCOME20": {
    id: "c_001",
    code: "WELCOME20",
    type: "percentage",
    value: 20,
    validUntil: "2028-12-31",
    usageLimit: 100,
    usedCount: 14,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "FLAT500": {
    id: "c_002",
    code: "FLAT500",
    type: "fixed",
    value: 500,
    validUntil: "2028-12-31",
    usageLimit: 50,
    usedCount: 8,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "EARLYBIRD15": {
    id: "c_003",
    code: "EARLYBIRD15",
    type: "percentage",
    value: 15,
    validUntil: "2028-12-31",
    eventId: "evt_001",
    usageLimit: 30,
    usedCount: 5,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  "EXPIRED10": {
    id: "c_004",
    code: "EXPIRED10",
    type: "percentage",
    value: 10,
    validUntil: "2025-01-01",
    usageLimit: 10,
    usedCount: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
  }
};

// Server-Managed Reviews Database
let REVIEWS_DATABASE: Array<{
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: 'published' | 'hidden';
  isVerifiedBuyer?: boolean;
}> = [
  {
    id: "rev_101",
    eventId: "evt_001",
    userId: "usr_mock_1",
    userName: "Ananya Sharma",
    userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    comment: "An incredible concert! Sound clarity and stage visual lighting were world-class.",
    createdAt: "2026-07-20T14:32:00Z",
    status: "published",
    isVerifiedBuyer: true,
  },
  {
    id: "rev_102",
    eventId: "evt_001",
    userId: "usr_mock_2",
    userName: "Rahul Verma",
    userAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    comment: "Best live performance in Mumbai this year! Gate scanning took less than 10 seconds.",
    createdAt: "2026-07-21T09:15:00Z",
    status: "published",
    isVerifiedBuyer: true,
  },
  {
    id: "rev_103",
    eventId: "evt_002",
    userId: "usr_mock_3",
    userName: "Priya Nair",
    userAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    rating: 4,
    comment: "Hilarious comedy special! Non-stop laughs from start to finish.",
    createdAt: "2026-07-28T18:40:00Z",
    status: "published",
    isVerifiedBuyer: true,
  }
];

// Server-Managed Organizers Database
let ORGANIZERS_DATABASE: Array<{
  id: string;
  userId: string;
  name: string;
  email: string;
  organizationName: string;
  phone: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  approvedAt?: string;
}> = [
  {
    id: 'org_apex',
    userId: 'usr_org_apex',
    name: 'Rohan Mehta',
    email: 'rohan@apexlive.com',
    organizationName: 'Apex Live Concerts',
    phone: '+91 98765 11111',
    description: 'Premier stadium concerts, music festivals, and international artist tours.',
    status: 'approved',
    appliedAt: '2026-06-01T10:00:00Z',
    approvedAt: '2026-06-02T14:30:00Z',
  },
  {
    id: 'org_starlight',
    userId: 'usr_org_starlight',
    name: 'Kavita Sen',
    email: 'kavita@starlightlive.com',
    organizationName: 'Starlight Live',
    phone: '+91 98765 22222',
    description: 'Standup comedy specials, theatrical plays, and intimate acoustic sessions.',
    status: 'approved',
    appliedAt: '2026-06-15T11:20:00Z',
    approvedAt: '2026-06-16T09:00:00Z',
  },
  {
    id: 'org_pending',
    userId: 'usr_org_pending',
    name: 'Aman Sharma',
    email: 'aman@pioneerfest.com',
    organizationName: 'Pioneer Fest LLC',
    phone: '+91 98765 33333',
    description: 'Indie music festivals and regional cultural showcases.',
    status: 'pending',
    appliedAt: '2026-08-01T16:45:00Z',
  },
];

// ============================================================
// PRODUCTION RESERVATION SERVICE
// Server-authoritative seat holds with atomic all-or-nothing claims,
// explicit expiration, owner identity, and idempotency keys.
// ============================================================
const RESERVATION_HOLD_TTL_MS = 5 * 60 * 1000; // 5 minutes; single server-controlled TTL
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
  showtimeId: string;
  tierId: string;
  quantity: number;
  seatIds: string[]; // normalized, sorted
  ownerId: string;
  idempotencyKeyHash: string;
  status: "active" | "confirmed" | "expired" | "released" | "cancelled";
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
  quote: ReservationQuote;
  seatMapVersion: number;
  attendee?: { name: string; email: string; phone: string };
  orderId?: string;
  extensions?: number;
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
      const expiresAt = seat?.holdExpiresAt || (seat?.heldAt ? seat.heldAt + RESERVATION_HOLD_TTL_MS : 0);
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
        rtdbTransaction(`seats/${eventId}/${rolledId}`, (seat: any) => {
          if (seat && seat.status === "held" && seat.reservationId === reservationId) {
            return {
              ...seat,
              status: "available",
              heldBy: null,
              reservationId: null,
              heldAt: null,
              holdExpiresAt: null,
            };
          }
          return seat;
        }, authToken).catch(() => {});
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
    // Production hardening: sanity-check the stored order amount before fulfillment.
    // DB event tier price is the source of truth; the hardcoded catalog is only a demo fallback.
    let serverCalculatedRecheck = 0;
    let dbRecheckPrice = 0;
    try {
      const evtForRecheck = (await rtdbGet(`events/${eventId}`, authToken))?.data as any;
      const dbTier = normalizeTiers(evtForRecheck?.ticketTiers).find((t: any) => t.id === tierId);
      if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
        dbRecheckPrice = dbTier.price;
      }
    } catch {
      // fall back to the hardcoded catalog price
    }
    if (dbRecheckPrice > 0) {
      serverCalculatedRecheck = dbRecheckPrice * (quantity || 1);
    } else if (EVENT_PRICES_CATALOG[eventId] && EVENT_PRICES_CATALOG[eventId][tierId]) {
      serverCalculatedRecheck = EVENT_PRICES_CATALOG[eventId][tierId] * (quantity || 1);
    }
    if (amount && serverCalculatedRecheck > 0 && amount > serverCalculatedRecheck * 1.5) {
      return { success: false, error: "Order amount anomaly detected. Fulfillment aborted." };
    }
    if (!amount || amount <= 0) {
      return { success: false, error: "Invalid order amount. Fulfillment aborted." };
    }

    // 3. Seat reservation check
    if (seatIds && seatIds.length > 0) {
      const holdExpiryMs = 5 * 60 * 1000;
      let seatClaimError: string | null = null;

      for (const seatId of seatIds) {
        const path = `seats/${eventId}/${seatId}`;
        const txResult = await rtdbTransaction(path, (currentSeat: any) => {
          if (!currentSeat) {
            return {
              id: seatId,
              seatId,
              row: parseInt(seatId.split('-')[0].replace('R', ''), 10) || 1,
              col: parseInt(seatId.split('-')[1].replace('C', ''), 10) || 1,
              status: 'booked',
              bookedBy: userId,
              orderId,
            };
          }

          const expiresAt = currentSeat.holdExpiresAt || (currentSeat.heldAt ? currentSeat.heldAt + holdExpiryMs : 0);
          const isHoldExpired = expiresAt > 0 && now > expiresAt;
          // Legacy holds use heldBy === userId (anon_user or uid); new reservation holds use
          // heldBy === ownerId (guest hash or uid) together with reservationId, so accept
          // both and allow anyone with a non-expired confirmed-path reservation to claim
          // if the reservation itself is active/confirmed for the same seats.
          const isOwnedByUser =
            currentSeat.heldBy === userId ||
            currentSeat.ownerId === userId ||
            (currentSeat.reservationId && currentSeat.reservationId === pendingOrder?.reservationId);
          const isEligible =
            currentSeat.status === 'available' ||
            (currentSeat.status === 'held' && (isOwnedByUser || isHoldExpired));

          if (isEligible) {
            return {
              ...currentSeat,
              status: 'booked',
              bookedBy: userId,
              bookedAt: now,
              orderId,
            };
          }
          return undefined; // abort
        }, authToken);

        if (txResult.committed) {
          claimedSeats.push(seatId);
        } else {
          seatClaimError = `Seat ${seatId.replace('R', 'Row ').replace('C', ' Col ')} is no longer available.`;
          break;
        }
      }

      if (seatClaimError) {
        for (const rolledSeatId of claimedSeats) {
          await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
            if (currentSeat && currentSeat.orderId === orderId) {
              return {
                ...currentSeat,
                status: 'held',
                heldBy: userId,
                heldAt: now,
                orderId: null,
                bookedBy: null,
                bookedAt: null,
              };
            }
            return currentSeat;
          }, authToken);
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
        for (const rolledSeatId of claimedSeats) {
          await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
            if (currentSeat && currentSeat.orderId === orderId) {
              return {
                ...currentSeat,
                status: 'held',
                heldBy: userId,
                heldAt: now,
                orderId: null,
                bookedBy: null,
                bookedAt: null,
              };
            }
            return currentSeat;
          }, authToken);
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
      for (const rolledSeatId of claimedSeats) {
        await rtdbTransaction(`seats/${eventId}/${rolledSeatId}`, (currentSeat: any) => {
          if (currentSeat && currentSeat.orderId === orderId) {
            return {
              ...currentSeat,
              status: 'held',
              heldBy: userId,
              heldAt: now,
              orderId: null,
              bookedBy: null,
              bookedAt: null,
            };
          }
          return currentSeat;
        }, authToken);
      }
      return { success: false, error: inventoryError || "Failed to deduct ticket inventory atomically." };
    }
    inventoryDeducted = true;
    // 5.5 Confirm the attached reservation (locks the hold to this paid booking)
    if (pendingOrder?.reservationId) {
      try {
        await rtdbTransaction(`reservations/${pendingOrder.reservationId}`, (curr: any) => {
          if (curr && curr.status === "active") {
            return { ...curr, status: "confirmed", orderId, confirmedAt: Date.now() };
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

    if (seatIds && seatIds.length > 0) {
      for (const seatId of seatIds) {
        await rtdbTransaction(`seats/${eventId}/${seatId}`, (seat: any) => {
          if (seat) {
            return {
              ...seat,
              status: 'booked',
              bookedBy: userId,
              ticketId,
              bookingId,
              orderId,
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
    const holdExpiryMs = 5 * 60 * 1000;

    for (const [eventId, eventSeats] of Object.entries(allEventsSeats)) {
      if (!eventSeats || typeof eventSeats !== "object") continue;

      for (const [seatId, seatData] of Object.entries(eventSeats as Record<string, any>)) {
        if (!seatData) continue;
        if (seatData.status === "held") {
          const expiresAt = seatData.holdExpiresAt || (seatData.heldAt ? seatData.heldAt + holdExpiryMs : 0);
          if (expiresAt > 0 && now > expiresAt) {
            await rtdbTransaction(`seats/${eventId}/${seatId}`, (seat: any) => {
              if (seat && seat.status === "held") {
                const innerExpiresAt = seat.holdExpiresAt || (seat.heldAt ? seat.heldAt + holdExpiryMs : 0);
                if (now > innerExpiresAt) {
                  return {
                    ...seat,
                    status: "available",
                    heldBy: null,
                    heldAt: null,
                    holdExpiresAt: null,
                    orderId: null,
                  };
                }
              }
              return seat;
            }, authToken);
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

  // Seed initial coupons, reviews, and organizers into Realtime Database if not present
  try {
    const authToken = await getAdminAuthToken();
    const couponsSnap = await rtdbGet("coupons", authToken);
    if (!couponsSnap.data) {
      await rtdbSet("coupons", COUPONS_DATABASE, authToken);
    }
    const reviewsSnap = await rtdbGet("reviews", authToken);
    if (!reviewsSnap.data) {
      const initialReviewsObj = REVIEWS_DATABASE.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
      await rtdbSet("reviews", initialReviewsObj, authToken);
    }
    const organizersSnap = await rtdbGet("organizers", authToken);
    if (!organizersSnap.data) {
      const initialOrgsObj = ORGANIZERS_DATABASE.reduce((acc, o) => ({ ...acc, [o.id]: o }), {});
      await rtdbSet("organizers", initialOrgsObj, authToken);
    }
  } catch (seedErr: any) {
    console.error("[SEED ERROR] Failed to seed initial RTDB data:", seedErr.message || seedErr);
  }

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
              const orgsList: any[] = orgsSnap.data ? Object.values(orgsSnap.data) : ORGANIZERS_DATABASE;
              const org = orgsList.find((o: any) => o.userId === verified.uid);
              if (!org || org.status !== 'approved') {
                return res.status(403).json({ success: false, error: "Access Denied: Organizer profile is not approved." });
              }
            }

            if (allowedRoles.includes(serverRole)) {
              (req as any).user = { uid: verified.uid, email: verified.email, role: serverRole, idToken: token };
              return next();
            }
            return res.status(403).json({ success: false, error: `Access Denied: Role '${serverRole}' insufficient.` });
          }
        }

        if (process.env.NODE_ENV !== 'production' && roleHeader && allowedRoles.includes(roleHeader)) {
          (req as any).user = { uid: 'demo_admin', email: 'admin@demo.com', role: roleHeader, idToken: undefined };
          return next();
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

      coupon.isActive = !coupon.isActive;
      await saveCouponToDB(upper, coupon, req.user?.idToken);
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
      await saveCouponToDB(code, null, req.user?.idToken);
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
  ): Promise<{ ownerId: string; authenticated: boolean; uid?: string; role?: string }> {
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
        return { ownerId: verified.uid, authenticated: true, uid: verified.uid, role };
      }
    }
    // Guest session identity: based on the stable X-Session-Id header. The old
    // composite scheme (IP|UA|sessionId) was flaky behind Vercel's edge proxy
    // because req.ip varies between requests — it is kept as a legacy candidate
    // so reservations created under the old scheme still resolve during use.
    const headerSession = (req.headers["x-session-id"] as string)?.slice(0, 64) || "";
    const sessionIdGuest = headerSession
      ? "guest_" + crypto.createHash("sha256").update(headerSession).digest("hex").slice(0, 16)
      : "";
    const raw = `${req.ip || req.socket?.remoteAddress || "unknown"}|${req.headers["user-agent"] || "unknown"}|${headerSession}`;
    const legacyCompositeGuest = "guest_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return { ownerId: sessionIdGuest || legacyCompositeGuest, authenticated: false };
  }

  app.post("/api/reservations", async (req, res) => {
    try {
      const { eventId, showtimeId, tierId, quantity, seatIds, idempotencyKey } = req.body || {};

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

      const showtimeIdClean = showtimeId || "main";
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
        showtimeId: showtimeIdClean,
        tierId,
        quantity,
        seatIds: normalizedSeats,
        ownerId: owner.ownerId,
        idempotencyKeyHash: idHash,
        status: "active",
        createdAt: now,
        expiresAt: now + RESERVATION_HOLD_TTL_MS,
        updatedAt: now,
        quote: quoteResult.quote,
        seatMapVersion: quoteResult.seatMapVersion,
      };

      await rtdbSet(`reservations/${reservationId}`, record, authToken);
      await rtdbSet(`reservation_owners/${reservationId}`, { ownerId: owner.ownerId, reservationId }, authToken);
      await rtdbSet(`reservation_events/${eventId}/${reservationId}`, { reservationId, status: "active" }, authToken);

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
        quote: record.quote,
        seatMapVersion: record.seatMapVersion,
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
      if (record.ownerId !== owner.ownerId) {
        return res.status(403).json({ success: false, error: "This reservation does not belong to you." });
      }
      const now = Date.now();
      if (record.status === "active" && now > record.expiresAt) {
        record.status = "expired";
        record.updatedAt = now;
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired", updatedAt: now }, authToken);
        await rtdbUpdate(`reservation_events/${record.eventId}/${record.reservationId}`, { status: "expired" }, authToken);
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
      if (record.ownerId !== owner.ownerId) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status} and cannot be renewed.` });
      const now = Date.now();
      if (now > record.expiresAt) {
        record.status = "expired";
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired", updatedAt: now }, authToken);
        return res.status(409).json({ success: false, error: "Reservation has expired. Please reselect your seats." });
      }
      const newExpiresAt = Math.max(now + RESERVATION_HOLD_TTL_MS, record.expiresAt + RESERVATION_HOLD_TTL_MS);
      const extensions = (record.extensions || 0) + 1;
      if (extensions > 3) {
        return res.status(409).json({ success: false, error: "Maximum reservation extensions reached. Please complete payment." });
      }
      const update: any = { expiresAt: newExpiresAt, updatedAt: now, extensions };
      if (record.seatIds.length > 0) {
        for (const seatId of record.seatIds) {
          rtdbUpdate(`seats/${record.eventId}/${seatId}`, { holdExpiresAt: newExpiresAt, heldBy: owner.ownerId, status: "held", heldAt: now }, authToken).catch(() => {});
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
      if (record.ownerId !== owner.ownerId) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.json({ success: true, message: `Reservation already ${record.status}.` });
      const now = Date.now();
      record.status = "released";
      record.updatedAt = now;
      await rtdbUpdate(`reservations/${record.reservationId}`, { status: "released", updatedAt: now }, authToken);
      await rtdbUpdate(`reservation_events/${record.eventId}/${record.reservationId}`, { status: "released" }, authToken);
      if (record.seatIds.length > 0) {
        for (const seatId of record.seatIds) {
          rtdbTransaction(`seats/${record.eventId}/${seatId}`, (seat: any) => {
            if (seat && seat.status === "held" && seat.heldBy === owner.ownerId && seat.reservationId === record.reservationId) {
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
      if (record.ownerId !== owner.ownerId) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status} and cannot be adjusted.` });
      const now = Date.now();
      if (now > record.expiresAt) {
        record.status = "expired";
        await rtdbUpdate(`reservations/${record.reservationId}`, { status: "expired", updatedAt: now }, authToken);
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
        const claim = await claimSeatsAtomically(authToken, record.eventId, toClaim, record.reservationId, owner.ownerId);
        if (!claim.committed) {
          return res.status(409).json({ success: false, error: claim.error || "One or more seats were just taken. Please try again." });
        }
      }
      // Release seats no longer in the selection
      const toRelease = record.seatIds.filter((s) => !seatIds.includes(s));
      if (toRelease.length > 0) {
        for (const seatId of toRelease) {
          rtdbTransaction(`seats/${record.eventId}/${seatId}`, (seat: any) => {
            if (seat && seat.status === "held" && seat.heldBy === owner.ownerId && seat.reservationId === record.reservationId) {
              return { ...seat, status: "available", heldBy: null, reservationId: null, heldAt: null, holdExpiresAt: null };
            }
            return seat;
          }, authToken).catch(() => {});
        }
      }
      // Refresh expiry
      const newExpiresAt = Math.max(now + RESERVATION_HOLD_TTL_MS, record.expiresAt);
      const update: any = { seatIds, quantity, expiresAt: newExpiresAt, updatedAt: now, quote: quoteResult.quote, seatMapVersion: quoteResult.seatMapVersion };
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
        quote: quoteResult.quote,
        seatMapVersion: quoteResult.seatMapVersion,
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
      if (record.ownerId !== owner.ownerId) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status}.` });
      const attendee = {
        name: String(name).slice(0, 100),
        email: String(email).slice(0, 150),
        phone: String(phone).slice(0, 20),
      };
      await rtdbUpdate(`reservations/${record.reservationId}`, { attendee, updatedAt: Date.now() }, authToken);
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
      if (record.ownerId !== owner.ownerId) return res.status(403).json({ success: false, error: "Not your reservation." });
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
      if (record.ownerId !== owner.ownerId) {
        return res.status(403).json({ success: false, error: "Not your reservation." });
      }
      const now = Date.now();
      if (record.status !== "active" || now > record.expiresAt) {
        return res.status(409).json({ success: false, error: "Reservation is no longer active. Please select your seats again." });
      }

      // Idempotency: an already-booked reservation must not be purchased twice.
      if (record.orderId) {
        return res.status(409).json({ success: false, error: "This reservation has already been booked." });
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
      if (record.ownerId !== owner.ownerId) {
        return res.status(403).json({ success: false, error: "Not your reservation." });
      }
      const now = Date.now();
      if (record.status !== "active" || now > record.expiresAt) {
        return res.status(409).json({ success: false, error: "Reservation is no longer active. Please select your seats again." });
      }
      if (record.orderId) {
        return res.status(409).json({ success: false, error: "This reservation has already been booked." });
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

      // Extend the reservation hold so the buyer has time to complete payment.
      await rtdbUpdate(`reservations/${reservationId}`, {
        expiresAt: Math.max(record.expiresAt, now + RESERVATION_HOLD_TTL_MS),
        orderId,
        quote: quoteResult.quote,
      }, authToken);

      return res.json({
        success: true,
        orderId,
        rzpOrderId: rzp.id,
        rzpKey: razorpayKeyId,
        amountMinor: totalMinor,
        appliedCoupon,
        isTestMode: isTestMode(),
        holdUntil: now + RESERVATION_HOLD_TTL_MS,
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

  app.post("/api/seats/sweep-holds", async (req, res) => {
    try {
      await sweepExpiredHolds();
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

  app.post("/api/events", verifyRole(['admin', 'organizer']), async (req: any, res) => {
    try {
      const event = req.body;
      if (!event || typeof event !== 'object' || !event.title || !event.venue || !event.date || !event.time) {
        return res.status(400).json({ success: false, error: "Event title, venue, date, and time are required." });
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

      const existing = (await rtdbGet(`events/${eventId}`, adminToken)).data || {};
      const updatedEvent = {
        ...existing,
        ...(req.body || {}),
        id: eventId,
        organizerId: existing.organizerId || (req.user.role === 'organizer' ? req.user.uid : null),
        updatedAt: new Date().toISOString(),
      };
      await rtdbSet(`events/${eventId}`, updatedEvent, adminToken);
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
      await rtdbDelete(`events/${eventId}`, adminToken);
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
      await rtdbSet(`seats/${eventId}`, seatNodes, adminToken);
      await rtdbUpdate(`events/${eventId}`, {
        seatMap,
        totalCapacity: Number.isFinite(Number(totalCapacity)) ? Number(totalCapacity) : Object.keys(seatNodes).length,
        updatedAt: new Date().toISOString(),
      }, adminToken);
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

      const adminToken = await getAdminAuthToken();
      const eventSnap = await rtdbGet(`events/${eventId}`, adminToken);
      const event = eventSnap.data as any;
      const tier = normalizeTiers(event?.ticketTiers).find((candidate: any) => candidate.id === tierId);
      if (!event || !tier) {
        return res.status(404).json({ success: false, error: "Event or ticket tier not found." });
      }

      const quantity = selectedSeats.length || 1;
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
      const allReviews: any[] = snap.data ? Object.values(snap.data) : REVIEWS_DATABASE;
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
      const allReviews: any[] = snap.data ? Object.values(snap.data) : REVIEWS_DATABASE;
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
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
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
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
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
          const list: any[] = orgsSnap.data ? Object.values(orgsSnap.data) : ORGANIZERS_DATABASE;
          const found = list.find((o: any) => o.id === organizerId || o.userId === organizerId);
          if (found) {
            org = { ...found };
          }
        } catch (e) {
          const found = ORGANIZERS_DATABASE.find((o: any) => o.id === organizerId || o.userId === organizerId);
          if (found) org = { ...found };
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

        const memIdx = ORGANIZERS_DATABASE.findIndex((o: any) => o.id === (org.id || organizerId) || o.userId === organizerId);
        if (memIdx !== -1) {
          ORGANIZERS_DATABASE[memIdx] = { ...ORGANIZERS_DATABASE[memIdx], status, ...(status === 'approved' ? { approvedAt: org.approvedAt } : {}) };
        } else {
          ORGANIZERS_DATABASE.push(org);
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
      const organizersList: any[] = snap.data ? Object.values(snap.data) : ORGANIZERS_DATABASE;
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


  // Ticket Token Generation & Verification
  app.post("/api/tickets/generate-token", async (req, res) => {
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

  app.post("/api/tickets/send-email", async (req, res) => {
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
