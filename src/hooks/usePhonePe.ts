/**
 * PhonePe Standard Checkout Hook (Hosted Checkout v2).
 *
 * Flow:
 *  1. Server initiates the PhonePe checkout order (POST /api/phonepe/create-order)
 *     and returns redirectUrl + orderId + merchantOrderId.
 *  2. Frontend stores pending context into sessionStorage and redirects user to PhonePe Hosted Page.
 *  3. After payment, PhonePe redirects user back to our return page (/payment/phonepe/return or /payment-callback).
 *  4. Return page (or Checkout) calls POST /api/phonepe/verify-payment to reconcile status
 *     against PhonePe API before finalizing the ticket booking.
 */
import { useCallback, useState } from 'react';
import { safeFetch, getApiUrl } from '../lib/api';

export interface PhonePeOrderResponse {
  success: boolean;
  orderId?: string;
  merchantOrderId?: string;
  phonepeOrderId?: string;
  redirectUrl?: string;
  amountMinor?: number;
  isTestMode?: boolean;
  holdUntil?: number;
  error?: string;
}

export interface PhonePeVerifyResponse {
  success: boolean;
  ticket?: any;
  booking?: any;
  alreadyProcessed?: boolean;
  paymentStatus?: string;
  isPending?: boolean;
  refundConfirmed?: boolean;
  refundId?: string;
  seatsStillHeld?: boolean;
  error?: string;
}

const KEEPALIVE_INTERVAL_MS = 2 * 60 * 1000;

function startHoldKeepalive(
  reservationId: string | null,
  reservationRef: { current: string | null },
  identityHeaders: (() => Promise<Record<string, string>>) | null,
  onKeepaliveError?: () => void
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    if (stopped) return;
    const id = reservationRef.current || reservationId;
    if (!id || !identityHeaders) return;
    try {
      const headers = await identityHeaders();
      const res = await safeFetch<any>('/api/reservations/' + encodeURIComponent(id) + '/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ keepalive: true }),
      });
      if (!res.ok && res.status !== 409 && onKeepaliveError) {
        onKeepaliveError();
      }
    } catch {
      // Ignore network blips during background polling
    }
  };
  timer = setInterval(tick, KEEPALIVE_INTERVAL_MS);
  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

export function usePhonePe() {
  const [isProcessing, setIsProcessing] = useState(false);

  /** Create a PhonePe checkout order server-authoritatively. */
  const createOrder = useCallback(async (
    reservationId: string,
    identityHeaders: () => Promise<Record<string, string>>,
    couponCode?: string | null,
    payDeposit?: boolean
  ): Promise<{ data: PhonePeOrderResponse | null; error?: string }> => {
    try {
      const headers = await identityHeaders();
      const res = await safeFetch<PhonePeOrderResponse>('/api/phonepe/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          reservationId,
          couponCode: couponCode || null,
          payDeposit: payDeposit || false,
        }),
      });

      if (!res.ok || !res.data?.success) {
        return { data: null, error: res.data?.error || `Could not create payment order (${res.status}).` };
      }

      const data = res.data;
      if (!data.orderId || !data.redirectUrl) {
        return {
          data: null,
          error: 'Payment gateway did not return a valid checkout session. Please try again.',
        };
      }

      return { data };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Network error while initiating payment.' };
    }
  }, []);

  /** Verify PhonePe payment status after user returns from checkout. */
  const verifyPayment = useCallback(async (
    orderId: string,
    merchantOrderId: string | undefined,
    identityHeaders: () => Promise<Record<string, string>>
  ): Promise<PhonePeVerifyResponse> => {
    try {
      const headers = await identityHeaders();
      const res = await safeFetch<PhonePeVerifyResponse>('/api/phonepe/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ orderId, merchantOrderId }),
      });

      return {
        success: Boolean(res.data?.success),
        ticket: res.data?.ticket,
        booking: res.data?.booking,
        alreadyProcessed: res.data?.alreadyProcessed,
        paymentStatus: res.data?.paymentStatus,
        isPending: res.data?.isPending,
        refundConfirmed: Boolean(res.data?.refundConfirmed),
        refundId: res.data?.refundId,
        seatsStillHeld: res.data?.seatsStillHeld,
        error: res.data?.error || (res.ok ? undefined : `Payment verification failed (${res.status}).`),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error verifying payment.',
      };
    }
  }, []);

  /**
   * Complete payment flow: creates order with PhonePe, saves session backup,
   * and redirects to PhonePe hosted checkout page.
   */
  const pay = useCallback(async (
    reservationId: string,
    identityHeaders: () => Promise<Record<string, string>>,
    couponCode: string | null | undefined,
    handlers: {
      onError: (err: string) => void;
      getDisplayName?: () => string;
      getEventTitle?: () => string;
      getPrefill?: () => { name?: string; email?: string; contact?: string };
    },
    options?: {
      reservationRef?: { current: string | null };
      payDeposit?: boolean;
    }
  ) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const { data, error } = await createOrder(
      reservationId,
      identityHeaders,
      couponCode,
      options?.payDeposit
    );

    if (!data || error || !data.redirectUrl) {
      setIsProcessing(false);
      handlers.onError(error || 'Could not start PhonePe payment session.');
      return;
    }

    // Persist pending checkout metadata to sessionStorage for return reconciliation
    try {
      const prefill = handlers.getPrefill ? handlers.getPrefill() : {};
      sessionStorage.setItem('phonepe_active_order', JSON.stringify({
        orderId: data.orderId,
        merchantOrderId: data.merchantOrderId,
        reservationId,
        attendeeName: prefill.name,
        attendeeEmail: prefill.email,
        attendeePhone: prefill.contact,
        timestamp: Date.now(),
      }));
    } catch {
      // Storage unavailable / private mode
    }

    // Redirect to PhonePe payment gateway
    window.location.href = data.redirectUrl;
  }, [createOrder, isProcessing]);

  return {
    isProcessing,
    createOrder,
    verifyPayment,
    pay,
    startHoldKeepalive,
  };
}

export { getApiUrl };
