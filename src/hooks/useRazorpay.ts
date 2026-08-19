/**
 * Razorpay Standard Checkout hook (test-mode-first).
 *
 * Flow:
 *  1. Server creates a Razorpay order (POST /api/razorpay/create-order) and
 *     returns the Razorpay order id + amount + key.
 *  2. We open the Razorpay checkout modal with those values verbatim.
 *  3. On success (on.success), the client calls
 *     POST /api/razorpay/verify-payment — the server itself verifies the
 *     payment against the Razorpay API before finalizing the booking.
 *
 * One Razorpay order is created per modal session. If the modal fails to open
 * or the checkout errors, a retry reuses the SAME order id (Razorpay allows
 * paying the same order multiple times until it's captured) — a fresh order is
 * only created when explicitly requested. This avoids the "stale session
 * token 400 on preferences" failure that comes with creating an order and
 * opening the modal later.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeFetch, getApiUrl } from '../lib/api';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface RazorpayOrderResponse {
  success: boolean;
  orderId?: string;           // our pending order id
  rzpOrderId?: string;
  rzpKey?: string;
  amountMinor?: number;
  isTestMode?: boolean;
  holdUntil?: number;
  error?: string;
}

interface RazorpayVerifyResponse {
  success: boolean;
  ticket?: any;
  booking?: any;
  alreadyProcessed?: boolean;
  paymentStatus?: string;
  refundConfirmed?: boolean;
  refundId?: string;
  seatsStillHeld?: boolean;
  error?: string;
}

/**
 * Hold keepalive while the Razorpay modal is open (Item: keepalive). UPI/OTP
 * flows can exceed the 10-minute seat hold; polling /extend every ~2 minutes
 * keeps the reservation and its seats held for as long as checkout is in
 * progress (capped server-side at 4x the hold TTL).
 */
const KEEPALIVE_INTERVAL_MS = 2 * 60 * 1000;

function startHoldKeepalive(
  reservationId: string | null,
  reservationRef: { current: string | null },
  identityHeaders: (() => Promise<Record<string, string>>) | null,
  onKeepaliveError: () => void
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  // First poll fires after the initial interval to avoid spamming right after
  // the hold was already extended at order creation.
  const tick = async () => {
    if (stopped) return;
    const id = reservationRef.current || reservationId;
    if (!id) return;
    try {
      const res = await safeFetch<any>('/api/reservations/' + encodeURIComponent(id) + '/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await identityHeaders()) },
        body: JSON.stringify({ keepalive: true }),
      });
      if (!res.ok && res.status !== 409) {
        // A 409 here means the reservation legitimately expired — the post-
        // payment verify call will report the real seat status to the buyer.
        onKeepaliveError();
      }
    } catch {
      // Network blips during polling are not surfaced: the hold either stays
      // alive or the post-payment verify path handles the true state.
    }
  };
  timer = setInterval(tick, KEEPALIVE_INTERVAL_MS);
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

export interface RazorpaySession {
  orderId: string;
  rzpOrderId: string;
  rzpKey: string;
  amountMinor: number;
  isTestMode: boolean;
}

interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

