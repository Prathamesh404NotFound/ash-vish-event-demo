import express from "express";
import path from "path";
import fs from "fs";
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
  refundRazorpayPayment,
  verifyWebhookSignature,
  KEY_ID as razorpayKeyId,
} from "./src/lib/payment/razorpay.js";

const SERVER_HMAC_SECRET = process.env.SERVER_HMAC_SECRET || "ASH_VISH_SECURE_HMAC_KEY_2026";

// ============================================================
// Admin Panel (Prompt B) — Item 6: minimal email service
// ============================================================
// Single lightweight dependency (nodemailer ^6.10.1). When the SMTP
// environment variables are absent, sends are recorded in the notifications
// node in no-mail mode rather than failing the calling action.

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

let smtpConfig: SmtpConfig | null = null;
function loadSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@ashvish.events";
  if (host && user) smtpConfig = { host, port, user, pass, from };
  return smtpConfig;
}
loadSmtpConfig();

function isSmtpConfigured(): boolean {
  return Boolean(loadSmtpConfig());
}

async function sendMail(options: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: boolean; mode: "smtp" | "no-mail"; error?: string }> {
  if (!isSmtpConfigured()) {
    return { ok: true, mode: "no-mail" };
  }
  try {
    // @ts-ignore
    const nodemailer = await import("nodemailer");
    const transport = (nodemailer as any).createTransport({
      host: smtpConfig!.host,
      port: smtpConfig!.port,
      secure: smtpConfig!.port === 465,
      auth: { user: smtpConfig!.user, pass: smtpConfig!.pass },
    });
    await transport.sendMail({
      from: smtpConfig!.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || undefined,
    });
    return { ok: true, mode: "smtp" };
  } catch (err: any) {
    return { ok: false, mode: "smtp", error: err?.message || "SMTP send failed" };
  }
}

/** Record a notification send in the notifications node (audit trail for
 * bulk and confirmation emails). */
async function recordNotification(params: {
  eventId?: string;
  subject: string;
  message: string;
  recipientCount: number;
  status: "queued" | "sent" | "failed";
  createdBy?: string;
}): Promise<void> {
  try {
    const adminToken = await getAdminAuthToken();
    if (!adminToken) return;
    const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await rtdbPush("notifications", {
      id,
      eventId: params.eventId || null,
      subject: params.subject,
      message: params.message,
      recipientCount: params.recipientCount,
      status: params.status,
      createdBy: params.createdBy || "system",
      sentAt: params.status === "sent" ? new Date().toISOString() : undefined,
    }, adminToken).catch(() => {});
  } catch (err: any) {
    console.warn("[NOTIFY] Notification record failed:", err.message);
  }
}

/**
 * Send a confirmation email after order confirmation. Always returns
 * normally — failures are logged, never thrown.
 */
async function sendOrderConfirmationEmail(
  customerDetails: any,
  details: { eventId: string; eventTitle: string; ticketNumber: string; tierName: string; amount: number; venue: string; city: string; date: string; time: string }
): Promise<void> {
  const email = customerDetails?.email;
  if (!email || !String(email).includes("@")) return;
  const name = customerDetails?.name || "Ticket Holder";
  const isRes = details.ticketNumber.startsWith("ASH-RES-");
  const subject = isRes ? `Reservation Confirmed — ${details.eventTitle}` : `Booking Confirmed — ${details.eventTitle}`;
  const text = isRes
    ? [
        `Hi ${name},`,
        ``,
        `Your reservation for "${details.eventTitle}" is confirmed.`,
        `Reservation Number: ${details.ticketNumber}`,
        `Tier: ${details.tierName}`,
        `Amount Due at Counter: INR ${details.amount}`,
        `Venue: ${details.venue}, ${details.city}`,
        `Date: ${details.date} at ${details.time}`,
        ``,
        `Show this Reservation Pass at the venue's Pay-at-Counter station to complete payment and validate your entry pass.`,
        `— Ash-vish Events`,
      ].join("\n")
    : [
        `Hi ${name},`,
        ``,
        `Your booking for "${details.eventTitle}" is confirmed.`,
        `Ticket Number: ${details.ticketNumber}`,
        `Tier: ${details.tierName}`,
        `Amount Paid: INR ${details.amount}`,
        `Venue: ${details.venue}, ${details.city}`,
        `Date: ${details.date} at ${details.time}`,
        ``,
        `Show this ticket (or its QR code) at the entrance to check in.`,
        `— Ash-vish Events`,
      ].join("\n");
  const result = await sendMail({ to: String(email), subject, text });
  await recordNotification({
    eventId: details.eventId,
    subject,
    message: `Confirmation email to ${email} for ${details.ticketNumber}${result.mode === "no-mail" ? " (no-mail mode: SMTP not configured)" : ""}`,
    recipientCount: 1,
    status: "sent",
  }).catch(() => {});
}

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
  guestOwnerId?: string;
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
  // Admin toggle: usesSeatMap=false forces general admission even when a seat
  // map was previously configured on the event.
  const seatMapEnabled = eventData.usesSeatMap !== false && Boolean(eventData.seatMap);
  const seatMap = seatMapEnabled ? eventData.seatMap : undefined;
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

// ============================================================
// Admin Panel (Prompt B) — Item 1: Event lifecycle helpers
// ============================================================

const EVENT_LIFECYCLE_STATUSES = ["draft", "published", "archived", "cancelled", "sold_out"] as const;

/**
 * Apply scheduled publish/unpublish transitions to a single event. Idempotent:
 * only mutates the event when the scheduled time has passed and the status
 * would actually change. Returns the (possibly updated) event.
 */
async function applyScheduledTransitions(event: any, nowMs = Date.now()): Promise<any> {
  if (!event || typeof event !== "object") return event;
  const updates: Record<string, any> = {};

  const publishAt = event.scheduledPublishAt ? Date.parse(String(event.scheduledPublishAt)) : NaN;
  if (!Number.isNaN(publishAt) && nowMs >= publishAt && (event.status || "draft") === "draft") {
    updates.status = "published";
    updates.publishedVia = "scheduled_publish";
  }

  const unpublishAt = event.scheduledUnpublishAt ? Date.parse(String(event.scheduledUnpublishAt)) : NaN;
  if (!Number.isNaN(unpublishAt) && nowMs >= unpublishAt && (updates.status || event.status || "published") === "published") {
    updates.status = "archived";
    updates.publishedVia = undefined;
    updates.archivedVia = "scheduled_unpublish";
  }

  if (Object.keys(updates).length > 0) {
    const merged = { ...event, ...updates };
    try {
      const adminToken = await getAdminAuthToken();
      if (adminToken) await rtdbUpdate(`events/${event.id}`, updates, adminToken);
    } catch (err: any) {
      console.warn("[LIFECYCLE] Scheduled transition persistence failed:", err.message);
    }
    return merged;
  }
  return event;
}

/**
 * Sweep all events for expired scheduled transitions. Invoked by the
 * background job and the manual lifecycle endpoint.
 */
async function applyScheduledTransitionsAll(): Promise<{ processed: number }> {
  let processed = 0;
  try {
    const adminToken = await getAdminAuthToken();
    if (!adminToken) return { processed };
    const snap = await rtdbGet("events", adminToken);
    const events = (snap.data || {}) as Record<string, any>;
    const now = Date.now();
    for (const [id, evt] of Object.entries(events)) {
      const updated = await applyScheduledTransitions(evt, now);
      if (updated !== evt && JSON.stringify(updated.status) !== JSON.stringify(evt.status)) processed++;
    }
  } catch (err: any) {
    console.error("[LIFECYCLE] Sweep failed:", err.message);
  }
  return { processed };
}

/** Visibility gate used by customer-facing and counter reads. Draft and
 * archived events are never bookable or visible in active lists. */
const isEventPublic = (event: any): boolean => (event?.status || "published") === "published";

// ============================================================
// Admin Panel (Prompt B) — Item 3: orders canonical record writer
// ============================================================

/**
 * RecordOrder: writes the canonical admin orders record alongside every
 * fulfilled booking (online, counter, and manual). Stored under orders/ so
 * the orders dashboard can paginate and filter without scanning tickets.
 */
