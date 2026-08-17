/**
 * Dynamic UPI payment QR generator.
 *
 * Builds a standards-compliant `upi://pay` URI for exact-amount payment
 * requests. The amount embedded in the URI is always the authoritative final
 * order total — the QR never allows the customer to type a custom amount.
 *
 * Merchant details (VPA / display name) come from server config
 * (GET /api/merchant-upi), never from this module.
 */

export interface MerchantUpiConfig {
  vpa?: string;
  name?: string;
}

export interface UpiParam {
  /** Merchant UPI ID / VPA, e.g. merchant@upi */
  vpa: string;
  /** Merchant display name shown in the payer's app */
  name?: string;
  /** Exact amount payable, in rupees (2 decimal places) */
  amount: number;
  /** Optional human-readable note embedded in the URI (max 50 chars) */
  note?: string;
}

export interface UpiParamValidation {
  valid: boolean;
  error?: string;
}

const VPA_REGEX = /^[A-Za-z0-9.\-_]{2,64}@[A-Za-z0-9.\-_]{2,64}$/;
const MAX_AMOUNT = 99999999.99;

/** Validate a merchant VPA string. */
export function isValidVpa(vpa: string): boolean {
  return typeof vpa === "string" && VPA_REGEX.test(vpa.trim()) && vpa.trim().length <= 129;
}

/** Validate the payment parameters before building a URI. */
export function validateUpiParam(param: UpiParam): UpiParamValidation {
  if (!param || !param.vpa) {
    return { valid: false, error: "Merchant UPI ID is not configured." };
  }
  if (!isValidVpa(param.vpa)) {
    return { valid: false, error: "The configured merchant UPI ID is invalid." };
  }
  const amount = Number(param.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: "The payable amount must be greater than zero." };
  }
  if (amount > MAX_AMOUNT) {
    return { valid: false, error: "The payable amount exceeds the UPI limit." };
  }
  return { valid: true };
}

/**
 * Build a `upi://pay` URI with the exact final amount.
 *
 * Structure: upi://pay?pa=VPA&pn=NAME&am=0.00&cu=INR[&tn=NOTE]
 * All values are URL-encoded per the UPI URI specification.
 */
export function buildUpiPayUri(param: UpiParam): string {
  const vpa = param.vpa.trim();
  const amount = Number(param.amount).toFixed(2);
  const parts: string[] = [
    `pa=${encodeURIComponent(vpa)}`,
  ];
  const name = (param.name || "Ash-vish Events").trim().slice(0, 25);
  if (name) parts.push(`pn=${encodeURIComponent(name)}`);
  parts.push(`am=${encodeURIComponent(amount)}`);
  parts.push(`cu=INR`);
  const note = (param.note || "").trim().slice(0, 50);
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join("&")}`;
}

/** Format a number as a rupee string, e.g. 300 → "₹300", 290.5 → "₹290.50". */
export function formatRupee(amount: number): string {
  const value = Number(amount) || 0;
  return `₹${value % 1 === 0 ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