/** Razorpay expects a phone number in international E.164-style format. */
function normalizeRazorpayContact(contact?: string): string | undefined {
  const value = String(contact || '').trim();
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  if (value.startsWith('+')) return `+${digits}`;
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

export function useRazorpay() {
  const [scriptReady, setScriptReady] = useState<boolean | null>(null);
  const [session, setSession] = useState<RazorpaySession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const modalOpenRef = useRef(false);
  const errorHandledRef = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetries = 1;

  // Load Razorpay checkout script once.
  useEffect(() => {
    if (window.Razorpay) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => setScriptReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.addEventListener('load', () => setScriptReady(true));
    script.addEventListener('error', () => setScriptReady(false));
    document.head.appendChild(script);
    return () => {
      script.removeEventListener('load', () => setScriptReady(true));
      script.removeEventListener('error', () => setScriptReady(false));
    };
  }, []);

  /** Create a Razorpay order for the given reservation (server-authoritative). */
  const createOrder = useCallback(async (
    reservationId: string,
    identityHeaders: () => Promise<Record<string, string>>,
    couponCode?: string | null,
    payDeposit?: boolean
  ): Promise<{ session: RazorpaySession | null; error?: string }> => {
    try {
      const res = await safeFetch<RazorpayOrderResponse>('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await identityHeaders()) },
        body: JSON.stringify({ reservationId, couponCode: couponCode || null, payDeposit: payDeposit || false }),
      });
      if (!res.ok || !res.data?.success) {
        return { session: null, error: res.data?.error || `Could not create payment order (${res.status}).` };
      }
      const data = res.data;
      const key = String(data.rzpKey || '').trim();
      if (!data.orderId || !data.rzpOrderId || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(key) || !Number.isInteger(data.amountMinor) || data.amountMinor <= 0) {
        return {
          session: null,
          error: 'Payment is temporarily unavailable because a valid checkout order was not returned. Your seats remain held; please try again shortly.',
        };
      }
      const s: RazorpaySession = {
        orderId: data.orderId,
        rzpOrderId: data.rzpOrderId,
        rzpKey: key,
        amountMinor: data.amountMinor,
        isTestMode: data.isTestMode === true,
      };
      setSession(s);
      return { session: s };
    } catch (err: any) {
      return { session: null, error: err?.message || 'Network error while creating payment order.' };
    }
  }, []);

  /** Call the server's payment verifier (Razorpay status + reconciliation). */
  const verifyPayment = useCallback(async (
    paymentId: string,
    orderId: string,
    identityHeaders: () => Promise<Record<string, string>>
  ): Promise<RazorpayVerifyResponse> => {
    const res = await safeFetch<RazorpayVerifyResponse>('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await identityHeaders()) },
      body: JSON.stringify({ orderId, paymentId }),
    });
    return {
      success: Boolean(res.data?.success),
      ticket: res.data?.ticket,
      booking: res.data?.booking,
      alreadyProcessed: res.data?.alreadyProcessed,
      paymentStatus: res.data?.paymentStatus,
      refundConfirmed: Boolean(res.data?.refundConfirmed),
      refundId: res.data?.refundId || undefined,
      seatsStillHeld: Boolean(res.data?.seatsStillHeld),
      error: res.data?.error || (res.ok ? undefined : `Payment verification failed (${res.status}).`),
    };
  }, []);

  /** Open the Razorpay modal for an existing session. */
  const openCheckout = useCallback((
    session: RazorpaySession,
    handlers: {
      onSuccess: (paymentId: string, orderId: string) => void;
      onError: (err: string) => void;
      onClose: () => void;
      getDisplayName: () => string;
      getEventTitle: () => string;
      getPrefill: () => RazorpayPrefill;
    },
    keepaliveOptions?: {
      reservationId: string | null;
      reservationRef: { current: string | null };
      identityHeaders: () => Promise<Record<string, string>>;
    }
  ) => {
    if (!session.orderId || !session.rzpOrderId || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(session.rzpKey) || !Number.isInteger(session.amountMinor) || session.amountMinor <= 0) {
      handlers.onError('Payment is temporarily unavailable because a valid checkout order was not returned. Your seats remain held.');
      return;
    }
    if (!window.Razorpay) {
      handlers.onError('Checkout could not be loaded. Please refresh and try again.');
      return;
    }
    // Guard: if the modal is already open, don't stack another one (StrictMode-safe).
    if (modalOpenRef.current) return;
    modalOpenRef.current = true;
    errorHandledRef.current = false;

    // Hold keepalive: keep the seat reservation alive while the checkout
    // modal stays open (every ~2 minutes, owner-checked, server-capped).
    // keepaliveIdentityHeaders is supplied by the caller via the third argument
    // of pay()/openCheckout(); it must resolve lazily so the headers are fresh
    // for each poll (session token can rotate while the modal is open).
    const stopKeepalive = keepaliveOptions?.reservationRef && keepaliveOptions.identityHeaders
      ? startHoldKeepalive(
          keepaliveOptions.reservationId,
          keepaliveOptions.reservationRef,
          keepaliveOptions.identityHeaders,
          () => { /* expiry will surface through the post-payment verify call */ }
        )
      : null;
    // Store so all exit paths below can stop it.
    (handlers as any).__stopKeepalive = stopKeepalive;

    let options: any;
    try {
      const suppliedPrefill = handlers.getPrefill();
      const prefill = {
        name: String(suppliedPrefill?.name || '').trim(),
        email: String(suppliedPrefill?.email || '').trim(),
        contact: normalizeRazorpayContact(suppliedPrefill?.contact),
      };

      options = {
        key: session.rzpKey,
        amount: session.amountMinor,
        currency: 'INR',
        order_id: session.rzpOrderId,
        name: 'ASH Events',
        description: `${handlers.getEventTitle()} — ${handlers.getDisplayName()}`,
        handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature?: string }) => {
          modalOpenRef.current = false;
          if ((handlers as any).__stopKeepalive) (handlers as any).__stopKeepalive();
          if (!resp?.razorpay_payment_id) {
            handlers.onError('Payment completed but no payment id was returned.');
            return;
          }
          handlers.onSuccess(resp.razorpay_payment_id, session.orderId);
        },
        modal: {
          ondismiss: () => {
            modalOpenRef.current = false;
            if ((handlers as any).__stopKeepalive) (handlers as any).__stopKeepalive();
            if (!errorHandledRef.current) handlers.onClose();
          },
          animation: true,
        },
        // Prefilling removes Razorpay's separate mobile-number prompt. UPI can
        // be preselected only when Checkout receives both contact and email.
        prefill,
        method: prefill.email && prefill.contact ? 'upi' : undefined,
        // Highlight the provider-managed UPI/dynamic-QR path but keep all
        // other payment methods enabled for the merchant account available.
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI or QR',
                instruments: [{ method: 'upi' }],
              },
            },
            sequence: ['block.upi'],
            preferences: { show_default_blocks: true },
          },
        },
        notes: { order_id: session.orderId },
        theme: { color: '#D4AF37' },
        retry: { enabled: true, max_count: 2 },
        remember_customer: false,
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        modalOpenRef.current = false;
        if ((handlers as any).__stopKeepalive) (handlers as any).__stopKeepalive();
        errorHandledRef.current = true;
        const reason = resp?.error?.description || resp?.error?.reason || 'Payment failed.';
        handlers.onError(reason);
      });
      rzp.on('window.close', () => {
        modalOpenRef.current = false;
        if ((handlers as any).__stopKeepalive) (handlers as any).__stopKeepalive();
        if (!errorHandledRef.current) handlers.onClose();
      });
      // open() can throw synchronously (e.g., expired session token → 400).
      rzp.open();
    } catch (err: any) {
      modalOpenRef.current = false;
      handlers.onError(err?.message || 'Could not open the payment window.');
    }
  }, []);

  /** Full flow: create an order and open the modal. Includes one stale-token retry. */
  const pay = useCallback(async (
    reservationId: string,
    identityHeaders: () => Promise<Record<string, string>>,
    couponCode: string | null | undefined,
    handlers: {
      onSuccess: (paymentId: string, orderId: string) => void;
      onError: (err: string) => void;
      onClose: () => void;
      getDisplayName: () => string;
      getEventTitle: () => string;
      getPrefill: () => RazorpayPrefill;
    },
    options?: { reservationRef?: { current: string | null }; payDeposit?: boolean }
  ) => {
    if (isProcessing || retryCountRef.current > maxRetries) return;
    setIsProcessing(true);
    errorHandledRef.current = false;

    const { session: currentSession, error: createError } = await createOrder(
      reservationId,
      identityHeaders,
      couponCode,
      options?.payDeposit
    );
    if (!currentSession || createError) {
      setIsProcessing(false);
      handlers.onError(createError || 'Could not start payment.');
      return;
    }
    openCheckout(
      currentSession,
      handlers,
      {
        reservationId,
        reservationRef: options?.reservationRef || { current: reservationId },
        identityHeaders,
      }
    );
  }, [createOrder, openCheckout, isProcessing]);

  return {
    scriptReady,
    session,
    isProcessing,
    createOrder,
    verifyPayment,
    pay,
    retryCountRef,
  };
}

export { getApiUrl };
export type { RazorpayOrderResponse, RazorpayVerifyResponse };