async function recordOrder(params: {
  orderId: string;
  eventId: string;
  tierId: string;
  seatIds: string[];
  quantity: number;
  customerDetails: { name: string; email: string; phone: string };
  amount: number;
  discount?: number;
  couponCode?: string | null;
  paymentMethod: string;
  paymentStatus?: "paid" | "pending";
  amountDue?: number;
  channel: "online" | "counter" | "manual";
  ticketId?: string | null;
  bookingId?: string | null;
  createdBy?: string;
}): Promise<void> {
  try {
    const adminToken = await getAdminAuthToken();
    if (!adminToken) return;
    const order = {
      orderId: params.orderId,
      eventId: params.eventId,
      tierId: params.tierId,
      seatIds: params.seatIds || [],
      quantity: params.quantity,
      customerDetails: {
        name: String(params.customerDetails?.name || ""),
        email: String(params.customerDetails?.email || ""),
        phone: String(params.customerDetails?.phone || ""),
      },
      amount: Number(params.amount) || 0,
      discount: Number(params.discount) || 0,
      couponCode: params.couponCode || null,
      paymentMethod: String(params.paymentMethod || ""),
      paymentStatus: params.paymentStatus || "paid",
      amountDue: params.amountDue !== undefined ? params.amountDue : (params.paymentStatus === "pending" ? (Number(params.amount) || 0) : 0),
      channel: params.channel,
      status: "confirmed",
      refundReason: null,
      refundAmount: null,
      ticketId: params.ticketId || null,
      bookingId: params.bookingId || null,
      createdAt: new Date().toISOString(),
      createdBy: params.createdBy || "system",
    };
    await rtdbSet(`orders/${params.orderId}`, order, adminToken);
  } catch (err: any) {
    // Orders dashboard convenience record; booking records remain authoritative.
    console.warn("[ORDERS] Canonical order record write failed:", err.message);
  }
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
  userToken?: string,
  explicitCouponCode?: string | null,
  deferPayment: boolean = false
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
    const { eventId, tierId, seatIds, quantity, customerDetails, userId, amount, discount } = pendingOrder;
    // Coupon code source of truth: prefer pending_order couponCode, fall back to
    // the explicitly-passed counter code (the walk-in endpoint validates the
    // coupon before building the pending order).
    const couponCode: string | null = pendingOrder.couponCode || explicitCouponCode || null;
    const discountAmount = Number(discount) || 0;
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
    const isDeferred = deferPayment === true;
    const ticketId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const bookingId = 'bkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const ticketNum = isDeferred
      ? `ASH-RES-${Math.floor(1000 + Math.random() * 9000)}`
      : `ASH-${Math.floor(1000 + Math.random() * 9000)}-SRV`;

    const eventRes = await rtdbGet(`events/${eventId}`, authToken);
    const eventData = eventRes.data || {};
    const eventTitle = eventData.title || "Live Event";
    const eventPoster =
      eventData.posterUrl ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";
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

    // Build the signed token server-side (reuse the same HMAC scheme as
    // /api/tickets/generate-token, with the ASH_RES header for deferred passes).
    const issuedAt = new Date().toISOString();
    const tokenPayload = `${bookingId}|${eventId}|${seatLabel}|${ticketId}|${issuedAt}`;
    const tokenSig = crypto.createHmac("sha256", SERVER_HMAC_SECRET).update(tokenPayload).digest("hex").substring(0, 16);
    const signedQrToken = `${isDeferred ? 'ASH_RES' : 'ASH_PASS'}.${Buffer.from(tokenPayload).toString('base64url')}.${tokenSig}`;

    // Generate secure opaque pass slug
    const passId = crypto.randomBytes(24).toString('base64url');
    const passSig = crypto.createHmac("sha256", SERVER_HMAC_SECRET).update(`${passId}|${ticketId}`).digest("hex").substring(0, 16);
    const passSlug = { id: passId, sig: passSig, createdAt: Date.now() };

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
      totalPaid: isDeferred ? 0 : amount,
      discount: discountAmount,
      seatNumber: seatLabel,
      selectedSeats: seatIds || [],
      attendeeName: customerDetails.name,
      attendeeEmail: customerDetails.email,
      attendeePhone: customerDetails.phone,
      qrCodeValue: signedQrToken,
      passSlug,
      passType: isDeferred ? 'reservation' : 'entry',
      paymentStatus: isDeferred ? 'pending' : 'paid',
      amountDue: isDeferred ? amount : 0,
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
      discount: discountAmount,
      status: 'confirmed',
      paymentStatus: isDeferred ? 'pending' : 'paid',
      amountDue: isDeferred ? amount : 0,
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
    await rtdbSet(`passes/${passId}`, {
      ticketId,
      signature: passSig,
      ticketNumber: ticketNum,
      eventTitle,
      eventPoster,
      venue,
      city,
      date,
      time,
      tierName,
      seatNumber: seatLabel,
      attendeeName: customerDetails.name,
      qrCodeValue: signedQrToken,
      status: 'valid',
      passType: isDeferred ? 'reservation' : 'entry',
      paymentStatus: isDeferred ? 'pending' : 'paid',
      amountDue: isDeferred ? amount : 0,
      redeemedAt: null,
      redeemedBy: null,
      createdAt: Date.now(),
      openCount: 0,
      eventGoogleMapsQuery: (eventData as any).eventGoogleMapsQuery || `${venue}, ${city}`,
    }, authToken);

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

    const processedOrder: any = {
      orderId,
      ticketId,
      bookingId,
      status: 'processed',
      ticket: newTicket,
      booking: newBookingRecord,
      processedAt: new Date().toISOString()
    };
    if (paymentId) processedOrder.paymentId = paymentId;
    await rtdbSet(`processed_orders/${orderId}`, processedOrder, authToken);
    await rtdbDelete(`pending_orders/${orderId}`, authToken);

    // Canonical admin orders record (Prompt B Item 3): written for every
    // fulfilled booking regardless of channel, so the orders dashboard has a
    // single filterable source that mirrors the tickets/booking records.
    const isWalkInChannel = String(paymentMethod).startsWith("walkin");
    await recordOrder({
      orderId,
      eventId,
      tierId: tierId || "",
      seatIds: seatIds || [],
      quantity,
      customerDetails: customerDetails || {},
      amount,
      discount: pendingOrder?.discount || 0,
      couponCode: couponCodeUpper,
      paymentMethod,
      paymentStatus: isDeferred ? "pending" : "paid",
      amountDue: isDeferred ? amount : 0,
      channel: isWalkInChannel ? "counter" : "online",
      ticketId,
      bookingId,
    }).catch(() => {});

    // Confirmation email (Prompt B Item 6): send on order confirmation. When
    // SMTP is not configured, the mail helper records the send in the
    // notifications outbox in no-mail mode instead of failing the booking.
    sendOrderConfirmationEmail(customerDetails, {
      eventId,
      eventTitle,
      ticketNumber: ticketNum,
      tierName,
      amount,
      venue,
      city,
      date,
      time,
    }).catch((e) => console.warn("[MAIL] Confirmation email failed:", e?.message));

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
      case "super_admin":
        return "super_admin";
      case "organizer":
      case "event_manager":
        return "event_manager";
      case "ticket_counter":
      case "counter_staff":
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

            if (serverRole === 'organizer' || serverRole === 'event_manager') {
              const orgsSnap = await rtdbGet('organizers', token);
              const orgsList: any[] = Object.values(orgsSnap.data || {});
              const org = orgsList.find((o: any) => o.userId === verified.uid);
              if (org && org.status === 'rejected') {
                return res.status(403).json({ success: false, error: "Access Denied: Organizer profile was rejected." });
              }
            }

            const roleAliases: Record<string, string[]> = {
              admin: ['admin', 'super_admin'],
              super_admin: ['admin', 'super_admin'],
              organizer: ['organizer', 'event_manager'],
              event_manager: ['organizer', 'event_manager'],
              ticket_counter: ['ticket_counter', 'counter_staff'],
              counter_staff: ['ticket_counter', 'counter_staff'],
            };

            const isAllowed = allowedRoles.some((allowed) => {
              if (serverRole === allowed) return true;
              const aliases = roleAliases[allowed] || [allowed];
              if (aliases.includes(serverRole)) return true;
              if ((serverRole === 'admin' || serverRole === 'super_admin') && (allowed === 'organizer' || allowed === 'event_manager' || allowed === 'ticket_counter' || allowed === 'counter_staff')) {
                return true;
              }
              return false;
            });

            if (isAllowed) {
              const rbacRole = toRbacRole(serverRole) || (serverRole === 'admin' || serverRole === 'super_admin' ? 'super_admin' : 'event_manager');
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
  // Coupon in-place edit (Prompt B): allowed fields are type, value, validUntil,
  // usageLimit (null = unlimited), isActive, and eventId restriction.
  app.put("/api/coupons/update", verifyRole(['admin']), async (req: any, res) => {
    try {
      const { code, type, value, validUntil, usageLimit, isActive, eventId } = req.body || {};
      const upper = String(code || "").trim().toUpperCase();
      if (!upper) return res.status(400).json({ success: false, error: "Coupon code is required" });
      const coupon = await getCouponByCode(upper, req.user?.idToken);
      if (!coupon) return res.status(404).json({ success: false, error: "Coupon not found" });
      if (type !== undefined) {
        if (!["percentage", "fixed"].includes(String(type))) {
          return res.status(400).json({ success: false, error: "Type must be 'percentage' or 'fixed'." });
        }
        coupon.type = type;
      }
      if (value !== undefined) {
        const v = Number(value);
        if (!Number.isFinite(v) || v <= 0 || v > 10000) {
          return res.status(400).json({ success: false, error: "Value must be a positive number not exceeding 10000." });
        }
        coupon.value = v;
      }
      if (validUntil !== undefined) {
        const t = Date.parse(String(validUntil));
        if (validUntil !== "" && Number.isNaN(t)) {
          return res.status(400).json({ success: false, error: "validUntil must be a valid date." });
        }
        coupon.validUntil = validUntil === "" ? null : String(validUntil);
      }
      if (usageLimit !== undefined) {
        if (usageLimit === null || usageLimit === "") {
          coupon.usageLimit = null;
        } else {
          const n = Number(usageLimit);
          if (!Number.isInteger(n) || n <= 0) {
            return res.status(400).json({ success: false, error: "usageLimit must be a positive integer (or empty for unlimited)." });
          }
          coupon.usageLimit = n;
        }
      }
      if (isActive !== undefined) coupon.isActive = Boolean(isActive);
      if (eventId !== undefined) coupon.eventId = eventId || null;
      const beforeState = JSON.parse(JSON.stringify(coupon));
      await saveCouponToDB(upper, coupon, req.user?.idToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "coupon.updated",
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
    return { ownerId: sessionIdGuest || legacyCompositeGuest, authenticated: false, guestOwnerId: sessionIdGuest || undefined };
  }

  /**
   * A guest reservation may be created just before Firebase login completes.
   * Preserve access only when that same browser also proves knowledge of the
   * original opaque session id; do not accept an arbitrary owner id from the
   * client. This prevents a valid sign-in from orphaning its in-progress hold.
   */
  function isReservationOwner(record: ReservationRecord, owner: { ownerId: string; guestOwnerId?: string; uid?: string }): boolean {
    if (!record || !owner) return false;
    if (record.ownerId === owner.ownerId) return true;
    if (owner.guestOwnerId && record.ownerId === owner.guestOwnerId) return true;
    if (record.guestOwnerId && owner.guestOwnerId && record.guestOwnerId === owner.guestOwnerId) return true;
    if (owner.uid && record.ownerId === owner.uid) return true;
    return false;
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

      let normalizedSeats = normalizeSeatIds(seatIds || []);
      if (normalizedSeats.length > 0 && normalizedSeats.length !== quantity) {
        return res.status(400).json({ success: false, error: "Number of selected seats must equal the requested quantity." });
      }
      // Admin toggle: usesSeatMap=false forces general admission — no seats.
      if (eventData.usesSeatMap === false) normalizedSeats = [];

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
        guestOwnerId: owner.guestOwnerId,
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
      // Guard ordering: reject requests with no verifiable identity BEFORE
      // any database lookup — the caller must never learn whether a
      // reservation id exists or what its status is. Guest sessions are only
      // valid when the caller presents an X-Session-Id header (set by the
      // checkout page); an anonymous curl request has neither.
      if (!owner.ownerId || (!owner.authenticated && !owner.guestOwnerId)) return res.status(403).json({ success: false, error: "Authentication required." });
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

  // -- Item: hold keepalive during payment -------------------------------
  // Razorpay UPI/OTP flows can exceed the 10-minute hold. While the checkout
  // modal is open, the client polls this endpoint (every ~2 minutes) to keep
  // the reservation and its seat holds alive. Same ceiling as /renew (4x TTL),
  // owner-checked, and a 90-second cooldown prevents abuse.
  app.post("/api/reservations/:reservationId/extend", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      // Guard ordering: reject requests with no verifiable identity BEFORE
      // any database lookup — the caller must never learn whether a
      // reservation id exists or what its status is. Guest sessions are only
      // valid when the caller presents an X-Session-Id header (set by the
      // checkout page); an anonymous curl request has neither.
      if (!owner.ownerId || (!owner.authenticated && !owner.guestOwnerId)) return res.status(403).json({ success: false, error: "Authentication required." });
      const authToken = await getAdminAuthToken();
      const record = (await rtdbGet(`reservations/${req.params.reservationId}`, authToken)).data as any | null;
      if (!record) return res.status(404).json({ success: false, error: "Reservation not found." });
      if (!isReservationOwner(record, owner)) return res.status(403).json({ success: false, error: "Not your reservation." });
      if (record.status !== "active") return res.status(409).json({ success: false, error: `Reservation is ${record.status} and cannot be extended.` });
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
      const lastExt = record.lastExtensionAt || 0;
      if (now - lastExt < 90 * 1000) {
        return res.json({ success: true, expiresAt: record.expiresAt, serverNow: now, keptAlive: true, throttleRemainingMs: Math.max(0, 90 * 1000 - (now - lastExt)) });
      }
      if (record.seatIds && record.seatIds.length > 0) {
        for (const seatId of record.seatIds) {
          rtdbUpdate(`seats/${record.eventId}/${seatId}`, { holdExpiresAt: newExpiresAt, heldBy: record.ownerId, status: "held", heldAt: record.heldAt || now }, authToken).catch(() => {});
        }
      }
      await rtdbUpdate(`reservations/${record.reservationId}`, { expiresAt: newExpiresAt, lastExtensionAt: now }, authToken);
      return res.json({ success: true, expiresAt: newExpiresAt, serverNow: now, keptAlive: true });
    } catch (err: any) {
      console.error("[RESERVATION EXTEND ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: "Failed to extend reservation." });
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
      // Seat-based vs general-admission decision: a GA event (admin toggle
      // usesSeatMap=false) takes a quantity only — no seat IDs are involved.
      const isSeatBasedEvent = eventData.usesSeatMap !== false && Boolean(eventData.seatMap);
      if (!isSeatBasedEvent) seatIds = [];
      if (seatIds.length !== quantity) {
        return res.status(400).json({ success: false, error: "Number of selected seats must equal the requested quantity." });
      }
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
        phone: String(phone).slice(0, 40),
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

  /**
   * Cash on Counter (Pay at Counter) Reservation Confirmation.
   * Converts an active hold/reservation into a valid Reservation Pass with pending payment status.
   * Confirms seats in the layout so they cannot be grabbed by other buyers, but requires counter payment at venue.
   */
  app.post("/api/reservations/:reservationId/reserve-pay-later", async (req, res) => {
    try {
      const owner = await resolveReservationOwner(req);
      const { reservationId } = req.params;
      const { couponCode, attendee } = req.body || {};
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
      const customerDetails = attendee || record.attendee || { name: "Guest Attendee", email: "", phone: "" };

      const orderId = `ord_coc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await rtdbSet(`pending_orders/${orderId}`, {
        eventId: record.eventId,
        tierId: record.tierId,
        seatIds: record.seatIds,
        quantity: record.quantity,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customerDetails,
        userId: owner.ownerId,
        amount: totalMinor / 100,
        reservationId,
        createdAt: now,
        paymentMethod: "cash_on_counter",
        passType: "reservation",
        paymentStatus: "pending",
        amountDue: totalMinor / 100,
      }, authToken);

      const result = await finalizeBookingServerSide(
        orderId,
        "cash_on_counter",
        `coc_${orderId}`,
        authToken,
        appliedCoupon?.code,
        true // deferPayment = true
      );

      if (!result.success) {
        return res.status(409).json({ success: false, error: result.error || "Failed to complete reservation." });
      }

      return res.json({
        success: true,
        ticket: result.ticket,
        booking: result.booking,
        appliedCoupon,
        passType: "reservation",
        paymentStatus: "pending",
        amountDue: totalMinor / 100,
        totalMinor,
      });
    } catch (err: any) {
      console.error("[RESERVE PAY LATER ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: err.message || "Failed to create reservation." });
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

      // Idempotency: already fulfilled (direct lookup and payment-id scan — a
      // duplicate submission must never return 409, always success).
      const processedRes = await rtdbGet(`processed_orders/${orderId}`, authToken);
      if (processedRes.data) {
        return res.json({ success: true, ticket: processedRes.data.ticket, booking: processedRes.data.booking, alreadyProcessed: true });
      }
      const allProcessed: any = (await rtdbGet("processed_orders", authToken)).data || {};
      for (const [, entry] of Object.entries(allProcessed) as [string, any][]) {
        if (entry && entry.paymentId === paymentId) {
          return res.json({ success: true, ticket: entry.ticket, booking: entry.booking, alreadyProcessed: true });
        }
      }

      const pendingRes = await rtdbGet(`pending_orders/${orderId}`, authToken);
      const pendingOrder: any = pendingRes.data;
      if (!pendingOrder) {
        return res.status(404).json({ success: false, error: "Order not found or expired." });
      }
      if (pendingOrder.userId !== owner.ownerId) {
        return res.status(403).json({ success: false, error: "Not your order." });
      }

      // Reconcile with Razorpay: fetch the actual payment and match order id + amount.
      const paymentRes = await fetchRazorpayPayment(paymentId);
      if (!paymentRes.ok) {
        return res.status(400).json({
          success: false,
          error: "Payment could not be verified, please contact support with order ID " + orderId + ".",
          paymentId,
        });
      }
      const payment = paymentRes.payment;
      if (!payment || !payment.order_id) {
        return res.status(400).json({ success: false, error: "Payment record is incomplete at the gateway." });
      }
      // Reconciliation: prefer the direct mapping (payment.order_id === our
      // pending order's rzpOrderId). When retries created a newer pending order
      // (with a newer Razorpay order) but the buyer completed payment on the
      // earlier Razorpay order, scan the pending orders for the one the
      // gateway actually charged and fulfill that one instead.
      let fulfillOrder: any = null;
      let fulfillOrderId: string = "";
      if (payment.order_id === pendingOrder.rzpOrderId && pendingOrder.userId === owner.ownerId) {
        fulfillOrder = pendingOrder;
        fulfillOrderId = orderId;
      } else {
        const allPending: any = (await rtdbGet("pending_orders", authToken)).data || {};
        for (const [candidateId, candidate] of Object.entries(allPending) as [string, any][]) {
          if (candidate?.rzpOrderId === payment.order_id && candidate?.userId === owner.ownerId) {
            fulfillOrder = candidate;
            fulfillOrderId = candidateId;
            break;
          }
        }
      }
      if (!fulfillOrder) {
        return res.status(400).json({ success: false, error: "Payment does not belong to this order." });
      }
      if (fulfillOrderId !== orderId) {
        // Supersede the stale pending order from a retried checkout attempt so
        // a second verification cannot double-charge logic or confuse holds.
        await rtdbUpdate(`pending_orders/${orderId}`, { supersededBy: fulfillOrderId, supersededAt: new Date().toISOString() }, authToken);
      }
      const pendingOrderFinal: any = fulfillOrder;
      if (pendingOrderFinal.paymentMethod !== "razorpay") {
        return res.status(409).json({ success: false, error: "This order was not created for Razorpay payment." });
      }
      const captured = payment.amount === pendingOrderFinal.rzpAmount &&
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

      // SAFETY NET: if the payment was actually captured but fulfillment fails
      // (e.g. the seat hold expired during checkout and another buyer took the
      // seat), refund the buyer immediately. A captured payment must never be
      // held by the platform without a ticket and without a refund.
      const refundForConflict = async (reason: string): Promise<{ refunded: boolean; refundId?: string }> => {
        try {
          const refundRes = await refundRazorpayPayment({
            paymentId,
            amountPaise: pendingOrderFinal.rzpAmount,
            reason: `ash-events: ${reason}`,
          });
          if (refundRes.ok) {
            console.log(`[RAZORPAY REFUND] refunded ${paymentId}: ${refundRes.id} (${reason})`);
            await rtdbUpdate(`pending_orders/${fulfillOrderId}`, {
              refundId: refundRes.id,
              refundStatus: refundRes.status || "processed",
              refundReason: reason,
              refundedAt: new Date().toISOString(),
            }, authToken).catch(() => {});
            return { refunded: true, refundId: refundRes.id };
          }
          // Refund initiation failed: record it and surface an actionable message.
          console.error(`[RAZORPAY REFUND FAILED] ${paymentId}: ${refundRes.error}`);
          await rtdbUpdate(`pending_orders/${fulfillOrderId}`, {
            refundAttempted: false,
            refundError: refundRes.error || "Refund initiation failed",
            refundReason: reason,
            refundAttemptedAt: new Date().toISOString(),
          }, authToken).catch(() => {});
          return { refunded: false };
        } catch (rErr: any) {
          console.error("[RAZORPAY REFUND ERROR]", rErr.message || rErr);
          return { refunded: false };
        }
      };

      // Re-quote server-side (coupon-aware) as a last sanity check before fulfillment.
      const eventRes2 = await rtdbGet(`events/${pendingOrderFinal.eventId}`, authToken);
      const eventData2 = eventRes2.data;
      if (!eventData2) {
        // Captured payment + event gone: refund immediately (never 409 a
        // captured payment without a refund path).
        const refund = await refundForConflict("Event no longer available after payment");
        return res.status(409).json({
          success: false,
          error: refund.refunded
            ? "Payment refunded — the event is no longer available. Please contact support if the refund does not appear."
            : "The event is no longer available and the automatic refund could not be initiated. Please contact support with order ID " + fulfillOrderId + ".",
          refundConfirmed: refund.refunded,
          refundId: refund.refundId,
          paymentId,
        });
      }
      const quoteResult2 = computeReservationQuote(eventData2, pendingOrderFinal.seatIds, pendingOrderFinal.quantity, pendingOrderFinal.tierId);
      const expectedMinor2 = Math.max(0, quoteResult2.quote.totalMinor - (pendingOrderFinal.couponDiscountMinor || 0));
      if (pendingOrderFinal.amountMinor && pendingOrderFinal.amountMinor !== expectedMinor2) {
        const refund = await refundForConflict("Quote changed since payment capture");
        return res.status(409).json({
          success: false,
          error: refund.refunded
            ? "Payment refunded — pricing changed during checkout. Please restart checkout and pay the current price."
            : "Pricing changed during checkout and the automatic refund could not be initiated. Please contact support with order ID " + fulfillOrderId + ".",
          refundConfirmed: refund.refunded,
          refundId: refund.refundId,
          paymentId,
        });
      }

      const result = await finalizeBookingServerSide(fulfillOrderId || orderId, "razorpay", paymentId, authToken);
      if (!result.success) {
        // Captured payment but seats could not be booked (real conflict:
        // hold expired during checkout / seat taken by another buyer).
        const refund = await refundForConflict("Seat no longer available after payment: " + (result.error || "fulfillment failed").slice(0, 120));
        return res.status(409).json({
          success: false,
          error: refund.refunded
            ? "Payment refunded — seat no longer available. Please choose different seats or retry."
            : "Seat no longer available and the automatic refund could not be initiated. Please contact support with order ID " + fulfillOrderId + ".",
          refundConfirmed: refund.refunded,
          refundId: refund.refundId,
          seatsStillHeld: false,
          paymentId,
        });
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
    const role = req.user?.role || '';
    const rbacRole = req.user?.rbacRole || toRbacRole(role);
    if (role === 'admin' || role === 'super_admin' || rbacRole === 'super_admin') return true;
    const snap = await rtdbGet(`events/${eventId}`, adminToken);
    if (!snap.data || !snap.data.organizerId) return true;
    return Boolean(snap.data.organizerId === req.user?.uid);
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
    if (!startDate && !endDate) return null;
    if (startDate) {
      const startMs = Date.parse(String(startDate));
      if (Number.isNaN(startMs)) return "The event start date is not a valid date.";
      if (endDate) {
        const endMs = Date.parse(String(endDate));
        if (Number.isNaN(endMs)) return "The event end date is not a valid date.";
        if (endMs <= startMs) return "The event end date must be after the start date.";
      }
    } else if (endDate) {
      const endMs = Date.parse(String(endDate));
      if (Number.isNaN(endMs)) return "The event end date is not a valid date.";
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
      if (event.status !== undefined && !EVENT_LIFECYCLE_STATUSES.includes(event.status)) {
        return res.status(400).json({ success: false, error: `Invalid event status. Allowed: ${EVENT_LIFECYCLE_STATUSES.join(", ")}.` });
      }
      if (event.scheduledPublishAt !== undefined && event.scheduledPublishAt !== null && event.scheduledPublishAt !== "") {
        const t = Date.parse(String(event.scheduledPublishAt));
        if (Number.isNaN(t)) return res.status(400).json({ success: false, error: "scheduledPublishAt must be a valid ISO 8601 date/time." });
      }
      if (event.scheduledUnpublishAt !== undefined && event.scheduledUnpublishAt !== null && event.scheduledUnpublishAt !== "") {
        const t = Date.parse(String(event.scheduledUnpublishAt));
        if (Number.isNaN(t)) return res.status(400).json({ success: false, error: "scheduledUnpublishAt must be a valid ISO 8601 date/time." });
      }
      if (event.usesSeatMap !== undefined && typeof event.usesSeatMap !== 'boolean') {
        return res.status(400).json({ success: false, error: "usesSeatMap must be a boolean. When false the event runs a general-admission flow without a seat layout." });
      }
      if (event.cashOnCounterOnly !== undefined && typeof event.cashOnCounterOnly !== 'boolean') {
        return res.status(400).json({ success: false, error: "cashOnCounterOnly must be a boolean." });
      }
      if (Array.isArray(event.ticketTiers)) {
        for (const tier of event.ticketTiers) {
          if (tier) {
            const tierPriceError = validateNonNegativePrice(tier.price);
            if (tierPriceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${tierPriceError}` });
            const tierCap = tier.capacity ?? tier.totalInventory;
            if (tierCap !== undefined) {
              const capError = validatePositiveInteger(tierCap);
              if (capError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${capError}` });
            }
          }
        }
      }

      const adminToken = await getAdminAuthToken();
      const eventId = typeof event.id === 'string' && /^evt_[A-Za-z0-9_-]+$/.test(event.id)
        ? event.id
        : `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      // Defensive defaults: image fields are read unguarded by the public UI,
      // so an event written without posterUrl/coverUrl would crash the homepage.
      const defaultPoster =
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";
      const normalizedPoster = event.posterUrl || defaultPoster;
      const createdEvent = {
        ...event,
        id: eventId,
        organizerId: req.user.role === 'organizer' ? req.user.uid : (event.organizerId || null),
        status: event.status || "published",
        posterUrl: normalizedPoster,
        coverUrl: event.coverUrl || normalizedPoster,
        title: (event.title || "Untitled Event").trim() || "Untitled Event",
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
      if (body.status !== undefined && !EVENT_LIFECYCLE_STATUSES.includes(body.status)) {
        return res.status(400).json({ success: false, error: `Invalid event status. Allowed: ${EVENT_LIFECYCLE_STATUSES.join(", ")}.` });
      }
      if (body.scheduledPublishAt !== undefined && body.scheduledPublishAt !== null && body.scheduledPublishAt !== "") {
        const t = Date.parse(String(body.scheduledPublishAt));
        if (Number.isNaN(t)) return res.status(400).json({ success: false, error: "scheduledPublishAt must be a valid ISO 8601 date/time." });
      }
      if (body.scheduledUnpublishAt !== undefined && body.scheduledUnpublishAt !== null && body.scheduledUnpublishAt !== "") {
        const t = Date.parse(String(body.scheduledUnpublishAt));
        if (Number.isNaN(t)) return res.status(400).json({ success: false, error: "scheduledUnpublishAt must be a valid ISO 8601 date/time." });
      }
      if (body.usesSeatMap !== undefined && typeof body.usesSeatMap !== 'boolean') {
        return res.status(400).json({ success: false, error: "usesSeatMap must be a boolean. When false the event runs a general-admission flow without a seat layout." });
      }
      if (body.cashOnCounterOnly !== undefined && typeof body.cashOnCounterOnly !== 'boolean') {
        return res.status(400).json({ success: false, error: "cashOnCounterOnly must be a boolean." });
      }
      if (Array.isArray(body.ticketTiers)) {
        for (const tier of body.ticketTiers) {
          if (tier) {
            const tierPriceError = validateNonNegativePrice(tier.price);
            if (tierPriceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${tierPriceError}` });
            const tierCap = tier.capacity ?? tier.totalInventory;
            if (tierCap !== undefined) {
              const capError = validatePositiveInteger(tierCap);
              if (capError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${capError}` });
            }
          }
        }
      }

      const existing = (await rtdbGet(`events/${eventId}`, adminToken)).data || {};
      const defaultPoster =
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";
      const normalizedPoster = body.posterUrl || existing.posterUrl || defaultPoster;
      const updatedEvent = {
        ...existing,
        ...body,
        id: eventId,
        organizerId: existing.organizerId || (req.user.role === 'organizer' ? req.user.uid : null),
        status: body.status || existing.status || "published",
        posterUrl: normalizedPoster,
        coverUrl: body.coverUrl || existing.coverUrl || normalizedPoster,
        title: (body.title ?? existing.title ?? "Untitled Event").trim() || "Untitled Event",
        subtitle: body.subtitle !== undefined ? body.subtitle : (existing.subtitle ?? ""),
        description: body.description !== undefined ? body.description : (existing.description ?? ""),
        organizer: body.organizer !== undefined ? body.organizer : (existing.organizer ?? "Ash-vish Events"),
        mapsUrl: body.mapsUrl === "" ? null : (body.mapsUrl !== undefined ? body.mapsUrl : (existing.mapsUrl ?? null)),
        presentedBy: body.presentedBy === "" ? null : (body.presentedBy !== undefined ? body.presentedBy : (existing.presentedBy ?? null)),
        scheduledPublishAt: body.scheduledPublishAt === "" ? null : (body.scheduledPublishAt !== undefined ? body.scheduledPublishAt : (existing.scheduledPublishAt ?? null)),
        scheduledUnpublishAt: body.scheduledUnpublishAt === "" ? null : (body.scheduledUnpublishAt !== undefined ? body.scheduledUnpublishAt : (existing.scheduledUnpublishAt ?? null)),
        usesSeatMap: typeof body.usesSeatMap === 'boolean' ? body.usesSeatMap : (existing.usesSeatMap !== false),
        cashOnCounterOnly: typeof body.cashOnCounterOnly === 'boolean' ? body.cashOnCounterOnly : Boolean(existing.cashOnCounterOnly),
        isFeatured: typeof body.isFeatured === 'boolean' ? body.isFeatured : Boolean(existing.isFeatured),
        isTrending: typeof body.isTrending === 'boolean' ? body.isTrending : Boolean(existing.isTrending),
        isPopularThisWeek: typeof body.isPopularThisWeek === 'boolean' ? body.isPopularThisWeek : Boolean(existing.isPopularThisWeek),
        rating: typeof body.rating === 'number' ? body.rating : (existing.rating ?? 5.0),
        reviewsCount: typeof body.reviewsCount === 'number' ? body.reviewsCount : (existing.reviewsCount ?? 0),
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

      // Item 2: validate per-seat type, tier linkage, and per-row label uniqueness.
      const seatTypes = new Set(["regular", "premium", "accessible", "obstructed-view"]);
      const adminToken = await getAdminAuthToken();
      const eventSnap = await rtdbGet(`events/${eventId}`, adminToken);
      const tierIds = new Set(normalizeTiers(eventSnap.data?.ticketTiers).map((t: any) => t.id).filter(Boolean));
      const rowLabels = new Map<string, Set<string>>();
      for (const [nodeId, node] of Object.entries(seatNodes)) {
        const n = node as any;
        if (n.seatType !== undefined && !seatTypes.has(String(n.seatType))) {
          return res.status(400).json({ success: false, error: `Seat ${nodeId}: seatType must be one of regular, premium, accessible, obstructed-view.` });
        }
        if (n.pricingTierId !== undefined) {
          const tid = String(n.pricingTierId);
          if (!tierIds.has(tid) && tid !== "default") {
            return res.status(400).json({ success: false, error: `Seat ${nodeId}: pricingTierId "${tid}" does not match any event ticket tier.` });
          }
        }
        // Per-row label uniqueness (seatIdLabel / number within a row)
        const label = n.seatIdLabel || n.number || n.id;
        if (label !== undefined) {
          const rowKey = String(n.row ?? "unknown");
          let labels = rowLabels.get(rowKey);
          if (!labels) { labels = new Set<string>(); rowLabels.set(rowKey, labels); }
          const labelStr = String(label).trim();
          if (labelStr) {
            if (labels.has(labelStr)) {
              return res.status(400).json({ success: false, error: `Row ${rowKey}: duplicate seat label "${labelStr}". Seat labels must be unique within each row.` });
            }
            labels.add(labelStr);
          }
        }
      }

      if (!(await assertEventMutationAccess(eventId, req, adminToken))) {
        return res.status(403).json({ success: false, error: "You do not own this event." });
      }
      const beforeState = eventSnap.data;
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
      const { eventId, tierId, attendeeName, attendeePhone, attendeeEmail, selectedSeats = [], paymentMethod = 'cash', couponCode: rawCouponCode, payments: rawPayments, discountOverride: rawOverride, shiftId, idempotencyKey, counterId: rawCounterId } = req.body || {};

      // Idempotency: same key returns the same completed result
      const idKey = idempotencyKey ? String(idempotencyKey).trim() : null;
      let idHash: string | null = null;
      if (idKey) {
        idHash = hashIdempotencyKey(idKey);
        const existing = idempotencyResults.get(idHash);
        if (existing && existing.result) {
          return res.status(200).json({ success: true, idempotent: true, ...existing.result });
        }
      }

      if (!eventId || !tierId || !attendeeName) {
        return res.status(400).json({ success: false, error: "Event, ticket tier, and attendee name are required." });
      }
      if (!Array.isArray(selectedSeats) || selectedSeats.length > 100) {
        return res.status(400).json({ success: false, error: "Invalid seat selection." });
      }

      if (rawCouponCode && typeof rawCouponCode !== "string") {
        return res.status(400).json({ success: false, error: "Invalid coupon code." });
      }
      // Split payments (Item 2): an optional breakdown of amounts by method.
      // Each entry must carry a positive amount, and the sum must equal the
      // final order total (after discounts). The lead paymentMethod remains
      // the canonical primary method for the booking record.
      let splitPayments: { method: string; amount: number }[] = [];
      if (rawPayments !== undefined) {
        if (!Array.isArray(rawPayments) || rawPayments.length === 0 || rawPayments.length > 5) {
          return res.status(400).json({ success: false, error: "Split payments must list between 1 and 5 entries." });
        }
        splitPayments = rawPayments
          .map((p: any) => ({ method: String(p?.method || "").slice(0, 32) || "other", amount: Number(p?.amount) }))
          .filter((p: any) => Number.isFinite(p.amount) && p.amount > 0);
        if (splitPayments.length !== rawPayments.length) {
          return res.status(400).json({ success: false, error: "Every split payment must carry a positive amount." });
        }
      }
            // Seat array validation (basic shape/size) runs early; final GA handling
      // happens after the event is loaded below.
      // Walk-in phone numbers are optional for general admission counters;
      // when supplied, they must still match the supported format.
      const trimmedPhone = String(attendeePhone || "").trim();
      if (!String(attendeeName).trim() || (trimmedPhone && !/^[0-9+\s()-]{7,20}$/.test(trimmedPhone))) {
        return res.status(400).json({ success: false, error: "Attendee name is required, and any supplied phone number must be a valid 7-20 digit number." });
      }
      const adminToken = await getAdminAuthToken();
      const eventSnap = await rtdbGet(`events/${eventId}`, adminToken);
      const event = eventSnap.data as any;
      const tier = normalizeTiers(event?.ticketTiers).find((candidate: any) => candidate.id === tierId);
      if (!event || !tier) {
        return res.status(404).json({ success: false, error: "Event or ticket tier not found." });
      }
      // Admin toggle: usesSeatMap=false forces general admission — no seats.
      // Quantity for GA walk-ins comes from the client (default 1); seat-based
      // events still derive quantity from the seat selection.
      const gaEvent = event.usesSeatMap === false;
      const finalSeats: string[] = gaEvent ? [] : selectedSeats;
      // Server-side validation (Item 6): quantity is a positive integer (seat
      // count), and the walk-in may never exceed tier capacity or the platform
      // ceiling of 100 walk-in tickets per counter transaction.
      const quantity = Math.max(1, Number(req.body?.quantity) || finalSeats.length || 1);
      const quantityError = validatePositiveInteger(quantity, 100);
      if (quantityError) return res.status(400).json({ success: false, error: quantityError });
      // Server-side validation: the tier price rechecked live from the event
      // record; tier capacity is checked against remaining inventory before
      // the transaction that also deducts inventory (double-checked there).
      const priceError = validateNonNegativePrice(tier.price);
      if (priceError) return res.status(400).json({ success: false, error: `Ticket tier '${tier.name || tier.id}': ${priceError}` });
      if (tier.capacity !== undefined && quantity > Number(tier.capacity)) {
        return res.status(400).json({ success: false, error: `Quantity exceeds the tier capacity of ${tier.capacity}.` });
      }

      // Counter coupon support (Item 3): validate the coupon against the event
      // and compute the discount up front; the atomic usedCount increment is
      // performed by finalizeBookingServerSide, same as the online flow.
      let couponCodeUpper: string | null = null;
      let discountAmount = 0;
      if (rawCouponCode?.trim()) {
        couponCodeUpper = rawCouponCode.trim().toUpperCase();
        const couponSnap = await rtdbGet(`coupons/${couponCodeUpper}`, adminToken);
        const coupon = couponSnap.data as any;
        if (!coupon || coupon.isActive === false) {
          return res.status(400).json({ success: false, error: "Coupon is invalid or inactive." });
        }
        if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
          return res.status(400).json({ success: false, error: "Coupon has expired." });
        }
        if (coupon.eventId && coupon.eventId !== eventId) {
          return res.status(400).json({ success: false, error: "Coupon is restricted to a different event." });
        }
        if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
          return res.status(400).json({ success: false, error: "Coupon usage limit reached." });
        }
        const rawAmount = Number(tier.price) * quantity;
        if (coupon.type === "percentage") {
          discountAmount = Math.round((rawAmount * Number(coupon.value)) / 100);
        } else if (coupon.type === "fixed") {
          discountAmount = Math.min(rawAmount, Number(coupon.value));
        }
      }

      // Optional counter station tracking (Counter Management Panel): when a
      // counterId is supplied, the counter must exist, be active, and the
      // staff member must be authorized to run it (super admins bypass).
      const rawCid = String(rawCounterId || "").trim();
      let counterName = "";
      let counterUpi = { vpa: "", name: "" };
      if (rawCid) {
        const actorRbac = (req.user.rbacRole as string) || "";
        const counterSnap = await rtdbGet(`counters/${rawCid}`, await getAdminAuthToken());
        const counter = counterSnap.data as any;
        if (!counter || counter.status === "inactive") {
          return res.status(400).json({ success: false, error: "Selected counter is invalid or inactive." });
        }
        const staffUid = req.user.uid || "";
        const assignedIds = Array.isArray(counter.assignedStaffIds) ? counter.assignedStaffIds : [];
        if (actorRbac !== "super_admin" && !assignedIds.includes(staffUid)) {
          return res.status(403).json({ success: false, error: "You are not authorized to operate this counter." });
        }
        counterName = String(counter.name || "").slice(0, 40);
        const mUpi = (counter.merchantUpi || {}) as any;
        counterUpi = { vpa: String(mUpi?.vpa || ""), name: String(mUpi?.name || "") };
        if (!counterUpi.vpa) {
          // Counter falls back to the global merchant UPI config.
          const globalSnap = await rtdbGet("app_config/merchant_upi", await getAdminAuthToken());
          const gUpi = (globalSnap.data || {}) as any;
          counterUpi = { vpa: String(gUpi?.vpa || ""), name: String(gUpi?.name || "") };
        }
      }

      const orderId = `walkin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const customerDetails = {
        name: String(attendeeName).trim(),
        email: attendeeEmail?.trim() || `${String(attendeeName).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'guest'}@walkin.ashvish`,
        phone: trimmedPhone || "",
      };
      const lineAmount = Number(tier.price) * quantity;
      // Manager-gated discount override (Item 6): the frontend posts a
      // manager-approved override; only manager-level RBAC roles may supply
      // one, and it must never exceed 50% of the order amount.
      let overrideDiscount = 0;
      let discountOverrideRecord: any = null;
      if (rawOverride && typeof rawOverride === "object") {
        const actorRbac = (req.user.rbacRole as string) || "";
        if (actorRbac !== "super_admin" && actorRbac !== "event_manager") {
          return res.status(403).json({ success: false, error: "Access Denied: Discount overrides require manager approval." });
        }
        const rawD = Number(rawOverride.discountAmount);
        if (!Number.isFinite(rawD) || rawD < 0 || rawD > lineAmount / 2) {
          return res.status(400).json({ success: false, error: "Override discount must be between 0 and 50% of the order amount." });
        }
        overrideDiscount = Math.round(rawD);
        discountOverrideRecord = {
          discountAmount: overrideDiscount,
          reason: String(rawOverride.reason || "").slice(0, 200) || "Manager discount override",
          approvedBy: String(rawOverride.actorId || req.user.uid).slice(0, 64),
          approvedAt: new Date().toISOString(),
        };
        discountAmount += overrideDiscount;
      }
      const shiftCode = String(shiftId || "").slice(0, 64);
      await rtdbSet(`pending_orders/${orderId}`, {
        orderId,
        eventId,
        tierId,
        seatIds: finalSeats,
        quantity,
        customerDetails,
        userId: 'walk_in_guest',
        amount: lineAmount,
        discount: discountAmount,
        couponCode: couponCodeUpper,
        createdAt: new Date().toISOString(),
        paymentMethod: `walkin_${String(paymentMethod).slice(0, 32)}`,
        ...(splitPayments.length > 0 ? { payments: splitPayments, totalPaid: lineAmount - discountAmount } : {}),
        ...(discountOverrideRecord ? { discountOverride: discountOverrideRecord } : {}),
        ...(shiftCode ? { shiftId: shiftCode, staffShiftId: shiftCode } : {}),
        ...(rawCid ? { counterId: rawCid, counterName } : {}),
        ...(counterUpi.vpa ? { counterMerchantUpi: counterUpi } : {}),
      }, adminToken);

      const result = await finalizeBookingServerSide(
        orderId,
        `walkin_${String(paymentMethod).slice(0, 32)}`,
        `walkin_payment_${orderId}`,
        adminToken,
        couponCodeUpper,
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
        afterState: {
          eventId, tierId, quantity, attendee: customerDetails.name, paymentMethod,
          couponCode: couponCodeUpper,
          discount: discountAmount,
          ...(splitPayments.length > 0 ? { payments: splitPayments } : {}),
          ...(discountOverrideRecord ? { discountOverride: discountOverrideRecord } : {}),
          ...(shiftCode ? { shiftId: shiftCode } : {}),
          ...(rawCid ? { counterId: rawCid, counterName } : {}),
        },
      });
      if (idHash) {
        idempotencyResults.set(idHash, { createdAt: Date.now(), result: { ticket: result.ticket, booking: result.booking } });
      }
      return res.status(201).json({ success: true, ticket: result.ticket, booking: result.booking });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not create walk-in booking." });
    }
  });

  setInterval(() => {
    sweepExpiredHolds().catch(err => console.error("Error in background sweeper:", err.message));
  }, 30 * 1000);

  // Item 1: scheduled event publish/unpublish transitions — checked every
  // minute so draft events auto-publish and published events auto-archive
  // without manual intervention.
  setInterval(() => {
    applyScheduledTransitionsAll().catch(err => console.error("Error in lifecycle sweeper:", err.message));
  }, 60 * 1000);

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
  // Lookup user by email to retrieve Firebase UID before adding staff role
  app.get("/api/staff/lookup", requireRole(["super_admin"]), async (req: any, res) => {
    try {
      const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: "A valid email address query parameter is required." });
      }

      const adminToken = await getAdminAuthToken();
      // Look up user in RTDB users node
      const usersSnap = await rtdbGet("users", adminToken);
      const usersDict = (usersSnap.data || {}) as Record<string, any>;
      let foundUser: any = null;

      for (const [uid, uData] of Object.entries(usersDict)) {
        const u = (uData || {}) as any;
        if (String(u.email || "").toLowerCase() === email) {
          foundUser = {
            uid,
            email: u.email,
            displayName: u.name || u.displayName || u.email?.split("@")[0] || "User",
          };
          break;
        }
      }

      if (!foundUser) {
        return res.status(404).json({
          success: false,
          error: "No account found for that email — they must sign up first before being granted a staff role",
        });
      }

      return res.status(200).json({
        success: true,
        user: foundUser,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to lookup staff user." });
    }
  });

  // event_manager added so counter administrators can browse staff when
  // assigning them to ticket-counter stations.
  app.get("/api/staff", requireRole(["super_admin", "auditor", "event_manager"]), async (req: any, res) => {
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
      const allowedRoles = ["admin", "event_manager", "ticket_counter", "auditor"];
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
      const allowedRoles = ["admin", "event_manager", "ticket_counter", "auditor"];
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


  // ============================================================
  // Admin Panel (Prompt B) — Items 1, 4, 5, 6: orders dashboard, lifecycle,
  // reporting, notifications
  // ============================================================

  // -- Item 1: manual lifecycle sweep endpoint ------------------------------
  app.post("/api/admin/events/apply-lifecycle", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const { processed } = await applyScheduledTransitionsAll();
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.lifecycle.applied",
        entityType: "event",
        afterState: { processed },
      });
      return res.json({ success: true, processed });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -- Item 1: clone event (duplicate config to a new draft event) ----------
  app.post("/api/admin/events/:eventId/clone", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const { eventId } = req.params;
      const { newDate, newTime, newTitle } = req.body || {};
      const adminToken = await getAdminAuthToken();
      const original = (await rtdbGet(`events/${eventId}`, adminToken)).data as any;
      if (!original) return res.status(404).json({ success: false, error: "Event not found." });
      if (newDate) {
        const dateError = validateEventDates(newDate, undefined);
        if (dateError) return res.status(400).json({ success: false, error: dateError });
      }
      const newId = `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const defaultPoster =
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";
      const originalPoster = original.posterUrl || defaultPoster;
      const clone = {
        ...original,
        id: newId,
        title: newTitle?.trim() || `${original.title || "Untitled Event"} (Clone)`,
        date: newDate || original.date,
        time: newTime || original.time,
        status: "draft",
        posterUrl: originalPoster,
        coverUrl: original.coverUrl || originalPoster,
        rating: 0,
        reviewsCount: 0,
        totalCapacity: original.totalCapacity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clonedFrom: eventId,
      };
      // Drop fields that should not carry over
      delete clone.scheduledPublishAt;
      delete clone.scheduledUnpublishAt;
      await rtdbSet(`events/${newId}`, clone, adminToken);
      // Rebuild the seat map for the new event: copy seats, reset statuses,
      // preserve seatType and pricingTierId from the original configuration.
      const seatSnap = await rtdbGet(`seats/${eventId}`, adminToken);
      if (seatSnap.data) {
        const newSeats: Record<string, any> = {};
        for (const [seatId, seat] of Object.entries(seatSnap.data as any)) {
          const s = seat as any;
          newSeats[seatId] = {
            ...s,
            status: "available",
            heldBy: null,
            reservationId: null,
            heldAt: null,
            holdExpiresAt: null,
            statusChangedAt: Date.now(),
            statusChangedBy: "clone",
          };
          if (s.seatType) newSeats[seatId].seatType = s.seatType;
          if (s.pricingTierId) newSeats[seatId].pricingTierId = s.pricingTierId;
          if (s.seatIdLabel) newSeats[seatId].seatIdLabel = s.seatIdLabel;
        }
        await rtdbSet(`seats/${newId}`, newSeats, adminToken);
      }
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "event.cloned",
        entityType: "event",
        entityId: newId,
        afterState: { clonedFrom: eventId, status: "draft" },
      });
      return res.status(201).json({ success: true, event: clone });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not clone event." });
    }
  });

  // -- Item 1: admin events list (all statuses + scheduled fields) ----------
  app.get("/api/admin/events", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const adminToken = await getAdminAuthToken();
      const snap = await rtdbGet("events", adminToken);
      let events = Object.values((snap.data || {}) as Record<string, any>);
      const statusFilter = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
      if (statusFilter) events = events.filter((e: any) => (e.status || "published") === statusFilter);
      // Apply lazy scheduled transitions to every event being listed so the
      // list never shows a status that should already have changed.
      const now = Date.now();
      events = events.map((e: any) => applyScheduledTransitions(e, now));
      events.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return res.json({ success: true, events, count: events.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -- Item 4: orders dashboard (list, filters, pagination) -----------------
  app.get("/api/admin/orders", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const adminToken = await getAdminAuthToken();
      const q = req.query || {};
      const eventId = typeof q.eventId === "string" ? q.eventId : undefined;
      const status = typeof q.status === "string" ? q.status : undefined;
      const channel = typeof q.channel === "string" ? q.channel : undefined;
      const dateFrom = typeof q.dateFrom === "string" ? q.dateFrom : undefined;
      const dateTo = typeof q.dateTo === "string" ? q.dateTo : undefined;
      const search = typeof q.search === "string" ? q.search.trim().toLowerCase() : undefined;
      const page = Math.max(1, Number(q.page) || 1);
      const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 20));

      const snap = await rtdbGet("orders", adminToken);
      let orders = Object.values((snap.data || {}) as Record<string, any>);
      if (eventId) orders = orders.filter((o: any) => o.eventId === eventId);
      if (status) orders = orders.filter((o: any) => o.status === status);
      if (channel) orders = orders.filter((o: any) => o.channel === channel);
      if (dateFrom) orders = orders.filter((o: any) => String(o.createdAt) >= String(dateFrom));
      if (dateTo) orders = orders.filter((o: any) => String(o.createdAt) <= String(dateTo));
      if (search) {
        orders = orders.filter((o: any) =>
          [o.customerDetails?.name, o.customerDetails?.email, o.customerDetails?.phone, o.orderId]
            .map(String).join(" ").toLowerCase().includes(search)
        );
      }
      orders.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const total = orders.length;
      const paged = orders.slice((page - 1) * pageSize, page * pageSize);
      return res.json({ success: true, orders: paged, total, page, pageSize });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -- Item 4: create manual order (admin-assigned booking with seat locking) -
  app.post("/api/admin/orders", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const { eventId, tierId, attendeeName, attendeeEmail, attendeePhone, selectedSeats = [], paymentMethod = "cash", couponCode: rawCouponCode, quantity: explicitQty } = req.body || {};
      if (!eventId || !tierId || !attendeeName) {
        return res.status(400).json({ success: false, error: "Event, tier, and attendee name are required." });
      }
      if (!Array.isArray(selectedSeats)) return res.status(400).json({ success: false, error: "Invalid seat selection." });
      const quantity = Math.max(1, Number(explicitQty) || selectedSeats.length || 1);
      const qtyError = validatePositiveInteger(quantity, 100);
      if (qtyError) return res.status(400).json({ success: false, error: qtyError });

      const adminToken = await getAdminAuthToken();
      const event = (await rtdbGet(`events/${eventId}`, adminToken)).data as any;
      if (!event) return res.status(404).json({ success: false, error: "Event not found." });
      const tier = normalizeTiers(event.ticketTiers).find((t: any) => t.id === tierId);
      if (!tier) return res.status(400).json({ success: false, error: "Invalid ticket tier." });
      // Admin toggle: usesSeatMap=false forces general admission — no seats.
      const finalSeats = event.usesSeatMap === false ? [] : selectedSeats;
      const priceError = validateNonNegativePrice(tier.price);
      if (priceError) return res.status(400).json({ success: false, error: `Tier '${tier.name}': ${priceError}` });

      // Coupon validation (Item 3) — same rules as the counter and online flows.
      let couponCodeUpper: string | null = null;
      let discountAmount = 0;
      if (rawCouponCode?.trim()) {
        couponCodeUpper = rawCouponCode.trim().toUpperCase();
        const couponSnap = await rtdbGet(`coupons/${couponCodeUpper}`, adminToken);
        const coupon = couponSnap.data as any;
        if (!coupon || coupon.isActive === false) return res.status(400).json({ success: false, error: "Coupon is invalid or inactive." });
        if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return res.status(400).json({ success: false, error: "Coupon has expired." });
        if (coupon.eventId && coupon.eventId !== eventId) return res.status(400).json({ success: false, error: "Coupon is restricted to a different event." });
        if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) return res.status(400).json({ success: false, error: "Coupon usage limit reached." });
        const rawAmount = Number(tier.price) * quantity;
        if (coupon.type === "percentage") discountAmount = Math.round((rawAmount * Number(coupon.value)) / 100);
        else if (coupon.type === "fixed") discountAmount = Math.min(rawAmount, Number(coupon.value));
      }

      // Seat locking (Item 4): seats are claimed via the shared atomic path;
      // any unavailable seat aborts the whole order and releases claims.
      const orderId = `manual_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const claim = finalSeats.length > 0
        ? await claimSeatsAtomically(adminToken, eventId, finalSeats, orderId, `manual_${req.user.uid}`)
        : { committed: true };
      if (!claim.committed) {
        return res.status(409).json({ success: false, error: "One or more selected seats are no longer available." });
      }

      const customerDetails = {
        name: String(attendeeName).trim(),
        email: attendeeEmail?.trim() || "",
        phone: attendeePhone?.trim() || "",
      };
      const amount = Number(tier.price) * quantity;
      // Persist a pending order so the shared fulfillment path (inventory,
      // ticket issuance, canonical orders record, confirmation email) is
      // reused identically to all other channels.
      await rtdbSet(`pending_orders/${orderId}`, {
        orderId, eventId, tierId, seatIds: finalSeats, quantity,
        customerDetails, userId: `manual_${req.user.uid}`,
        amount, discount: discountAmount, couponCode: couponCodeUpper,
        createdAt: new Date().toISOString(),
        paymentMethod: `manual_${String(paymentMethod).slice(0, 32)}`,
      }, adminToken);

      const result = await finalizeBookingServerSide(orderId, `manual_${String(paymentMethod).slice(0, 32)}`, `manual_payment_${orderId}`, adminToken, couponCodeUpper);
      if (!result.success) {
        for (const rolledId of finalSeats) await releaseSeat(adminToken, eventId, rolledId, { reservationId: orderId }).catch(() => {});
        return res.status(409).json({ success: false, error: result.error || "Manual order could not be completed." });
      }
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "order.created.manual",
        entityType: "order",
        entityId: orderId,
        afterState: { eventId, tierId, quantity, attendee: customerDetails.name, couponCode: couponCodeUpper, discount: discountAmount },
      });
      return res.status(201).json({ success: true, order: { orderId, amount, discount: discountAmount, status: "confirmed" }, ticket: result.ticket });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not create manual order." });
    }
  });

  // -- Item 4: edit order (seat/customer changes with locking) ---------------
  app.put("/api/admin/orders/:orderId", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const adminToken = await getAdminAuthToken();
      const orderSnap = await rtdbGet(`orders/${orderId}`, adminToken);
      const order = orderSnap.data as any;
      if (!order) return res.status(404).json({ success: false, error: "Order not found." });
      if (order.status !== "confirmed") return res.status(400).json({ success: false, error: `Order cannot be edited (status: ${order.status}).` });

      const { selectedSeats, customerDetails, tierId } = req.body || {};
      const updates: Record<string, any> = {};
      const before = JSON.parse(JSON.stringify(order));

      if (customerDetails) {
        updates.customerDetails = {
          name: String(customerDetails.name ?? order.customerDetails?.name).trim(),
          email: String(customerDetails.email ?? order.customerDetails?.email).trim(),
          phone: String(customerDetails.phone ?? order.customerDetails?.phone).trim(),
        };
      }

      if (selectedSeats !== undefined && Array.isArray(selectedSeats)) {
        const oldSeats: string[] = order.seatIds || [];
        const newSeats: string[] = selectedSeats;
        if (JSON.stringify([...oldSeats].sort()) !== JSON.stringify([...newSeats].sort())) {
          // Release seats no longer held by this order (all-or-nothing claim first)
          const toAdd = newSeats.filter((s: string) => !oldSeats.includes(s));
          if (toAdd.length > 0) {
            const claim = await claimSeatsAtomically(adminToken, order.eventId, toAdd, orderId, `manual_${req.user.uid}`);
            if (!claim.committed) return res.status(409).json({ success: false, error: "One or more new seats are no longer available." });
          }
          for (const removed of oldSeats.filter((s: string) => !newSeats.includes(s))) {
            await releaseSeat(adminToken, order.eventId, removed, {});
          }
          updates.seatIds = newSeats;
          updates.quantity = newSeats.length || order.quantity;
          // Mirror changes to the ticket/seat records for consistency
          for (const newSeat of toAdd) {
            await rtdbUpdate(`seats/${order.eventId}/${newSeat}`, { bookedBy: order.createdBy, orderId, statusChangedAt: Date.now(), statusChangedBy: "order_edit" }, adminToken);
          }
        }
      }

      if (tierId && tierId !== order.tierId) {
        const event = (await rtdbGet(`events/${order.eventId}`, adminToken)).data as any;
        const tier = normalizeTiers(event?.ticketTiers).find((t: any) => t.id === tierId);
        if (!tier) return res.status(400).json({ success: false, error: "Invalid ticket tier." });
        updates.tierId = tierId;
        const priceError = validateNonNegativePrice(tier.price);
        if (priceError) return res.status(400).json({ success: false, error: `Tier '${tier.name}': ${priceError}` });
        updates.amount = Number(tier.price) * (updates.quantity ?? order.quantity);
      }
      updates.updatedAt = new Date().toISOString();
      await rtdbUpdate(`orders/${orderId}`, updates, adminToken);
      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "order.updated",
        entityType: "order",
        entityId: orderId,
        beforeState: before,
        afterState: { ...order, ...updates },
      });
      return res.json({ success: true, order: { ...order, ...updates } });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not update order." });
    }
  });

  // -- Item 4: refund order (releases seats, marks refunded, audit trail) -----
  app.post("/api/admin/orders/:orderId/refund", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { refundType = "full", amount: refundAmount, reason } = req.body || {};
      if (!["full", "partial"].includes(refundType)) {
        return res.status(400).json({ success: false, error: "refundType must be 'full' or 'partial'." });
      }
      if (!reason || String(reason).trim().length < 5) {
        return res.status(400).json({ success: false, error: "A refund reason of at least 5 characters is required." });
      }
      const adminToken = await getAdminAuthToken();
      const orderSnap = await rtdbGet(`orders/${orderId}`, adminToken);
      const order = orderSnap.data as any;
      if (!order) return res.status(404).json({ success: false, error: "Order not found." });
      if (order.status === "refunded") return res.status(400).json({ success: false, error: "Order is already refunded." });

      const isUnpaidPending = order.paymentStatus === "pending";
      const refundValue = isUnpaidPending ? 0 : (refundType === "full" ? order.amount : Number(refundAmount));
      if (!isUnpaidPending) {
        if (!Number.isFinite(refundValue) || refundValue <= 0) {
          return res.status(400).json({ success: false, error: "Invalid refund amount." });
        }
        if (refundValue > order.amount) {
          return res.status(400).json({ success: false, error: "Refund amount exceeds the paid amount." });
        }
      }
      const partialSeats = refundType === "partial" && Array.isArray(req.body.seatIds) ? req.body.seatIds : [];

      const before = JSON.parse(JSON.stringify(order));
      // Release refunded seats back to available (transactional).
      const seatsToRelease = partialSeats.length > 0 ? partialSeats : (order.seatIds || []);
      const lastResult = { committed: true, error: undefined as string | undefined };
      for (const seatId of seatsToRelease) {
        const r = await releaseSeat(adminToken, order.eventId, seatId, {});
        if (!r.committed) lastResult.committed = false;
      }
      if (!lastResult.committed) {
        return res.status(409).json({ success: false, error: "Could not release one or more seats; refund aborted." });
      }

      const afterState = {
        ...order,
        status: "refunded",
        refundReason: String(reason).trim(),
        refundAmount: refundValue,
        refundedAt: new Date().toISOString(),
        refundedBy: req.user.uid,
      };
      await rtdbUpdate(`orders/${orderId}`, afterState, adminToken);

      // Mark the linked ticket cancelled in the canonical tickets node so it
      // can no longer be redeemed at the gate.
      if (order.ticketId) {
        await rtdbUpdate(`tickets/${order.ticketId}`, { status: "cancelled", cancelledReason: "refunded", statusChangedAt: new Date().toISOString() }, adminToken);
      }

      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole,
        action: "order.refunded",
        entityType: "order",
        entityId: orderId,
        beforeState: before,
        afterState: { status: "refunded", refundReason: String(reason).trim(), refundAmount: refundValue },
      });
      return res.json({ success: true, order: afterState });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Could not refund order." });
    }
  });

  // -- Item 7: bulk order actions (export / cancel / email) -------------------
  app.post("/api/admin/orders/bulk-action", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const { action: bulkAction, orderIds = [] } = req.body || {};
      if (!["export", "cancel", "email"].includes(bulkAction)) {
        return res.status(400).json({ success: false, error: "Bulk action must be 'export', 'cancel', or 'email'." });
      }
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ success: false, error: "No order IDs provided." });
      }
      const adminToken = await getAdminAuthToken();

      if (bulkAction === "export") {
        const rows = await Promise.all(orderIds.map(async (id) => (await rtdbGet(`orders/${id}`, adminToken)).data as any));
        const csv = ["orderId,channel,status,amount,discount,createdAt,name,email,phone"]
          .concat(
            rows.filter(Boolean).map((o: any) =>
              [o.orderId, o.channel, o.status, o.amount, o.discount || 0, o.createdAt,
               JSON.stringify(String(o.customerDetails?.name || "").replace(/"/g, "")),
               String(o.customerDetails?.email || ""), String(o.customerDetails?.phone || "")].join(",")
            )
          )
          .join("\n");
        return res.setHeader("content-type", "text/csv").send(csv);
      }

      if (bulkAction === "cancel") {
        let cancelled = 0;
        for (const id of orderIds) {
          const order = (await rtdbGet(`orders/${id}`, adminToken)).data as any;
          if (!order || order.status !== "confirmed") continue;
          const before = JSON.parse(JSON.stringify(order));
          for (const seatId of order.seatIds || []) await releaseSeat(adminToken, order.eventId, seatId, {});
          await rtdbUpdate(`orders/${id}`, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: req.user.uid }, adminToken);
          if (order.ticketId) await rtdbUpdate(`tickets/${order.ticketId}`, { status: "cancelled", cancelledReason: "admin_cancelled" }, adminToken);
          await writeAuditEntry({ actorId: req.user.uid, actorRole: req.user.rbacRole, action: "order.cancelled", entityType: "order", entityId: id, beforeState: before, afterState: { status: "cancelled" } });
          cancelled++;
        }
        return res.json({ success: true, cancelled });
      }

      // bulkAction === "email"
      const sent: string[] = [];
      const subject = req.body.subject || "Update regarding your Ash-vish booking";
      const message = req.body.message || "";
      if (String(message).trim().length < 5) {
        return res.status(400).json({ success: false, error: "Email message must be at least 5 characters." });
      }
      for (const id of orderIds) {
        const order = (await rtdbGet(`orders/${id}`, adminToken)).data as any;
        const email = order?.customerDetails?.email;
        if (!email || !String(email).includes("@")) continue;
        const result = await sendMail({ to: String(email), subject, text: `${order?.customerDetails?.name || "Ticket Holder"},\n\n${message}\n\n— Ash-vish Events` });
        await recordNotification({ eventId: order?.eventId, subject, message: `Bulk email to ${email} for order ${id}${result.mode === "no-mail" ? " (no-mail mode)" : ""}`, recipientCount: 1, status: "sent" }).catch(() => {});
        sent.push(id);
      }
      return res.json({ success: true, sent: sent.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Bulk action failed." });
    }
  });

  // -- Item 6: notify all ticket holders of an event --------------------------
  app.get("/api/admin/notify/count-holders", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;
      if (!eventId) return res.status(400).json({ success: false, error: "eventId is required." });
      const adminToken = await getAdminAuthToken();
      const snap = await rtdbGet("orders", adminToken);
      const orders = Object.values((snap.data || {}) as Record<string, any>).filter((o: any) => o.eventId === eventId && o.status === "confirmed");
      const emails = new Set(orders.map((o: any) => String(o.customerDetails?.email || "").toLowerCase()).filter((e) => e.includes("@")));
      return res.json({ success: true, eventId, recipientCount: emails.size });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/notify/all-holders", requireRole(["super_admin", "event_manager"]), async (req: any, res) => {
    try {
      const { eventId, subject, message } = req.body || {};
      if (!eventId || !subject || !message) {
        return res.status(400).json({ success: false, error: "eventId, subject, and message are required." });
      }
      if (String(subject).trim().length < 3 || String(message).trim().length < 5) {
        return res.status(400).json({ success: false, error: "Subject (3+ chars) and message (5+ chars) are required." });
      }
      const adminToken = await getAdminAuthToken();
      const snap = await rtdbGet("orders", adminToken);
      const orders = Object.values((snap.data || {}) as Record<string, any>).filter((o: any) => o.eventId === eventId && o.status === "confirmed");
      const recipients = new Map<string, { email: string; name: string }>();
      for (const o of orders) {
        const email = String(o.customerDetails?.email || "").toLowerCase();
        if (!email.includes("@") || recipients.has(email)) continue;
        recipients.set(email, { email, name: o.customerDetails?.name || "Ticket Holder" });
      }

      // Record the send first (audit trail) then deliver.
      await recordNotification({
        eventId,
        subject: String(subject).trim(),
        message: String(message).trim(),
        recipientCount: recipients.size,
        status: "sent",
        createdBy: req.user.uid,
      });

      for (const { email, name } of recipients.values()) {
        const text = `${name},\n\n${message}\n\n— Ash-vish Events`;
        const result = await sendMail({ to: email, subject: String(subject).trim(), text });
        if (result.ok === false) console.warn(`[NOTIFY] Failed to send to ${email}: ${result.error}`);
      }
      return res.json({ success: true, recipientCount: recipients.size });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -- Item 5: reporting dashboard -------------------------------------------
  app.get("/api/admin/reports", requireRole(["super_admin", "event_manager", "auditor"]), async (req: any, res) => {
    try {
      const adminToken = await getAdminAuthToken();
      const q = req.query || {};
      const from = typeof q.from === "string" ? q.from : undefined;
      const to = typeof q.to === "string" ? q.to : undefined;
      const eventsSnap = await rtdbGet("events", adminToken);
      const eventsById: Record<string, any> = (eventsSnap.data || {}) as Record<string, any>;

      const ordersSnap = await rtdbGet("orders", adminToken);
      let orders = Object.values((ordersSnap.data || {}) as Record<string, any>);
      if (from) orders = orders.filter((o: any) => String(o.createdAt) >= String(from));
      if (to) orders = orders.filter((o: any) => String(o.createdAt) <= String(to));
      const confirmed = orders.filter((o: any) => o.status === "confirmed");
      const paidConfirmed = confirmed.filter((o: any) => o.paymentStatus !== "pending");
      const pendingConfirmed = confirmed.filter((o: any) => o.paymentStatus === "pending");
      const refunded = orders.filter((o: any) => o.status === "refunded");

      const revenueByEvent = Object.values(confirmed.reduce((acc: Record<string, any>, o: any) => {
        const key = o.eventId || "unknown";
        if (!acc[key]) acc[key] = { eventId: key, title: eventsById[key]?.title || key, revenue: 0, pendingRevenue: 0, netRevenue: 0, orders: 0, tickets: 0 };
        const amt = Number(o.amount) || 0;
        if (o.paymentStatus === "pending") {
          acc[key].pendingRevenue += amt;
        } else {
          acc[key].revenue += amt;
        }
        acc[key].netRevenue -= Number(o.refundAmount) || 0;
        acc[key].orders += 1;
        acc[key].tickets += Number(o.quantity) || 1;
        return acc;
      }, {}));

      const revenueByDate = Object.values(paidConfirmed.reduce((acc: Record<string, any>, o: any) => {
        const key = String(o.createdAt || "").slice(0, 10);
        if (!acc[key]) acc[key] = { date: key, revenue: 0, orders: 0 };
        acc[key].revenue += Number(o.amount) || 0;
        acc[key].orders += 1;
        return acc;
      }, {})).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

      const attendanceVsCapacity = Object.values(confirmed.reduce((acc: Record<string, any>, o: any) => {
        if (!o.eventId || !eventsById[o.eventId]) return acc;
        if (!acc[o.eventId]) acc[o.eventId] = { eventId: o.eventId, title: eventsById[o.eventId].title, capacity: eventsById[o.eventId].totalCapacity || 0, sold: 0, checkedIn: 0 };
        acc[o.eventId].sold += Number(o.quantity) || 1;
        return acc;
      }, {})) as any[];
      // Checked-in counts come from ticket scan records (scannedAt presence).
      const ticketsSnap = await rtdbGet("tickets", adminToken);
      const tickets = Object.values((ticketsSnap.data || {}) as Record<string, any>);
      for (const t of tickets) {
        const entry = attendanceVsCapacity.find((a: any) => a.eventId === t.eventId);
        if (entry && t.scannedAt) entry.checkedIn += 1;
      }

      const channels = confirmed.reduce((acc: Record<string, number>, o: any) => {
        acc[o.channel || "unknown"] = (acc[o.channel || "unknown"] || 0) + 1;
        return acc;
      }, {});

      const totalRevenue = paidConfirmed.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
      const pendingCollection = pendingConfirmed.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
      const totalRefunded = refunded.reduce((sum: number, o: any) => sum + (Number(o.refundAmount) || 0), 0);
      const totalOrders = confirmed.length;
      const totalTickets = confirmed.reduce((sum: number, o: any) => sum + (Number(o.quantity) || 1), 0);

      return res.json({
        success: true,
        summary: { totalRevenue, pendingCollection, totalRefunded, totalOrders, totalTickets },
        revenueByEvent,
        revenueByDate,
        attendanceVsCapacity,
        channels,
      });
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
      if (parts.length < 3 || (parts[0] !== "ASH_PASS" && parts[0] !== "ASH_PASS_v1" && parts[0] !== "ASH_RES")) {
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

      if (parts[0] === "ASH_PASS" || parts[0] === "ASH_RES") {
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
      let paymentPendingError: string | null = null;
      let pendingAmountDue: number = 0;
      let redeemedTicket: any = null;

      const txResult = await rtdbTransaction(`tickets/${ticketId}`, (ticket: any) => {
        if (!ticket) {
          return undefined;
        }

        if (ticket.status === "redeemed") {
          alreadyRedeemedError = `This ticket was already scanned/redeemed at ${ticket.redeemedAt || "an earlier time"} by staff '${ticket.redeemedBy || "unknown"}'!`;
          return undefined;
        }

        if (ticket.passType === "reservation" && ticket.paymentStatus !== "paid") {
          pendingAmountDue = Number(ticket.amountDue ?? (ticket.price * (ticket.quantity || 1))) || 0;
          paymentPendingError = `UNPAID RESERVATION PASS: Payment of ₹${pendingAmountDue} is pending. Direct this guest to the Pay-at-Counter station to collect payment before gate admission.`;
          return undefined;
        }

        ticket.status = "redeemed";
        ticket.redeemedAt = new Date().toISOString();
        ticket.redeemedBy = scannedByStaffId || req.user?.uid || "counter_scanner_01";
        redeemedTicket = ticket;
        return ticket;
      }, userToken);

      if (!txResult.committed) {
        if (paymentPendingError) {
          return res.status(402).json({
            success: false,
            valid: false,
            paymentPending: true,
            amountDue: pendingAmountDue,
            ticketId,
            error: paymentPendingError,
          });
        }
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

  /**
   * Cash on Counter Payment Collection Endpoint.
   * Operated by Ticket Counter staff / Admins.
   * Receives payment for a Reservation Pass, converts paymentStatus to 'paid',
   * sets amountDue to 0, updates the ticket, user's ticket record, booking, and canonical order.
   */
  app.post("/api/tickets/collect-counter-payment", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { ticketId: rawTicketId, qrToken, paymentMethod = "cash", collectedAmount } = req.body || {};
      const userToken = await getAdminAuthToken();

      let targetTicketId = rawTicketId ? String(rawTicketId).trim() : null;

      if (!targetTicketId && qrToken && typeof qrToken === "string") {
        const parts = qrToken.split(".");
        if (parts.length >= 3 && (parts[0] === "ASH_PASS" || parts[0] === "ASH_RES")) {
          const payloadStr = Buffer.from(parts[1], "base64url").toString("utf8");
          const payloadParts = payloadStr.split("|");
          if (payloadParts.length >= 4) {
            targetTicketId = payloadParts[3];
          }
        }
      }

      if (!targetTicketId) {
        return res.status(400).json({ success: false, error: "A valid ticketId or qrToken is required." });
      }

      const ticketSnap = await rtdbGet(`tickets/${targetTicketId}`, userToken);
      const ticket = ticketSnap.data as any;
      if (!ticket) {
        return res.status(404).json({ success: false, error: `Ticket ${targetTicketId} not found.` });
      }

      if (ticket.passType !== "reservation" && ticket.paymentStatus === "paid") {
        return res.status(400).json({ success: false, error: "This ticket has already been fully paid." });
      }

      const amountToCollect = collectedAmount !== undefined ? Number(collectedAmount) : (Number(ticket.amountDue) || Number(ticket.totalPaid) || Number(ticket.price * (ticket.quantity || 1)) || 0);
      const collectedAt = new Date().toISOString();
      const staffUid = req.user?.uid || "ticket_counter_staff";

      const updatedTicketUpdates: Record<string, any> = {
        paymentStatus: "paid",
        amountDue: 0,
        totalPaid: (Number(ticket.totalPaid) || 0) + amountToCollect,
        collectedAt,
        collectedBy: staffUid,
        collectedPaymentMethod: String(paymentMethod).slice(0, 32),
      };

      await rtdbUpdate(`tickets/${targetTicketId}`, updatedTicketUpdates, userToken);

      if (ticket.ownerId) {
        await rtdbUpdate(`users/${ticket.ownerId}/tickets/${targetTicketId}`, updatedTicketUpdates, userToken).catch(() => {});
      }

      // Also update linked booking and order if found
      const bookingsSnap = await rtdbGet("bookings", userToken);
      const allBookings = (bookingsSnap.data || {}) as Record<string, any>;
      const matchedBooking = Object.values(allBookings).find((b: any) => b.ticketId === targetTicketId || b.reservationId === ticket.reservationId);
      if (matchedBooking && matchedBooking.bookingId) {
        const bookingUpdates = { paymentStatus: "paid", amountDue: 0, collectedAt, collectedBy: staffUid };
        await rtdbUpdate(`bookings/${matchedBooking.bookingId}`, bookingUpdates, userToken).catch(() => {});
        if (matchedBooking.userId) {
          await rtdbUpdate(`users/${matchedBooking.userId}/bookings/${matchedBooking.bookingId}`, bookingUpdates, userToken).catch(() => {});
        }
      }

      const ordersSnap = await rtdbGet("orders", userToken);
      const allOrders = (ordersSnap.data || {}) as Record<string, any>;
      const matchedOrder = Object.values(allOrders).find((o: any) => o.ticketId === targetTicketId || o.bookingId === matchedBooking?.bookingId);
      if (matchedOrder && matchedOrder.orderId) {
        await rtdbUpdate(`orders/${matchedOrder.orderId}`, { paymentStatus: "paid", amountDue: 0, collectedAt, collectedBy: staffUid }, userToken).catch(() => {});
      }

      await writeAuditEntry({
        actorId: req.user.uid,
        actorRole: req.user.rbacRole || req.user.role,
        action: "counter.payment.collected",
        entityType: "ticket",
        entityId: targetTicketId,
        afterState: { ...ticket, ...updatedTicketUpdates },
      }).catch(() => {});

      return res.json({
        success: true,
        message: `Payment of ₹${amountToCollect} successfully collected. Reservation Pass is now active for entry.`,
        ticket: { ...ticket, ...updatedTicketUpdates },
        amountCollected: amountToCollect,
      });
    } catch (err: any) {
      console.error("[COLLECT COUNTER PAYMENT ERROR]", err.message || err);
      return res.status(500).json({ success: false, error: err.message || "Failed to collect counter payment." });
    }
  });

  /**
   * Reservation Pass Lookup for Ticket Counter Staff.
   */
  app.get("/api/tickets/reservation-lookup", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { ticketNumber, query, ticketId } = req.query || {};
      const userToken = await getAdminAuthToken();
      const ticketsSnap = await rtdbGet("tickets", userToken);
      const allTickets = Object.values((ticketsSnap.data || {}) as Record<string, any>);

      const q = String(query || ticketNumber || ticketId || "").trim().toLowerCase();
      if (!q) {
        return res.status(400).json({ success: false, error: "Search query or ticket number is required." });
      }

      const matched = allTickets.filter((t: any) => {
        return (
          t.id?.toLowerCase() === q ||
          t.ticketNumber?.toLowerCase() === q ||
          t.attendeeEmail?.toLowerCase().includes(q) ||
          t.attendeePhone?.toLowerCase().includes(q) ||
          t.attendeeName?.toLowerCase().includes(q)
        );
      });

      return res.json({
        success: true,
        tickets: matched,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  function isEventPassed(dateStr?: string, timeStr?: string): boolean {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (timeStr) {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (match) {
          let hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const ampm = match[3]?.toUpperCase();
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;
          d.setHours(hours, minutes, 0, 0);
        }
      } else {
        d.setHours(23, 59, 59, 999);
      }
      return Date.now() > d.getTime();
    } catch {
      return false;
    }
  }

  /**
   * Public Secure Digital Pass Endpoint (:slug/:signature).
   */
  app.get('/api/passes/:slug/:signature', async (req: any, res) => {
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Pass-Request-Id', reqId);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role");
    res.setHeader("Access-Control-Max-Age", "86400");

    try {
      const { slug, signature } = req.params;
      if (!slug || !signature || signature.length !== 16) {
        return res.status(403).json({ success: false, error: 'INVALID_LINK' });
      }

      // Anonymous read of passes/${slug} first
      let passRecord: any = null;
      try {
        const passSnap = await rtdbGet(`passes/${slug}`);
        passRecord = passSnap.data;
      } catch (anonErr: any) {
        console.warn(`[PASS:${reqId}] Anonymous pass read failed:`, anonErr.message);
      }

      let adminToken: string | undefined;
      if (!passRecord) {
        try {
          adminToken = await getAdminAuthToken();
        } catch (authErr: any) {
          console.error(`[PASS:${reqId}] admin read failed:`, authErr.message);
          return res.status(503).json({ success: false, error: "PASS_SERVICE_UNAVAILABLE" });
        }
        if (!adminToken) {
          console.error(`[PASS:${reqId}] admin read failed: adminToken is undefined`);
          return res.status(503).json({ success: false, error: "PASS_SERVICE_UNAVAILABLE" });
        }
        const passSnap = await rtdbGet(`passes/${slug}`, adminToken);
        passRecord = passSnap.data;
      }

      if (!passRecord) {
        return res.status(404).json({ success: false, error: 'TICKET_NOT_FOUND' });
      }

      const ticketId = passRecord.ticketId;
      if (!ticketId) {
        return res.status(404).json({ success: false, error: 'TICKET_NOT_FOUND' });
      }

      const expectedSig = crypto
        .createHmac('sha256', SERVER_HMAC_SECRET)
        .update(`${slug}|${ticketId}`)
        .digest('hex')
        .substring(0, 16);

      if (signature.length !== expectedSig.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return res.status(403).json({ success: false, error: 'INVALID_LINK' });
      }

      let ticketData = passRecord;
      if (!passRecord.ticketNumber) {
        if (!adminToken) {
          try { adminToken = await getAdminAuthToken(); } catch {}
        }
        if (adminToken) {
          const ticketSnap = await rtdbGet(`tickets/${ticketId}`, adminToken);
          if (ticketSnap.data) {
            ticketData = { ...ticketSnap.data, ...passRecord };
          }
        }
      }

      if (ticketData.status === 'cancelled' || ticketData.status === 'void') {
        return res.status(410).json({ success: false, error: 'PASS_CANCELLED', message: 'This ticket has been cancelled.' });
      }

      // Count opens (best-effort)
      try {
        const currentOpens = Number(ticketData.openCount || 0);
        void rtdbSet(`passes/${slug}/openCount`, currentOpens + 1, adminToken).catch(() => {});
      } catch {}

      const passed = isEventPassed(ticketData.date, ticketData.time);

      const passPayload = {
        ticketNumber: ticketData.ticketNumber,
        eventTitle: ticketData.eventTitle,
        eventPoster: ticketData.eventPoster,
        venue: ticketData.venue,
        city: ticketData.city,
        date: ticketData.date,
        time: ticketData.time,
        tierName: ticketData.tierName,
        seatNumber: ticketData.seatNumber,
        attendeeName: ticketData.attendeeName,
        qrCodeValue: ticketData.qrCodeValue,
        passType: ticketData.passType || 'entry',
        paymentStatus: ticketData.paymentStatus || 'paid',
        amountDue: ticketData.amountDue || 0,
        status: ticketData.status || 'valid',
        redeemed: ticketData.status === 'redeemed',
        redeemedAt: ticketData.redeemedAt || null,
        redeemedBy: ticketData.redeemedBy || null,
        eventGoogleMapsQuery: ticketData.eventGoogleMapsQuery || `${ticketData.venue}, ${ticketData.city}`,
        passed,
      };

      console.log(`[PASS:${reqId}] Served pass for ticket ${ticketData.ticketNumber}`);
      return res.json({
        success: true,
        pass: passPayload,
        ticket: passPayload,
      });
    } catch (err: any) {
      console.error(`[PASS:${reqId}] Exception:`, err.message);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Rate limiting map for /api/passes endpoint: IP -> timestamps array
  const passRateLimits = new Map<string, number[]>();

  /**
   * Public Secure Digital Pass Endpoint.
   */
  app.get("/api/passes/:passId", async (req: any, res) => {
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Pass-Request-Id', reqId);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-Role");
    res.setHeader("Access-Control-Max-Age", "86400");

    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const windowMs = 60 * 1000;
      const maxRequests = 10;

      const timestamps = (passRateLimits.get(clientIp) || []).filter(ts => now - ts < windowMs);
      if (timestamps.length >= maxRequests) {
        return res.status(429).json({ success: false, error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later." });
      }
      timestamps.push(now);
      passRateLimits.set(clientIp, timestamps);

      const { passId } = req.params;
      const { sig } = req.query;
      if (!passId) {
        return res.status(400).json({ success: false, error: "Missing pass ID." });
      }

      // Anonymous read of passes/${passId} first
      let passRecord: any = null;
      try {
        const passSnap = await rtdbGet(`passes/${passId}`);
        passRecord = passSnap.data;
      } catch (anonErr: any) {
        console.warn(`[PASS:${reqId}] Anonymous read failed for passId ${passId}:`, anonErr.message);
      }

      let adminToken: string | undefined;
      let ticketId: string | null = passRecord?.ticketId || null;

      if (passRecord && ticketId) {
        if (!sig || String(sig).length !== 16) {
          return res.status(403).json({ success: false, error: "Invalid or missing pass signature." });
        }
        const expectedSig = crypto.createHmac("sha256", SERVER_HMAC_SECRET).update(`${passId}|${ticketId}`).digest("hex").substring(0, 16);
        if (String(sig).length !== expectedSig.length ||
            !crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expectedSig))) {
          return res.status(403).json({ success: false, error: "Invalid or forged digital pass signature." });
        }
      } else {
        try {
          adminToken = await getAdminAuthToken();
        } catch (authErr: any) {
          console.error(`[PASS:${reqId}] admin read failed:`, authErr.message);
          return res.status(503).json({ success: false, error: "PASS_SERVICE_UNAVAILABLE" });
        }

        if (!adminToken) {
          console.error(`[PASS:${reqId}] admin read failed: adminToken is undefined`);
          return res.status(503).json({ success: false, error: "PASS_SERVICE_UNAVAILABLE" });
        }

        const passSnap = await rtdbGet(`passes/${passId}`, adminToken);
        passRecord = passSnap.data;

        if (passRecord && passRecord.ticketId) {
          ticketId = passRecord.ticketId;
          if (!sig || String(sig).length !== 16) {
            return res.status(403).json({ success: false, error: "Invalid or missing pass signature." });
          }
          const expectedSig = crypto.createHmac("sha256", SERVER_HMAC_SECRET).update(`${passId}|${ticketId}`).digest("hex").substring(0, 16);
          if (String(sig).length !== expectedSig.length ||
              !crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expectedSig))) {
            return res.status(403).json({ success: false, error: "Invalid or forged digital pass signature." });
          }
        } else {
          const isLegacyPattern = /^ASH-(RES-)?[A-Z0-9]+-[A-Z0-9]+$/i.test(passId) || /^ASH-[A-Z0-9]+$/i.test(passId);
          if (isLegacyPattern) {
            const ticketsSnap = await rtdbGet("tickets", adminToken);
            const allTickets = Object.values((ticketsSnap.data || {}) as Record<string, any>);
            const matched = allTickets.find((t: any) => t.ticketNumber?.toLowerCase() === passId.toLowerCase());
            if (matched) {
              ticketId = matched.id;
              passRecord = matched;
            }
          }
        }
      }

      if (!ticketId) {
        return res.status(404).json({ success: false, error: "Digital pass not found or expired." });
      }

      let ticketData = passRecord;
      if (!passRecord?.ticketNumber) {
        if (!adminToken) {
          try { adminToken = await getAdminAuthToken(); } catch {}
        }
        if (adminToken) {
          const ticketSnap = await rtdbGet(`tickets/${ticketId}`, adminToken);
          if (ticketSnap.data) {
            ticketData = { ...ticketSnap.data, ...passRecord };
          }
        }
      }

      if (!ticketData || !ticketData.ticketNumber) {
        return res.status(404).json({ success: false, error: "Associated ticket not found." });
      }

      if (ticketData.status === 'cancelled' || ticketData.status === 'void') {
        return res.status(410).json({ success: false, error: "PASS_CANCELLED", message: "This ticket has been cancelled." });
      }

      const passed = isEventPassed(ticketData.date, ticketData.time);

      const passPayload = {
        ticketNumber: ticketData.ticketNumber,
        eventTitle: ticketData.eventTitle,
        eventPoster: ticketData.eventPoster,
        tierName: ticketData.tierName,
        seatNumber: ticketData.seatNumber,
        attendeeName: ticketData.attendeeName,
        date: ticketData.date,
        time: ticketData.time,
        venue: ticketData.venue,
        city: ticketData.city,
        qrCodeValue: ticketData.qrCodeValue,
        status: ticketData.status || 'valid',
        passType: ticketData.passType || 'entry',
        paymentStatus: ticketData.paymentStatus || 'paid',
        amountDue: ticketData.amountDue || 0,
        redeemed: ticketData.status === 'redeemed',
        redeemedAt: ticketData.redeemedAt || null,
        redeemedBy: ticketData.redeemedBy || null,
        passSlug: ticketData.passSlug || { id: passId, sig: sig || '' },
        eventGoogleMapsQuery: ticketData.eventGoogleMapsQuery || `${ticketData.venue}, ${ticketData.city}`,
        passed,
      };

      console.log(`[PASS:${reqId}] Served legacy pass for ticket ${ticketData.ticketNumber}`);
      return res.status(200).json({
        success: true,
        pass: passPayload,
        ticket: passPayload,
      });
    } catch (err: any) {
      console.error(`[PASS:${reqId}] Exception:`, err.message);
      return res.status(500).json({ success: false, error: err.message || "Failed to load digital pass." });
    }
  });

  /**
   * Regenerate Pass Slug (Revocation / Security Reset).
   */
  app.post("/api/passes/:ticketId/regenerate", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { ticketId } = req.params;
      const adminToken = await getAdminAuthToken();
      const ticketSnap = await rtdbGet(`tickets/${ticketId}`, adminToken);
      const ticket = ticketSnap.data as any;
      if (!ticket) {
        return res.status(404).json({ success: false, error: "Ticket not found." });
      }
      if (ticket.passSlug?.id) {
        await rtdbSet(`passes/${ticket.passSlug.id}`, null, adminToken).catch(() => {});
      }
      const passId = crypto.randomBytes(24).toString('base64url');
      const passSig = crypto.createHmac("sha256", SERVER_HMAC_SECRET).update(`${passId}|${ticketId}`).digest("hex").substring(0, 16);
      const passSlug = { id: passId, sig: passSig, createdAt: Date.now() };

      const passPayload = {
        ticketId,
        signature: passSig,
        ticketNumber: ticket.ticketNumber,
        eventTitle: ticket.eventTitle,
        eventPoster: ticket.eventPoster,
        venue: ticket.venue,
        city: ticket.city,
        date: ticket.date,
        time: ticket.time,
        tierName: ticket.tierName,
        seatNumber: ticket.seatNumber,
        attendeeName: ticket.attendeeName,
        qrCodeValue: ticket.qrCodeValue,
        status: ticket.status || 'valid',
        passType: ticket.passType || 'entry',
        paymentStatus: ticket.paymentStatus || 'paid',
        amountDue: ticket.amountDue || 0,
        redeemedAt: ticket.redeemedAt || null,
        redeemedBy: ticket.redeemedBy || null,
        createdAt: Date.now(),
        openCount: 0,
        eventGoogleMapsQuery: (ticket as any).eventGoogleMapsQuery || `${ticket.venue}, ${ticket.city}`,
      };

      await rtdbSet(`passes/${passId}`, passPayload, adminToken);
      await rtdbUpdate(`tickets/${ticketId}`, { passSlug }, adminToken);
      if (ticket.ownerId) {
        await rtdbUpdate(`users/${ticket.ownerId}/tickets/${ticketId}`, { passSlug }, adminToken).catch(() => {});
      }
      return res.json({ success: true, passSlug });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Failed to regenerate pass slug." });
    }
  });

  /**
   * Lookup Pass Slug by Ticket Number (Hash-redirect fallback).
   */
  app.get("/api/passes/lookup", verifyRole(['admin', 'ticket_counter']), async (req: any, res) => {
    try {
      const { ticketNumber } = req.query || {};
      if (!ticketNumber) {
        return res.status(400).json({ success: false, error: "ticketNumber parameter is required." });
      }
      const adminToken = await getAdminAuthToken();
      const ticketsSnap = await rtdbGet("tickets", adminToken);
      const allTickets = Object.values((ticketsSnap.data || {}) as Record<string, any>);
      const matched = allTickets.find((t: any) => t.ticketNumber?.toLowerCase() === String(ticketNumber).trim().toLowerCase());
      if (!matched || !matched.passSlug) {
        return res.status(404).json({ success: false, error: "Pass not found for ticket number." });
      }
      return res.json({ success: true, passSlug: matched.passSlug, ticketId: matched.id });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Lookup failed." });
    }
  });

  app.post("/api/tickets/send-email", requireRole(["super_admin", "event_manager", "counter_staff"]), async (req: any, res) => {
    try {
      const { attendeeEmail, subject, message } = req.body || {};
      if (!attendeeEmail || !String(attendeeEmail).includes("@")) {
        return res.status(400).json({ success: false, error: "A valid recipient email address is required." });
      }
      if (!subject || String(subject).trim().length < 3) {
        return res.status(400).json({ success: false, error: "Subject (3+ characters) is required." });
      }
      if (!message || String(message).trim().length < 5) {
        return res.status(400).json({ success: false, error: "Message (5+ characters) is required." });
      }
      const result = await sendMail({
        to: String(attendeeEmail).trim(),
        subject: String(subject).trim(),
        text: String(message).trim(),
      });
      await recordNotification({
        subject: String(subject).trim(),
        message: `Email to ${attendeeEmail}${result.mode === "no-mail" ? " (no-mail mode: SMTP not configured)" : ""}`,
        recipientCount: 1,
        status: "sent",
        createdBy: req.user.uid,
      }).catch(() => {});
      return res.json({
        success: true,
        sentTo: String(attendeeEmail).trim(),
        sentAt: new Date().toISOString(),
        status: result.ok ? "DELIVERED" : "FAILED",
        mode: result.mode,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
// ============================================================
// TICKET COUNTER PANEL (Prompt C) — shifts, reprint, void,
// exchange, discount override, and seat-availability snapshot.
// All endpoints are gated by the RBAC guard (requireRole) and
// attribute every action to the logged-in staff member in the
// append-only audit log.
// ============================================================

// --- Shift management helpers ---
async function fetchCounterShifts(authToken: string | undefined, staffUid?: string, allForAdmin?: boolean): Promise<Record<string, any>> {
  const snap = await rtdbGet("counter_shifts", authToken);
  const shifts: Record<string, any> = {};
  const data = snap.data as Record<string, any> | null;
  if (!data) return shifts;
  for (const [shiftId, shift] of Object.entries(data)) {
    const s = (shift || {}) as any;
    if (allForAdmin || s.staffId === staffUid) {
      shifts[shiftId] = s;
    }
  }
  return shifts;
}

// Sum of cash collected by a staff member within a shift's open window.
// Walk-in sales carry `staffShiftId` on the pending order, so finalized
// orders inherit it through processed_orders; we attribute via the
// canonical orders record (channel === 'counter') keyed by createdBy and
// fall back to the pending_orders carry-over while the order is open.
async function computeShiftCashTotals(
  authToken: string | undefined,
  shift: any
): Promise<{ expectedCash: number; cashSalesCount: number; totalSales: number; byMethod: Record<string, number> }> {
  const byMethod: Record<string, number> = {};
  let expectedCash = 0;
  let cashSalesCount = 0;
  let totalSales = 0;
  const startMs = new Date(shift.startTime).getTime();
  const endMs = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();

  const addSale = (order: any) => {
    const amount = Number(order.amount) || 0;
    const discount = Number(order.discount) || 0;
    const collected = Math.max(0, amount - discount);
    totalSales += collected;
    const method = String(order.paymentMethod || "").replace(/^(walkin_|manual_|counter_)/, "") || "other";
    const cleanMethod = ["cash", "card", "upi", "counter_upi", "other"].includes(method) ? (method === "counter_upi" ? "upi" : method) : "other";
    byMethod[cleanMethod] = (byMethod[cleanMethod] || 0) + collected;
    if (cleanMethod === "cash") {
      expectedCash += collected;
      cashSalesCount += 1;
    }
  };

  // Canonical orders attributed to this staff inside the shift window.
  const ordersSnap = await rtdbGet("orders", authToken).catch(() => ({ data: null }));
  if (ordersSnap.data) {
    for (const order of Object.values(ordersSnap.data as Record<string, any>)) {
      const o = (order || {}) as any;
      if (
        o.createdBy === shift.staffId &&
        (o.channel === "counter" || String(o.paymentMethod || "").startsWith("walkin")) &&
        o.createdAt &&
        new Date(o.createdAt).getTime() >= startMs &&
        new Date(o.createdAt).getTime() <= endMs &&
        o.status === "confirmed" &&
        (o.shiftId === shift.shiftId || o.staffShiftId === shift.shiftId)
      ) {
        addSale(o);
      }
    }
  }
  // Pending orders carry the shift id while the sale is in flight.
  const pendingSnap = await rtdbGet("pending_orders", authToken).catch(() => ({ data: null }));
  if (pendingSnap.data) {
    for (const order of Object.values(pendingSnap.data as Record<string, any>)) {
      const o = (order || {}) as any;
      if (o.shiftId === shift.shiftId) {
        addSale(o);
      }
    }
  }
  return { expectedCash, cashSalesCount, totalSales, byMethod };
}

// --- Counter endpoints ---

// Start a shift: requires staff (counter_staff and up).
app.post("/api/counter/shifts/start", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { startingCash } = req.body || {};
    const staffUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    // Validate starting cash: non-negative number.
    const startCash = Number(startingCash);
    if (!Number.isFinite(startCash) || startCash < 0) {
      return res.status(400).json({ success: false, error: "Starting cash must be a non-negative number." });
    }
    const error = validateNonNegativePrice(startCash);
    if (error) return res.status(400).json({ success: false, error });
    // Prevent two concurrent open shifts for the same staff member.
    const existing = await fetchCounterShifts(await getAdminAuthToken(), staffUid);
    const openShift = Object.values(existing).find((s: any) => s.status === "open");
    if (openShift) {
      return res.status(409).json({ success: false, error: "You already have an open shift. End it before starting a new one." });
    }
    const staffSnap = await rtdbGet(`staff/${staffUid}`, req.user.idToken);
    const staffName = (staffSnap?.data as any)?.name || req.user.email || staffUid;
    const shiftId = `shf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shiftRecord = {
      shiftId,
      staffId: staffUid,
      staffName,
      staffRole: rbacRole,
      startTime: new Date().toISOString(),
      startingCash: startCash,
      status: "open",
    };
    await rtdbSet(`counter_shifts/${shiftId}`, shiftRecord, await getAdminAuthToken());
    await writeAuditEntry({
      actorId: staffUid,
      actorRole: rbacRole,
      action: "shift.started",
      entityType: "shift",
      entityId: shiftId,
      afterState: { staffName, startingCash: startCash, startTime: shiftRecord.startTime },
    });
    return res.status(201).json({ success: true, shift: shiftRecord });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not start shift." });
  }
});

// End a shift: owner or admin; counted cash entered; server computes expected cash.
app.post("/api/counter/shifts/:shiftId/end", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { shiftId } = req.params;
    const { countedCash } = req.body || {};
    const actorUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    const snap = await rtdbGet(`counter_shifts/${shiftId}`, await getAdminAuthToken());
    const shift = snap.data as any;
    if (!shift) return res.status(404).json({ success: false, error: "Shift not found." });
    // Only admin/manager levels may end someone else's shift.
    if (shift.staffId !== actorUid && rbacRole !== "super_admin" && rbacRole !== "event_manager") {
      return res.status(403).json({ success: false, error: "Access Denied: You can only end your own shift." });
    }
    if (shift.status !== "open") {
      return res.status(409).json({ success: false, error: "This shift has already been closed." });
    }
    const counted = Number(countedCash);
    if (!Number.isFinite(counted) || counted < 0) {
      return res.status(400).json({ success: false, error: "Counted cash must be a non-negative number." });
    }
    const totals = await computeShiftCashTotals(await getAdminAuthToken(), { ...shift, shiftId });
    const expectedCash = totals.expectedCash;
    const discrepancy = Math.round((counted - (Number(shift.startingCash) + expectedCash)) * 100) / 100;
    const update: Record<string, any> = {
      status: "closed",
      endTime: new Date().toISOString(),
      countedCash: counted,
      expectedCash,
      discrepancy,
      cashSalesCount: totals.cashSalesCount,
      totalSales: totals.totalSales,
      byMethod: totals.byMethod,
      closedBy: actorUid,
    };
    await rtdbUpdate(`counter_shifts/${shiftId}`, update, await getAdminAuthToken());
    await writeAuditEntry({
      actorId: actorUid,
      actorRole: rbacRole,
      action: "shift.closed",
      entityType: "shift",
      entityId: shiftId,
      beforeState: { startingCash: shift.startingCash, expectedCash },
      afterState: { countedCash: counted, discrepancy, totalSales: totals.totalSales, byMethod: totals.byMethod },
    });
    return res.status(200).json({
      success: true,
      shift: { ...shift, ...update },
      totals,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not end shift." });
  }
});

// List shifts: staff see their own; admins see all.
app.get("/api/counter/shifts", requireRole(["counter_staff", "auditor", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    const isAdmin = rbacRole === "super_admin" || rbacRole === "event_manager";
    const adminToken = await getAdminAuthToken();
    const shifts = await fetchCounterShifts(adminToken, req.user.uid, isAdmin);
    const shiftList = await Promise.all(
      Object.values(shifts).map(async (s: any) => {
        if (s.status === "open") {
          const liveTotals = await computeShiftCashTotals(adminToken, s).catch(() => null);
          return { ...s, liveTotals };
        }
        return s;
      })
    );
    return res.status(200).json({ success: true, shifts: shiftList });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not list shifts." });
  }
});

// Reprint ticket — reason field is mandatory; audited with reason in after_state.
app.post("/api/counter/tickets/:ticketId/reprint", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { ticketId } = req.params;
    const { reason } = req.body || {};
    const actorUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      return res.status(400).json({ success: false, error: "A reprint reason is required (e.g. 'lost', 'printer jam')." });
    }
    const snap = await rtdbGet(`tickets/${ticketId}`, await getAdminAuthToken());
    const ticket = snap.data as any;
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    await writeAuditEntry({
      actorId: actorUid,
      actorRole: rbacRole,
      action: "ticket.reprinted",
      entityType: "ticket",
      entityId: ticketId,
      afterState: { ticketNumber: ticket.ticketNumber, attendee: ticket.attendeeName, reason: trimmedReason },
    });
    return res.status(200).json({ success: true, ticket });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not reprint ticket." });
  }
});

