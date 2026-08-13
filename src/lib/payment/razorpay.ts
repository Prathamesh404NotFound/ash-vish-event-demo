// Ensure the environment is loaded even if this module is imported before
// dotenv.config() runs (ESM static imports are hoisted above statements).
import "dotenv/config";

/**
 * Razorpay payment service (test-mode-first).
 *
 * Server-authoritative design:
 *  - Orders are created server-side with our server key; the client receives
 *    only the Razorpay order id + amount and opens the Standard Checkout modal.
 *  - Fulfillment only happens after /api/razorpay/verify-payment confirms the
 *    payment status via the Razorpay REST API (order id + amount reconciliation),
 *    then atomically finalizes the booking through finalizeBookingServerSide.
 *  - Webhook (X-Razorpay-Signature) is a supplemental idempotent reconfirm path.
 */
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export interface RazorpayAvailability {
  available: boolean;
  reason?: string;
}

export function isRazorpayConfigured(): RazorpayAvailability {
  if (!KEY_ID || !KEY_SECRET) {
    return { available: false, reason: "Razorpay credentials are not configured." };
  }
  if (!KEY_ID.startsWith("rzp_test_") && !KEY_ID.startsWith("rzp_live_")) {
    return { available: false, reason: "Invalid Razorpay key id format." };
  }
  return { available: true };
}

export function isTestMode(): boolean {
  return KEY_ID.startsWith("rzp_test_");
}

async function razorpayRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${RAZORPAY_BASE}${path}`;
  const basic = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "User-Agent": "ash-vish-events/1.0",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data?.error?.description || data?.error?.reason || text || `Razorpay request failed (${res.status})`;
    console.error(`[RAZORPAY] ${method} ${path} -> ${res.status}: ${err}`);
    return { ok: false, status: res.status, data, error: err };
  }
  return { ok: true, status: res.status, data };
}

/** Create a Razorpay order. Amount is already in paise (minor units). */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  attendeeName?: string;
  attendeeEmail?: string;
}): Promise<{ ok: boolean; id?: string; amount?: number; currency?: string; status?: string; error?: string; errorCode?: string }> {
  const cfg = isRazorpayConfigured();
  if (!cfg.available) {
    return { ok: false, error: cfg.reason };
  }
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    return { ok: false, error: "Order amount must be a positive integer in minor units." };
  }
  const res = await razorpayRequest("POST", "/orders", {
    amount: params.amountPaise,
    currency: params.currency || "INR",
    receipt: params.receipt.slice(0, 40),
    payment_capture: 1,
    notes: {
      receipt: params.receipt.slice(0, 40),
      attendee_name: (params.attendeeName || "").slice(0, 100),
      attendee_email: (params.attendeeEmail || "").slice(0, 150),
      app: "ash-vish-events",
      env: isTestMode() ? "test" : "live",
    },
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
      errorCode: res.data?.error?.code,
    };
  }
  const o = res.data;
  return {
    ok: true,
    id: o.id,
    amount: o.amount,
    currency: o.currency,
    status: o.status,
  };
}

/** Fetch a payment's status from Razorpay. */
export async function fetchRazorpayPayment(paymentId: string): Promise<{ ok: boolean; payment?: any; error?: string }> {
  if (!paymentId || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    return { ok: false, error: "Invalid payment id format." };
  }
  const res = await razorpayRequest("GET", `/payments/${encodeURIComponent(paymentId)}`);
  if (!res.ok) {
    if (res.status === 404) return { ok: false, error: "Payment not found at Razorpay." };
    return { ok: false, error: res.error || "Failed to verify payment status with Razorpay." };
  }
  return { ok: true, payment: res.data };
}

/** Verify a Razorpay webhook signature. The signature is HMAC-SHA256 of the RAW body with KEY_SECRET. */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
  if (!signature || !KEY_SECRET) return false;
  const expected = crypto.createHmac("sha256", KEY_SECRET).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export { KEY_ID, KEY_SECRET };
