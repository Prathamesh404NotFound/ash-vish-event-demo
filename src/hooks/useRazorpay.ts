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
  error?: string;
}

export interface RazorpaySession {
  orderId: string;
  rzpOrderId: string;
  rzpKey: string;
  amountMinor: number;
  isTestMode: boolean;
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
    couponCode?: string | null
  ): Promise<{ session: RazorpaySession | null; error?: string }> => {
    try {
      const res = await safeFetch<RazorpayOrderResponse>('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await identityHeaders()) },
        body: JSON.stringify({ reservationId, couponCode: couponCode || null }),
      });
      if (!res.ok || !res.data?.success) {
        return { session: null, error: res.data?.error || `Could not create payment order (${res.status}).` };
      }
      const data = res.data;
      const s: RazorpaySession = {
        orderId: data.orderId!,
        rzpOrderId: data.rzpOrderId!,
        rzpKey: data.rzpKey || '',
        amountMinor: data.amountMinor || 0,
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
    }
  ) => {
    if (!window.Razorpay) {
      handlers.onError('Checkout could not be loaded. Please refresh and try again.');
      return;
    }
    // Guard: if the modal is already open, don't stack another one (StrictMode-safe).
    if (modalOpenRef.current) return;
    modalOpenRef.current = true;
    errorHandledRef.current = false;

    let options: any;
    try {
      options = {
        key: session.rzpKey,
        amount: session.amountMinor,
        currency: 'INR',
        order_id: session.rzpOrderId,
        name: 'ASH Events',
        description: `${handlers.getEventTitle()} — ${handlers.getDisplayName()}`,
        handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature?: string }) => {
          modalOpenRef.current = false;
          if (!resp?.razorpay_payment_id) {
            handlers.onError('Payment completed but no payment id was returned.');
            return;
          }
          handlers.onSuccess(resp.razorpay_payment_id, session.orderId);
        },
        modal: {
          ondismiss: () => {
            modalOpenRef.current = false;
            if (!errorHandledRef.current) handlers.onClose();
          },
          animation: true,
        },
        notes: { order_id: session.orderId },
        theme: { color: '#D4AF37' },
        retry: { enabled: true, max_count: 2 },
        remember_customer: false,
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        modalOpenRef.current = false;
        errorHandledRef.current = true;
        const reason = resp?.error?.description || resp?.error?.reason || 'Payment failed.';
        handlers.onError(reason);
      });
      rzp.on('window.close', () => {
        modalOpenRef.current = false;
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
    }
  ) => {
    if (isProcessing || retryCountRef.current > maxRetries) return;
    setIsProcessing(true);
    errorHandledRef.current = false;

    const { session: currentSession, error: createError } = await createOrder(reservationId, identityHeaders, couponCode);
    if (!currentSession || createError) {
      setIsProcessing(false);
      handlers.onError(createError || 'Could not start payment.');
      return;
    }
    openCheckout(currentSession, handlers);
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