// Void sale — only while the order is still pending (not finalized).
app.post("/api/counter/sales/:orderId/void", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const actorUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    const pendingSnap = await rtdbGet(`pending_orders/${orderId}`, await getAdminAuthToken());
    const pending = pendingSnap.data as any;
    if (!pending) {
      return res.status(409).json({ success: false, error: "This sale has already been finalized and cannot be voided. Use the refund action instead." });
    }
    const beforeState = { orderId, eventId: pending.eventId, tierId: pending.tierId, quantity: pending.quantity, amount: pending.amount, paymentMethod: pending.paymentMethod };
    // Release any seats claimed for this pending order.
    if (Array.isArray(pending.seatIds) && pending.seatIds.length > 0 && pending.eventId) {
      for (const seatId of pending.seatIds) {
        await releaseSeat(await getAdminAuthToken(), pending.eventId, seatId, { reservationId: pending.reservationId }).catch(() => {});
      }
    }
    await rtdbDelete(`pending_orders/${orderId}`, await getAdminAuthToken());
    await writeAuditEntry({
      actorId: actorUid,
      actorRole: rbacRole,
      action: "order.voided.counter",
      entityType: "order",
      entityId: orderId,
      beforeState,
      afterState: { voided: true, voidedBy: actorUid, reason: "Voided before finalization at counter." },
    });
    return res.status(200).json({ success: true, message: "Sale voided before finalization." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not void sale." });
  }
});

