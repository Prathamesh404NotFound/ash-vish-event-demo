// Ensure the environment is loaded even if this module is imported before
// dotenv.config() runs (ESM static imports are hoisted above statements).
import "dotenv/config";
import crypto from "crypto";

/**
 * PhonePe Payment Gateway Service (v2 Standard Checkout & Order Management).
 *
 * Server-authoritative design:
 *  - Authentication: OAuth Bearer Token generated via PhonePe Identity Manager API.
 *  - Orders are initiated server-side (/apis/pg/checkout/v2/pay); client receives redirectUrl.
 *  - Verification: /apis/pg/checkout/v2/order/{merchantOrderId}/status verifies transaction state,
 *    reconciles amount, and atomically finalizes bookings.
 *  - Refunds: /apis/pg/payments/v2/refund handles safety-net refunds on seat conflicts.
 *  - Webhook: Supplemental idempotent callback route.
 */

const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || "M22GIH1IAD6YJ_2608200104";
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || "NzY1ZDBlM2EtNzk3MC00MWRlLTk2MTQtMGQ1M2I5N2Q5ZmNl";
const PHONEPE_ENV = (process.env.PHONEPE_ENV || "production").toLowerCase();

const IS_PRODUCTION = PHONEPE_ENV === "production" || !PHONEPE_ENV.includes("sand") && !PHONEPE_ENV.includes("test");

const AUTH_URL = IS_PRODUCTION
  ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

const PG_BASE_URL = IS_PRODUCTION
  ? "https://api.phonepe.com/apis/pg"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox";

export interface PhonePeAvailability {
  available: boolean;
  reason?: string;
}

export function isPhonePeConfigured(): PhonePeAvailability {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { available: false, reason: "PhonePe credentials are not configured." };
  }
  return { available: true };
}

export function isTestMode(): boolean {
  return !IS_PRODUCTION;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAuthToken: CachedToken | null = null;

/**
 * Fetch OAuth access token from PhonePe Identity Manager with caching.
 */
export async function getPhonePeAuthToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  const now = Date.now();
  if (cachedAuthToken && cachedAuthToken.expiresAt > now + 60000) {
    return { ok: true, token: cachedAuthToken.token };
  }

  const cfg = isPhonePeConfigured();
  if (!cfg.available) {
    return { ok: false, error: cfg.reason };
  }

  try {
    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID.trim());
    params.append("client_secret", CLIENT_SECRET.trim());
    params.append("client_version", "1");
    params.append("grant_type", "client_credentials");

    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ash-vish-events/1.0",
      },
      body: params.toString(),
    });

    const text = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok || !data?.access_token) {
      const errMsg = data?.error_description || data?.message || text || `PhonePe OAuth failed (${res.status})`;
      console.error(`[PHONEPE AUTH ERROR] ${res.status}: ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    const expiresInSeconds = Number(data.expires_in) || 3600;
    cachedAuthToken = {
      token: data.access_token,
      expiresAt: now + expiresInSeconds * 1000,
    };

    return { ok: true, token: data.access_token };
  } catch (err: any) {
    console.error("[PHONEPE AUTH NETWORK ERROR]", err.message || err);
    return { ok: false, error: err.message || "Failed to authenticate with PhonePe." };
  }
}

/**
 * Make an authenticated PhonePe PG request.
 */
async function phonepeRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const authRes = await getPhonePeAuthToken();
  if (!authRes.ok || !authRes.token) {
    return { ok: false, status: 401, data: null, error: authRes.error || "PhonePe authentication failed." };
  }

  const url = `${PG_BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `O-Bearer ${authRes.token}`,
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
    const err = data?.message || data?.error?.description || text || `PhonePe request failed (${res.status})`;
    console.error(`[PHONEPE PG ERROR] ${method} ${path} -> ${res.status}: ${err}`);
    return { ok: false, status: res.status, data, error: err };
  }

  return { ok: true, status: res.status, data };
}

export interface CreatePhonePeOrderParams {
  merchantOrderId: string;
  amountPaise: number;
  redirectUrl: string;
  message?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  internalOrderId?: string;
  eventId?: string;
}

export interface PhonePeOrderResult {
  ok: boolean;
  orderId?: string;
  merchantOrderId?: string;
  redirectUrl?: string;
  state?: string;
  error?: string;
}

/**
 * Initiate a PhonePe Standard Checkout session (/apis/pg/checkout/v2/pay).
 */
export async function createPhonePeOrder(params: {
  merchantOrderId: string;
  amountPaise: number;
  redirectUrl: string;
  message?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  internalOrderId?: string;
  eventId?: string;
}): Promise<PhonePeOrderResult> {
  const cfg = isPhonePeConfigured();
  if (!cfg.available) {
    return { ok: false, error: cfg.reason };
  }

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    return { ok: false, error: "Order amount must be a positive integer in minor units (paise)." };
  }

  // Format merchantOrderId to meet PhonePe requirements (alphanumeric, underscore, hyphen, <= 63 chars)
  const safeMerchantOrderId = params.merchantOrderId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 63);

  const payload = {
    merchantOrderId: safeMerchantOrderId,
    amount: params.amountPaise,
    expireAfter: 1200, // 20 minutes
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: params.message || "Ticket booking payment",
      merchantUrls: {
        redirectUrl: params.redirectUrl,
      },
    },
    metaInfo: {
      udf1: params.internalOrderId || safeMerchantOrderId,
      udf2: params.eventId || "",
      attendeeName: (params.attendeeName || "").slice(0, 100),
      attendeeEmail: (params.attendeeEmail || "").slice(0, 150),
      attendeePhone: (params.attendeePhone || "").slice(0, 20),
      app: "ash-vish-events",
    },
  };

  const res = await phonepeRequest("POST", "/checkout/v2/pay", payload);
  if (!res.ok) {
    return { ok: false, error: res.error || "Failed to initialize payment with PhonePe." };
  }

  const data = res.data || {};
  const redirectUrl = data.redirectUrl || data.data?.redirectUrl || data.paymentUrl;
  const orderId = data.orderId || data.data?.orderId || safeMerchantOrderId;
  const state = data.state || data.data?.state || "INITIALIZED";

  if (!redirectUrl) {
    return { ok: false, error: "PhonePe did not return a valid checkout redirect URL." };
  }

  return {
    ok: true,
    orderId,
    merchantOrderId: safeMerchantOrderId,
    redirectUrl,
    state,
  };
}

