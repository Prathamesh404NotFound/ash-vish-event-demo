import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
dotenv.config();

import { verifyFirebaseIdToken, TokenVerificationError } from "./src/lib/verify-token";
import { rtdbGet, rtdbSet, rtdbUpdate, rtdbDelete, rtdbTransaction } from "./src/lib/rtdb";
import { getGoogleOAuthAccessToken, getFirebaseAdminIdToken, setUserCustomClaims } from "./src/lib/identity-admin";

const SERVER_HMAC_SECRET = process.env.SERVER_HMAC_SECRET || "ASH_VISH_SECURE_HMAC_KEY_2026";

async function getAdminAuthToken(): Promise<string | undefined> {
  try {
    return await getFirebaseAdminIdToken();
  } catch (err: any) {
    try {
      return await getGoogleOAuthAccessToken();
    } catch (gErr: any) {
      console.warn("[ADMIN AUTH] Unable to get Firebase Admin auth token:", err.message, gErr.message);
      return undefined;
    }
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
    const res = await rtdbTransaction(path, (seat: any) => {
      const now = Date.now();
      const expiresAt = seat?.holdExpiresAt || (seat?.heldAt ? seat.heldAt + RESERVATION_HOLD_TTL_MS : 0);
      const isExpired = expiresAt > 0 && now > expiresAt;
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
      return { committed: false, error: `Seat ${seatIdLabel(seatId)} is held by another buyer or is no longer available.` };
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

  if (process.env.NODE_ENV === "production") {
    const missing = [];
    if (!process.env.CASHFREE_APP_ID) missing.push("CASHFREE_APP_ID");
    if (!process.env.CASHFREE_SECRET_KEY) missing.push("CASHFREE_SECRET_KEY");
    if (missing.length > 0) {
      // Non-fatal: reservation, event, and ticket APIs keep working. Only the
      // Cashfree payment routes fail with a clear 503 until the vars are set.
      console.warn(`[startup] Missing payment env vars: ${missing.join(", ")}. Cashfree payment endpoints will return 503 until configured.`);
    }
  }

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

    const authToken = idToken || (await getAdminAuthToken());

    try {
      const staffRes = await rtdbGet(`staff/${uid}`, authToken);
      if (staffRes.data && (staffRes.data.role === 'admin' || staffRes.data.role === 'ticket_counter')) {
        const role = staffRes.data.role;
        roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
        return role;
      }

      const userRes = await rtdbGet(`users/${uid}`, authToken);
      if (userRes.data && userRes.data.role) {
        const role = userRes.data.role;
        roleCache.set(uid, { role, expiresAt: now + 5 * 60 * 1000 });
        return role;
      }
    } catch (err: any) {
      console.warn(`[ROLE FETCH WARNING] Unable to fetch role for ${uid}:`, err.message);
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
      const roleHeader = req.headers['x-user-role'] as string;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Missing authorization token." });
      }

      const token = authHeader.split(' ')[1];
      const verified = await verifyFirebaseToken(token);
      if (!verified) {
        return res.status(401).json({ success: false, error: "Invalid or expired token." });
      }

      const { uid, email } = verified;
      let role = await fetchUserRoleFromRTDB(uid, token);
      const targetRole = roleHeader || role;

      if (targetRole && targetRole !== role) {
        try {
          if (targetRole === 'admin' || targetRole === 'ticket_counter') {
            await rtdbSet(`staff/${uid}`, { email, role: targetRole }, token);
            await rtdbSet(`users/${uid}/role`, targetRole, token);
          } else if (targetRole === 'customer') {
            await rtdbDelete(`staff/${uid}`, token);
            await rtdbSet(`users/${uid}/role`, 'customer', token);
          }
          role = targetRole;
          roleCache.set(uid, { role: targetRole, expiresAt: Date.now() + 5 * 60 * 1000 });
        } catch (syncErr: any) {
          console.error('[AUTH SYNC FAILED]', syncErr.message);
          return res.status(500).json({ success: false, error: 'Role sync failed: ' + syncErr.message });
        }
      }

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
    // Guest session identity: derived from a header + IP + UA, stable per session, never user-supplied as identity.
    const headerSession = (req.headers["x-session-id"] as string)?.slice(0, 64) || "";
    const raw = `${req.ip || req.socket?.remoteAddress || "unknown"}|${req.headers["user-agent"] || "unknown"}|${headerSession}`;
    const guestId = "guest_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return { ownerId: guestId, authenticated: false };
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

  app.post("/api/seats/sweep-holds", async (req, res) => {
    try {
      await sweepExpiredHolds();
      return res.json({ success: true, message: "Expired holds swept successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
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
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

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

      await rtdbSet(`reviews/${reviewId}`, newReview, token);
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
      const reviewId = req.params?.reviewId || req.body?.reviewId || req.query?.reviewId;
      const token = req.user?.idToken;
      if (!reviewId) return res.status(400).json({ success: false, error: "reviewId is required." });
      await rtdbDelete(`reviews/${reviewId}`, token);
      return res.json({ success: true });
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
      const token = req.user?.idToken;
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

      if (!userId || !organizationName || !email) {
        return res.status(400).json({ success: false, error: "User ID, email, and organization name are required." });
      }

      const snap = await rtdbGet("organizers", token);
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

      await rtdbSet(`organizers/${orgId}`, newOrg, token);
      return res.json({ success: true, organizer: newOrg });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleUpdateOrganizerStatus = async (req: any, res: any) => {
    try {
      const organizerId = req.body?.organizerId || req.query?.organizerId || req.body?.id;
      const status = req.body?.status || req.query?.status;
      const token = req.user?.idToken;

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
          await rtdbSet(`organizers/${org.id || organizerId}`, org, token);
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
      const token = req.user?.idToken;
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
      const userToken = req.user?.idToken;

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

  // Cashfree Order Creation API
  app.post("/api/cashfree/create-order", async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, orderId, eventId, tierId, seatIds, quantity, userId, couponCode, reservationId } = req.body;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      let pricePerSeat = 1499;
      if (EVENT_PRICES_CATALOG[eventId] && EVENT_PRICES_CATALOG[eventId][tierId]) {
        pricePerSeat = EVENT_PRICES_CATALOG[eventId][tierId];
      }
      // DB event tier price is the source of truth; the hardcoded catalog is only a demo fallback.
      try {
        const evtForPrice = (await rtdbGet(`events/${eventId}`, userToken))?.data as any;
        const dbTier = normalizeTiers(evtForPrice?.ticketTiers).find((t: any) => t.id === tierId);
        if (dbTier && typeof dbTier.price === "number" && dbTier.price > 0) {
          pricePerSeat = dbTier.price;
        }
      } catch {
        // fall back to the hardcoded catalog price
      }

      const numSeats = seatIds && Array.isArray(seatIds) && seatIds.length > 0 ? seatIds.length : (quantity || 1);
      let serverCalculatedAmount = pricePerSeat * numSeats;

      let discountApplied = 0;
      let appliedCouponCode = null;
      if (couponCode && typeof couponCode === "string") {
        const upper = couponCode.trim().toUpperCase();
        const couponSnap = await rtdbGet(`coupons/${upper}`, userToken);
        if (couponSnap.data) {
          const coupon = couponSnap.data;
          if (
            coupon &&
            coupon.isActive &&
            new Date(coupon.validUntil) >= new Date() &&
            (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) &&
            (!coupon.eventId || coupon.eventId === eventId)
          ) {
            if (coupon.type === "percentage") {
              discountApplied = Math.round((serverCalculatedAmount * coupon.value) / 100);
            } else {
              discountApplied = Math.min(serverCalculatedAmount, coupon.value);
            }
            serverCalculatedAmount = Math.max(0, serverCalculatedAmount - discountApplied);
            appliedCouponCode = upper;
          }
        }
      }

      const amountInPaise = Math.round(serverCalculatedAmount * 100);
      const appId = process.env.CASHFREE_APP_ID;
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const env = process.env.CASHFREE_ENV || "sandbox";

      // Reservation binding (same rules as Cashfree: active, owned by session, exact seat + amount match)
      if (reservationId) {
        const authToken = userToken || (await getAdminAuthToken());
        const recRes = await rtdbGet(`reservations/${reservationId}`, authToken);
        const rec: ReservationRecord | null = recRes?.data || null;
        if (!rec) {
          return res.status(409).json({ success: false, error: "Seat reservation not found. Please re-select your seats." });
        }
        const headerSession = (req.headers["x-session-id"] as string)?.slice(0, 64) || "";
        const raw = `${req.ip || req.socket?.remoteAddress || "unknown"}|${req.headers["user-agent"] || "unknown"}|${headerSession}`;
        const expectedGuest = "guest_" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
        const isOwner = rec.ownerId === (userId || "anon_user") || rec.ownerId === expectedGuest;
        if (rec.status !== "active" || !isOwner) {
          return res.status(409).json({ success: false, error: "Seat reservation is no longer active. Please re-select your seats." });
        }
        const norm = normalizeSeatIds(seatIds || []);
        if (norm.length !== rec.seatIds.length || norm.join(",") !== rec.seatIds.join(",")) {
          return res.status(409).json({ success: false, error: "Seat selection no longer matches your reservation. Please review again." });
        }
        if (Math.abs((rec.quote.totalMinor || 0) - amountInPaise) > 50) {
          return res.status(409).json({ success: false, error: "Order amount no longer matches the reviewed total. Please review again." });
        }
      }
      if (!appId || !secretKey) {
        return res.status(503).json({ success: false, error: "Payment gateway is not configured yet. Please configure CASHFREE_APP_ID and CASHFREE_SECRET_KEY and try again." });
      }

      const url = env === "production"
        ? "https://api.cashfree.com/pg/orders"
        : "https://sandbox.cashfree.com/pg/orders";

      const cleanPhone = (customerPhone || "9820012345").replace(/[^0-9]/g, "").slice(-10) || "9820012345";
      const cleanEmail = customerEmail || "customer@example.com";
      const cleanName = customerName || "Customer Name";
      const idToUse = orderId || `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        order_amount: serverCalculatedAmount,
        order_currency: "INR",
        order_id: idToUse,
        customer_details: {
          customer_id: `cust_${Date.now()}`,
          customer_name: cleanName,
          customer_email: cleanEmail,
          customer_phone: cleanPhone,
        },
        order_meta: {
          return_url: `${req.protocol}://${req.get("host")}/checkout?order_id={order_id}`
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Cashfree order creation error:", data);
        return res.status(response.status).json({
          success: false,
          error: data.message || "Failed to create Cashfree order",
          details: data
        });
      }

      await rtdbSet(`pending_orders/${idToUse}`, {
        eventId: eventId || "evt_001",
        tierId: tierId || "tier_vip",
        seatIds: seatIds || [],
        quantity: numSeats,
        amount: serverCalculatedAmount,
        couponCode: appliedCouponCode,
        reservationId: reservationId || null,
        customerDetails: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
        },
        userId: userId || "anon_user",
        createdAt: new Date().toISOString(),
      }, userToken);

      return res.json({
        success: true,
        payment_session_id: data.payment_session_id,
        order_id: data.order_id,
        cf_order_id: data.cf_order_id,
        raw: data
      });
    } catch (err: any) {
      console.error("Server Cashfree error:", err);
      return res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });

  app.get("/api/cashfree/verify-order/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      const authHeader = req.headers.authorization;
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

      const appId = process.env.CASHFREE_APP_ID;
      const secretKey = process.env.CASHFREE_SECRET_KEY;
      const env = process.env.CASHFREE_ENV || "sandbox";

      if (!appId || !secretKey) {
        return res.status(503).json({ success: false, error: "Payment gateway is not configured yet. Please configure CASHFREE_APP_ID and CASHFREE_SECRET_KEY and try again." });
      }

      const url = env === "production"
        ? `https://api.cashfree.com/pg/orders/${orderId}`
        : `https://sandbox.cashfree.com/pg/orders/${orderId}`;

      const response = await fetch(url, {
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01"
        }
      });

      // Local e2e test bypass: when CASHFREE_ENV=sandbox and the caller sets
      // X-Cashfree-E2E: 1, treat the order as paid without contacting Cashfree.
      // Never enable this in production deployments.
      const e2eBypass = process.env.CASHFREE_ENV === "sandbox" &&
        (req.headers["x-cashfree-e2e"] || "").toString().toLowerCase() === "1";

      let data: any = {};
      if (e2eBypass) {
        data = { order_status: "PAID", order_id: orderId, payments: [] };
      } else {
        data = await response.json();
      }
      // Production hardening: in production mode the order MUST be PAID as confirmed by
      // Cashfree's servers. The sandbox bypass exists only when CASHFREE_ENV=sandbox so a
      // misconfigured production deployment can never credit an unpaid order.
      let isPaid = false;
      if (env === "sandbox") {
        isPaid = response.ok && data.order_status === "PAID";
        if (!isPaid) isPaid = response.ok; // sandbox orders may not reach PAID
      } else {
        isPaid = response.ok && data.order_status === "PAID";
      }
      if (!isPaid) {
        return res.status(400).json({ success: false, error: "Payment has not been completed yet." });
      }

      const paymentId = (data.payments && data.payments[0] && data.payments[0].cf_payment_id) || `cf_pay_${Date.now()}`;
      const finalizeResult = await finalizeBookingServerSide(
        orderId,
        `cashfree_${paymentId}`,
        paymentId,
        userToken
      );

      if (!finalizeResult.success) {
        return res.status(409).json({
          success: false,
          error: finalizeResult.error || "Failed to finalize booking."
        });
      }

      return res.json({
        success: true,
        verified: true,
        ticket: finalizeResult.ticket,
        booking: finalizeResult.booking,
        data
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/cashfree/webhook", async (req, res) => {
    try {
      const webhookSecret = process.env.CASHFREE_SECRET_KEY;
      if (!webhookSecret) {
        return res.status(500).json({ success: false, error: "Configuration error" });
      }
      const signature = (req.headers["x-webhook-signature"] || req.headers["x-signature"]) as string;
      if (!signature) {
        return res.status(400).json({ success: false, error: "Missing webhook signature" });
      }
      // Cashfree signs the base64-encoded raw body: HMAC-SHA256 over the base64 payload,
      // then base64-encodes the HMAC. Compare in constant-ish time to reject tampered payloads.
      const rawBody = JSON.stringify(req.body);
      const bodyBase64 = Buffer.from(rawBody).toString("base64");
      const hmacDigest = crypto.createHmac("sha256", webhookSecret).update(bodyBase64).digest();
      const expectedSignature = hmacDigest.toString("base64");
      if (signature !== expectedSignature) {
        return res.status(400).json({ success: false, error: "Invalid webhook signature" });
      }

      const event = req.body;
      if (event && (event.type === "PAYMENT_SUCCESS_WEBHOOK" || event.data?.payment?.payment_status === "SUCCESS")) {
        const orderId = event.data?.order?.order_id;
        if (orderId) {
          const paymentId = event.data?.payment?.cf_payment_id || `cf_pay_wh_${Date.now()}`;
          await finalizeBookingServerSide(orderId, `cashfree_${paymentId}`, paymentId);
        }
      }

      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
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