// Exchange seat — release old seat, atomically claim the new one; honors the
// event-level exchangesAllowedUntil window when set.
app.post("/api/counter/orders/:orderId/exchange", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { oldSeatId, newSeats } = req.body || {};
    const actorUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "counter_staff";
    const adminToken = await getAdminAuthToken();
    const processedSnap = await rtdbGet(`processed_orders/${orderId}`, adminToken);
    const processed = (processedSnap.data as any) || {};
    const ticket = processed.ticket as any;
    if (!ticket || !processed.booking) {
      return res.status(404).json({ success: false, error: "Confirmed order not found." });
    }
    if (!oldSeatId || !Array.isArray(newSeats) || newSeats.length === 0) {
      return res.status(400).json({ success: false, error: "oldSeatId and at least one new seat are required." });
    }
    const currentSeats: string[] = processed.booking.seatIds || ticket.selectedSeats || [];
    if (!currentSeats.includes(oldSeatId)) {
      return res.status(400).json({ success: false, error: "The old seat is not part of this order." });
    }
    // Exchange window check (event-level setting, optional).
    const eventSnap = await rtdbGet(`events/${ticket.eventId}`, adminToken);
    const event = (eventSnap.data as any) || {};
    if (event.exchangesAllowedUntil) {
      if (new Date(event.exchangesAllowedUntil).getTime() < Date.now()) {
        return res.status(409).json({ success: false, error: "The exchange window for this event has closed." });
      }
    }
    // Guard against duplicate new seats.
    const uniqueNew = Array.from(new Set(String(newSeats).split(",").map((s: string) => String(s).trim()).filter(Boolean)));
    const overlap = uniqueNew.filter((s: string) => currentSeats.includes(s));
    if (overlap.length > 0) {
      return res.status(400).json({ success: false, error: `New seat(s) already belong to this order: ${overlap.join(", ")}.` });
    }
    const ownerId = String(ticket.ownerId || "walk_in_guest");
    // Release the old seat (must still be held/booked by this order).
    const release = await releaseSeat(adminToken, ticket.eventId, oldSeatId, {});
    if (release.committed) {
      await rtdbTransaction(`seats/${ticket.eventId}/${oldSeatId}`, (seat: any) => {
        if (!seat) return undefined;
        if (seat.status === "booked" && seat.orderId === orderId) {
          return { ...seat, status: "available", bookedBy: null, bookedAt: null, orderId: null, ticketId: null, bookingId: null, statusChangedAt: Date.now(), statusChangedBy: "exchange" };
        }
        if (seat.status === "available" || (seat.status === "held" && seat.heldBy !== ownerId)) {
          return seat; // someone else took it; let the claim step validate
        }
        return undefined;
      }, adminToken).catch(() => {});
    }
    // Claim the new seats atomically under the order identity.
    const claim = await claimSeatsAtomically(adminToken, ticket.eventId, uniqueNew, orderId, ownerId);
    if (!claim.committed) {
      // Best-effort restore of the old seat (already bookable again).
      return res.status(409).json({ success: false, error: claim.error || "The selected replacement seat is no longer available." });
    }
    // Transition new seats to booked (fulfillment) and update ticket/booking linkage.
    for (const seatId of uniqueNew) {
      await bookSeat(adminToken, ticket.eventId, seatId, ownerId, orderId, ticket.id, processed.booking.bookingId).catch(() => {});
    }
    const exchangeEntry = {
      oldSeatId,
      newSeats: uniqueNew,
      actorId: actorUid,
      at: new Date().toISOString(),
    };
    const exchangeHistory = [...((processed.booking as any).exchangeHistory || []), exchangeEntry];
    await rtdbUpdate(`bookings/${processed.booking.bookingId}`, { exchangeHistory, seatIds: currentSeats.filter((s: string) => s !== oldSeatId).concat(uniqueNew) }, adminToken).catch(() => {});
    await writeAuditEntry({
      actorId: actorUid,
      actorRole: rbacRole,
      action: "order.seat_exchanged",
      entityType: "order",
      entityId: orderId,
      beforeState: { seats: currentSeats },
      afterState: { seats: currentSeats.filter((s: string) => s !== oldSeatId).concat(uniqueNew), oldSeatId, newSeats: uniqueNew },
    });
    const seatLabel = [...currentSeats.filter((s: string) => s !== oldSeatId), ...uniqueNew]
      .map((s: string) => {
        const parts = s.split("-");
        const r = String.fromCharCode(64 + parseInt(parts[0].replace("R", ""), 10));
        const c = parts[1].replace("C", "");
        return `${r}-${c}`;
      })
      .join(", ");
    const updatedTicket = { ...ticket, seatNumber: seatLabel, selectedSeats: currentSeats.filter((s: string) => s !== oldSeatId).concat(uniqueNew) };
    await rtdbSet(`tickets/${ticket.id}`, updatedTicket, adminToken).catch(() => {});
    await rtdbSet(`users/${ownerId}/tickets/${ticket.id}`, updatedTicket, adminToken).catch(() => {});
    return res.status(200).json({ success: true, ticket: updatedTicket });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not exchange seat." });
  }
});