export interface PhonePeOrderStatusResult {
  ok: boolean;
  orderId?: string;
  merchantOrderId?: string;
  state?: "COMPLETED" | "FAILED" | "PENDING" | string;
  amount?: number;
  paymentId?: string;
  paymentDetails?: any;
  error?: string;
}

/**
 * Fetch and verify the real-time order status from PhonePe.
 */
export async function fetchPhonePeOrderStatus(merchantOrderId: string): Promise<PhonePeOrderStatusResult> {
  if (!merchantOrderId) {
    return { ok: false, error: "merchantOrderId is required." };
  }

  const safeMerchantOrderId = encodeURIComponent(merchantOrderId);
  const res = await phonepeRequest("GET", `/checkout/v2/order/${safeMerchantOrderId}/status?details=true&errorContext=true`);

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: false, error: "Order not found at PhonePe." };
    }
    return { ok: false, error: res.error || "Failed to verify order status with PhonePe." };
  }

  const data = res.data || {};
  const orderData = data.data || data;
  const state = (orderData.state || orderData.status || "").toUpperCase();
  const amount = Number(orderData.amount);
  const paymentDetails = orderData.paymentInstrument || orderData.paymentDetails || null;
  const paymentId = orderData.transactionId || orderData.paymentId || orderData.orderId || merchantOrderId;

  return {
    ok: true,
    orderId: orderData.orderId || merchantOrderId,
    merchantOrderId,
    state,
    amount,
    paymentId,
    paymentDetails,
  };
}

export interface PhonePeRefundResult {
  ok: boolean;
  refundId?: string;
  status?: string;
  error?: string;
}

/**
 * Initiate a refund for an order via PhonePe (/apis/pg/payments/v2/refund).
 */
export async function refundPhonePeOrder(params: {
  merchantOrderId: string;
  amountPaise: number;
  reason?: string;
}): Promise<PhonePeRefundResult> {
  const merchantRefundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`.slice(0, 63);

  const payload = {
    merchantRefundId,
    originalMerchantOrderId: params.merchantOrderId,
    amount: params.amountPaise,
    reason: (params.reason || "Automatic seat conflict refund").slice(0, 200),
  };

  const res = await phonepeRequest("POST", "/payments/v2/refund", payload);
  if (!res.ok) {
    return { ok: false, error: res.error || "PhonePe refund request failed." };
  }

  const data = res.data || {};
  return {
    ok: true,
    refundId: data.refundId || data.data?.refundId || merchantRefundId,
    status: data.state || data.data?.state || "INITIATED",
  };
}

/**
 * Verify webhook payload integrity if SHA256 header / signature is present.
 */
export function verifyPhonePeWebhookSignature(rawBody: string | Buffer, signature?: string): boolean {
  if (!signature || !CLIENT_SECRET) return true; // PhonePe v2 OAuth server-to-server callbacks
  try {
    const expected = crypto.createHmac("sha256", CLIENT_SECRET).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export { CLIENT_ID, CLIENT_SECRET, PHONEPE_ENV };