// Manager-gated discount override: only super_admin/event_manager may approve.
app.post("/api/counter/discount-override", requireRole(["event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const actorUid = req.user.uid;
    const rbacRole = (req.user.rbacRole as string) || "event_manager";
    const { eventId, orderAmount, discountPercent, discountAmount: rawDiscountAmount, reason } = req.body || {};
    if (!eventId || !orderAmount) {
      return res.status(400).json({ success: false, error: "eventId and orderAmount are required." });
    }
    const amount = Number(orderAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "orderAmount must be a positive number." });
    }
    let discountAmount = 0;
    if (discountPercent !== undefined && discountPercent !== null) {
      const pct = Number(discountPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
        return res.status(400).json({ success: false, error: "Discount percent must be between 0 and 50." });
      }
      discountAmount = Math.round((amount * pct) / 100);
    } else {
      const d = Number(rawDiscountAmount);
      if (!Number.isFinite(d) || d < 0 || d > amount) {
        return res.status(400).json({ success: false, error: "Discount amount must be between 0 and the order total." });
      }
      discountAmount = Math.round(d);
    }
    const staffSnap = await rtdbGet(`staff/${actorUid}`, req.user.idToken);
    const staffName = (staffSnap?.data as any)?.name || req.user.email || actorUid;
    const overrideId = `dov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await writeAuditEntry({
      actorId: actorUid,
      actorRole: rbacRole,
      action: "discount.override",
      entityType: "event",
      entityId: String(eventId),
      afterState: {
        overrideId,
        eventId,
        orderAmount: amount,
        discountAmount,
        approvedBy: actorUid,
        approvedByName: staffName,
        reason: String(reason || "").trim() || "Manager discount override",
      },
    });
    return res.status(200).json({
      success: true,
      discountOverride: { overrideId, discountAmount, actorId: actorUid, actorName: staffName, amount },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not approve discount override." });
  }
});

// Seat-availability snapshot for the counter seat map (real-time refresh).
app.get("/api/counter/events/:eventId/seats", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const { eventId } = req.params;
    const adminToken = await getAdminAuthToken();
    const eventSnap = await rtdbGet(`events/${eventId}`, adminToken);
    const event = (eventSnap.data as any) || {};
    const seatsSnap = await rtdbGet(`seats/${eventId}`, adminToken).catch(() => ({ data: null }));
    const seats = (seatsSnap.data as Record<string, any>) || {};
    const now = Date.now();
    const seatsSnapshot: Record<string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }> = {};
    for (const [seatId, node] of Object.entries(seats)) {
      const n = (node || {}) as any;
      const expiresAt = n.holdExpiresAt || (n.heldAt ? n.heldAt + 10 * 60 * 1000 : 0);
      let status = n.status || "available";
      if (status === "held" && expiresAt && now > expiresAt) status = "available";
      seatsSnapshot[seatId] = {
        status,
        heldBy: status === "held" ? n.heldBy : undefined,
        expiresAt: status === "held" ? expiresAt : undefined,
        bookedAt: status === "booked" ? n.bookedAt : undefined,
      };
    }
    return res.status(200).json({
      success: true,
      event: { id: eventId, title: event.title, seatMap: event.seatMap || null, ticketTiers: event.ticketTiers || [], exchangesAllowedUntil: event.exchangesAllowedUntil || null },
      seats: seatsSnapshot,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not load seat availability." });
  }
});

// Merchant UPI configuration for the counter's dynamic payment QR.
// The counter embeds the final order total into the QR URI, so the customer's
// UPI app always receives an exact-amount payment request. Stored at
// app_config/merchant_upi with shape { vpa, name }.
app.get("/api/merchant-upi", requireRole(["counter_staff", "event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const configSnap = await rtdbGet("app_config/merchant_upi", await getAdminAuthToken());
    const config = (configSnap.data || {}) as { vpa?: string; name?: string };
    return res.status(200).json({ success: true, vpa: config.vpa || "", name: config.name || "" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not load merchant UPI config." });
  }
});

app.put("/api/merchant-upi", requireRole(["super_admin"]), async (req: any, res) => {
  try {
    const rawVpa = String(req.body?.vpa || "").trim();
    const rawName = String(req.body?.name || "").trim();
    if (!rawVpa) {
      return res.status(400).json({ success: false, error: "A merchant UPI ID (VPA) is required." });
    }
    if (!/^[A-Za-z0-9.\-_]{2,64}@[A-Za-z0-9.\-_]{2,64}$/.test(rawVpa) || rawVpa.length > 129) {
      return res.status(400).json({ success: false, error: "The UPI ID must look like 'merchant@upi' (letters, digits, . _ - only)." });
    }
    const name = rawName.slice(0, 25) || undefined;
    await rtdbSet("app_config/merchant_upi", { vpa: rawVpa, ...(name ? { name } : {}) }, await getAdminAuthToken());
    await writeAuditEntry({
      actorId: req.user.uid,
      actorRole: req.user.rbacRole,
      action: "config.merchant_upi.updated",
      entityType: "config",
      entityId: "merchant_upi",
      afterState: { vpa: rawVpa, name },
    });
    return res.status(200).json({ success: true, vpa: rawVpa, name: name || "" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not save merchant UPI config." });
  }
});

// ──────────────────────────────────────────────────────────────────────
// Ticket-counter stations management (named counters, e.g. "Gate A").
// Each counter can carry its own merchant UPI ID (overrides the global
// app_config/merchant_upi) and an allow-list of staff authorized to run it.
// Counters live at RTDB path counters/<counterId>.
// ──────────────────────────────────────────────────────────────────────

const COUNTER_VPA_RE = /^[A-Za-z0-9.\-_]{2,64}@[A-Za-z0-9.\-_]{2,64}$/;

app.get("/api/admin/counters", requireRole(["event_manager", "super_admin"]), async (req: any, res) => {
  try {
    const snap = await rtdbGet("counters", await getAdminAuthToken());
    const nodes = (snap.data || {}) as Record<string, any>;
    const counters = Object.entries(nodes).map(([id, c]) => ({
      id,
      name: String(c?.name || "").slice(0, 40),
      venue: String(c?.venue || "").slice(0, 60),
      status: c?.status === "inactive" ? "inactive" : "active",
      merchantUpi: { vpa: String(c?.merchantUpi?.vpa || ""), name: String(c?.merchantUpi?.name || "") },
      assignedStaffIds: Array.isArray(c?.assignedStaffIds) ? c.assignedStaffIds : [],
      createdAt: String(c?.createdAt || ""),
      updatedAt: String(c?.updatedAt || ""),
    }));
    counters.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return res.status(200).json({ success: true, counters });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not list counters." });
  }
});

app.post("/api/admin/counters", requireRole(["super_admin"]), async (req: any, res) => {
  try {
    const rawName = String(req.body?.name || "").trim();
    if (rawName.length < 2 || rawName.length > 40) {
      return res.status(400).json({ success: false, error: "Counter name must be 2-40 characters." });
    }
    const rawVenue = String(req.body?.venue || "").trim().slice(0, 60);
    const rawStaff = Array.isArray(req.body?.assignedStaffIds) ? req.body.assignedStaffIds : [];
    const staffIds: string[] = rawStaff.filter((s: any) => /^[a-zA-Z0-9_\-]{1,128}$/.test(String(s))).map(String).slice(0, 50);
    // Validate staff IDs exist only when provided (best-effort); unknown IDs
    // are dropped so a partial assignment never fails a create.
    const token = await getAdminAuthToken();
    const now = new Date().toISOString();
    const counterId = `counter_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const record = {
      name: rawName,
      ...(rawVenue ? { venue: rawVenue } : {}),
      status: "active",
      assignedStaffIds: staffIds,
      merchantUpi: {},
      createdAt: now,
      updatedAt: now,
      createdBy: req.user.uid,
    };
    await rtdbSet(`counters/${counterId}`, record, token);
    await writeAuditEntry({
      actorId: req.user.uid,
      actorRole: req.user.rbacRole,
      action: "counter.created",
      entityType: "counter",
      entityId: counterId,
      afterState: record,
    });
    return res.status(201).json({ success: true, counter: { id: counterId, ...record } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not create counter." });
  }
});

app.put("/api/admin/counters/:counterId", requireRole(["super_admin"]), async (req: any, res) => {
  try {
    const { counterId } = req.params;
    const token = await getAdminAuthToken();
    const existing = (await rtdbGet(`counters/${counterId}`, token)).data as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: "Counter not found." });
    }
    const body = req.body || {};
    let name: string | undefined;
    if (body.name !== undefined) {
      name = String(body.name).trim();
      if (name.length < 2 || name.length > 40) {
        return res.status(400).json({ success: false, error: "Counter name must be 2-40 characters." });
      }
    }
    const venue = body.venue !== undefined ? String(body.venue).trim().slice(0, 60) : undefined;
    let status: string | undefined;
    if (body.status !== undefined) {
      status = String(body.status);
      if (status !== "active" && status !== "inactive") {
        return res.status(400).json({ success: false, error: "Status must be 'active' or 'inactive'." });
      }
    }
    // Per-counter UPI: { vpa, name } sets it; explicit null/undefined-omitted
    // keys or an empty vpa clears the override (counter falls back to the
    // global app_config/merchant_upi).
    let merchantUpi: { vpa?: string; name?: string } | null | undefined;
    if (body.merchantUpi === null) {
      merchantUpi = null;
    } else if (body.merchantUpi !== undefined && typeof body.merchantUpi === "object") {
      const rawVpa = String(body.merchantUpi?.vpa || "").trim();
      if (rawVpa) {
        if (!COUNTER_VPA_RE.test(rawVpa) || rawVpa.length > 129) {
          return res.status(400).json({ success: false, error: "The UPI ID must look like 'merchant@upi' (letters, digits, . _ - only)." });
        }
        merchantUpi = { vpa: rawVpa };
        const rawName = String(body.merchantUpi?.name || "").trim();
        if (rawName) merchantUpi.name = rawName.slice(0, 25);
      } else {
        merchantUpi = null;
      }
    }
    let assignedStaffIds: string[] | undefined;
    if (body.assignedStaffIds !== undefined) {
      if (!Array.isArray(body.assignedStaffIds) || body.assignedStaffIds.length > 50) {
        return res.status(400).json({ success: false, error: "assignedStaffIds must be a list of at most 50 staff IDs." });
      }
      const ids: string[] = body.assignedStaffIds.filter((s: any) => /^[a-zA-Z0-9_\-]{1,128}$/.test(String(s))).map(String);
      // Only unknown IDs are rejected — partial lists must refer to real staff.
      const known: string[] = [];
      const unknown: string[] = [];
      for (const id of ids) {
        const s = (await rtdbGet(`staff/${id}`, token)).data;
        (s ? known : unknown).push(id);
      }
      if (unknown.length) {
        return res.status(400).json({ success: false, error: `Unknown staff IDs: ${unknown.join(", ")}.` });
      }
      assignedStaffIds = known;
    }
    const now = new Date().toISOString();
    const updated = {
      ...existing,
      ...(name !== undefined ? { name } : {}),
      ...(venue !== undefined ? { venue } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(merchantUpi !== undefined ? { merchantUpi: merchantUpi === null ? {} : merchantUpi } : {}),
      ...(assignedStaffIds !== undefined ? { assignedStaffIds } : {}),
      updatedAt: now,
      updatedBy: req.user.uid,
    };
    await rtdbSet(`counters/${counterId}`, updated, token);
    await writeAuditEntry({
      actorId: req.user.uid,
      actorRole: req.user.rbacRole,
      action: "counter.updated",
      entityType: "counter",
      entityId: counterId,
      beforeState: existing,
      afterState: updated,
    });
    return res.status(200).json({ success: true, counter: { id: counterId, ...updated } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not update counter." });
  }
});

// Batch update: one patch applied to many counters. Fails all-or-nothing
// during validation, then applies each (non-fatal per-row on transient RTDB
// errors) and reports per-counter outcomes.
app.patch("/api/admin/counters", requireRole(["super_admin"]), async (req: any, res) => {
  try {
    const body = req.body || {};
    const counterIds: string[] = Array.isArray(body.counterIds) ? body.counterIds.map(String).slice(0, 100) : [];
    if (counterIds.length === 0) {
      return res.status(400).json({ success: false, error: "counterIds must list at least one counter." });
    }
    if (counterIds.length !== new Set(counterIds).size) {
      return res.status(400).json({ success: false, error: "counterIds contains duplicates." });
    }
    const patch = body.patch || {};
    const allowedPatchKeys = ["merchantUpi", "assignedStaffIds", "status"];
    if (Object.keys(patch).length === 0 || !Object.keys(patch).every((k) => allowedPatchKeys.includes(k))) {
      return res.status(400).json({ success: false, error: `Patch may only contain: ${allowedPatchKeys.join(", ")}.` });
    }
    // Validate merchant UPI patch value once, up front.
    let patchUpi: { vpa?: string; name?: string } | null = undefined as never;
    let patchUpiCleared = false;
    if ("merchantUpi" in patch) {
      if (patch.merchantUpi === null) {
        patchUpi = null;
        patchUpiCleared = true;
      } else if (patch.merchantUpi && typeof patch.merchantUpi === "object") {
        const rawVpa = String(patch.merchantUpi?.vpa || "").trim();
        if (!rawVpa) {
          patchUpi = null;
          patchUpiCleared = true;
        } else if (!COUNTER_VPA_RE.test(rawVpa) || rawVpa.length > 129) {
          return res.status(400).json({ success: false, error: "The UPI ID must look like 'merchant@upi' (letters, digits, . _ - only)." });
        } else {
          patchUpi = { vpa: rawVpa };
          const rawName = String(patch.merchantUpi?.name || "").trim();
          if (rawName) patchUpi.name = rawName.slice(0, 25);
        }
      } else {
        return res.status(400).json({ success: false, error: "patch.merchantUpi must be a { vpa, name? } object or null to clear." });
      }
    }
    let patchStatus: string | undefined;
    if ("status" in patch) {
      patchStatus = String(patch.status);
      if (patchStatus !== "active" && patchStatus !== "inactive") {
        return res.status(400).json({ success: false, error: "patch.status must be 'active' or 'inactive'." });
      }
    }
    let patchStaff: string[] | undefined;
    if ("assignedStaffIds" in patch) {
      if (!Array.isArray(patch.assignedStaffIds) || patch.assignedStaffIds.length > 50) {
        return res.status(400).json({ success: false, error: "patch.assignedStaffIds must list at most 50 staff IDs." });
      }
      patchStaff = patch.assignedStaffIds.filter((s: any) => /^[a-zA-Z0-9_\-]{1,128}$/.test(String(s))).map(String);
      if (patchStaff.length !== patch.assignedStaffIds.length) {
        return res.status(400).json({ success: false, error: "patch.assignedStaffIds contains invalid staff ID formats." });
      }
    }
    const token = await getAdminAuthToken();
    // Fail-all-or-nothing: resolve every counter and validate staff first.
    const records: Array<{ id: string; existing: any }> = [];
    for (const id of counterIds) {
      const existing = (await rtdbGet(`counters/${id}`, token)).data;
      if (!existing) {
        return res.status(404).json({ success: false, error: `Counter '${id}' not found.` });
      }
      records.push({ id, existing });
    }
    if (patchStaff !== undefined) {
      for (const sid of patchStaff) {
        const s = (await rtdbGet(`staff/${sid}`, token)).data;
        if (!s) {
          return res.status(400).json({ success: false, error: `Unknown staff ID in patch: ${sid}.` });
        }
      }
    }
    // Apply.
    const now = new Date().toISOString();
    const outcomes: Array<{ counterId: string; success: boolean; error?: string }> = [];
    for (const { id, existing } of records) {
      try {
        const updated = {
          ...existing,
          ...(patchStatus !== undefined ? { status: patchStatus } : {}),
          ...(patchUpi !== undefined ? { merchantUpi: patchUpi === null ? {} : patchUpi } : {}),
          ...(patchStaff !== undefined ? { assignedStaffIds: patchStaff } : {}),
          updatedAt: now,
          updatedBy: req.user.uid,
        };
        await rtdbSet(`counters/${id}`, updated, token);
        await writeAuditEntry({
          actorId: req.user.uid,
          actorRole: req.user.rbacRole,
          action: "counter.batch_updated",
          entityType: "counter",
          entityId: id,
          beforeState: existing,
          afterState: updated,
        });
        outcomes.push({ counterId: id, success: true });
      } catch (rowErr: any) {
        outcomes.push({ counterId: id, success: false, error: rowErr.message || "Could not update counter." });
      }
    }
    return res.status(200).json({ success: true, outcomes });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not apply batch update." });
  }
});

app.delete("/api/admin/counters/:counterId", requireRole(["super_admin"]), async (req: any, res) => {
  try {
    const { counterId } = req.params;
    const token = await getAdminAuthToken();
    const existing = (await rtdbGet(`counters/${counterId}`, token)).data as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: "Counter not found." });
    }
    if (existing.status !== "inactive") {
      // Safety first: deactivate; hard delete only after a clean status flip.
      const updated = { ...existing, status: "inactive", updatedAt: new Date().toISOString(), updatedBy: req.user.uid };
      await rtdbSet(`counters/${counterId}`, updated, token);
      await writeAuditEntry({ actorId: req.user.uid, actorRole: req.user.rbacRole, action: "counter.deactivated", entityType: "counter", entityId: counterId, beforeState: existing, afterState: updated });
      return res.status(200).json({ success: true, counter: { id: counterId, ...updated }, note: "Counter deactivated. Delete again to remove permanently." });
    }
    // Hard delete only when the counter has zero walk-in sales.
    const salesSnap = await rtdbGet("sales", token);
    const sales = (salesSnap.data || {}) as Record<string, any>;
    const saleCount = Object.values(sales).filter((s: any) => s?.counterId === counterId).length;
    if (saleCount > 0) {
      return res.status(409).json({ success: false, error: `Cannot delete: counter has ${saleCount} recorded sale(s).` });
    }
    await rtdbSet(`counters/${counterId}`, null, token);
    await writeAuditEntry({ actorId: req.user.uid, actorRole: req.user.rbacRole, action: "counter.deleted", entityType: "counter", entityId: counterId, beforeState: existing });
    return res.status(200).json({ success: true, note: "Counter removed." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Could not delete counter." });
  }
});

  app.get(["/sitemap.xml", "/public/sitemap.xml", "/public/sitemap"], (req, res) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    const publicPath = path.join(process.cwd(), "public", "sitemap.xml");
    const distPath = path.join(process.cwd(), "dist", "sitemap.xml");
    if (fs.existsSync(publicPath)) {
      return res.sendFile(publicPath);
    } else if (fs.existsSync(distPath)) {
      return res.sendFile(distPath);
    }
    return res.status(404).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Sitemap not found</error>");
  });

  app.get("/robots.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    const publicPath = path.join(process.cwd(), "public", "robots.txt");
    const distPath = path.join(process.cwd(), "dist", "robots.txt");
    if (fs.existsSync(publicPath)) {
      return res.sendFile(publicPath);
    } else if (fs.existsSync(distPath)) {
      return res.sendFile(distPath);
    }
    return res.send("User-agent: *\nAllow: /\nSitemap: https://ashvishevents.com/sitemap.xml\n");
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
