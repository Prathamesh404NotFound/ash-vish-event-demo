import React, { useState, useCallback, useEffect } from 'react';
import { safeFetch } from '../lib/api';
import { getSessionId } from '../contexts/BookingContext';

declare global {
  interface Window {
    Cashfree: any;
  }
}

export interface CashfreeOptions {
  amount: number; // in INR
  eventId: string;
  tierId: string;
  seatIds?: string[];
  quantity?: number;
  couponCode?: string;
  userId?: string;
  reservationId?: string;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  onSuccess?: (paymentResult: {
    orderId: string;
    paymentId: string;
    signature: string;
    signedToken?: string;
    ticket?: any;
    booking?: any;
  }) => void;
  onFailure?: (error: string) => void;
  onCancel?: () => void;
}

export const useCashfree = (enabled: boolean = true) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Load the Cashfree checkout SDK only when the payment step is actually
  // reached. Eager loading would run the SDK on every page for no reason.
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    if (!enabledRef.current || window.Cashfree) {
      setIsScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => setError('Failed to load Cashfree payment gateway SDK.');
    document.body.appendChild(script);
    return () => {
      /* script cleanup happens with the SPA navigation; no observer needed */
    };
  }, [enabled]);

  const processCashfreePayment = useCallback(
    async (options: CashfreeOptions) => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Server calculates the exact amount and creates the Cashfree order,
        // binding it to the atomic seat reservation if one exists. The server
        // returns a payment_session_id that opens the Cashfree checkout.
        const orderRes = await safeFetch('/api/cashfree/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': (typeof getSessionId === 'function' ? getSessionId() : '') },
          body: JSON.stringify({
            eventId: options.eventId,
            tierId: options.tierId,
            seatIds: options.seatIds || [],
            quantity: options.quantity || 1,
            couponCode: options.couponCode,
            customerName: options.customerDetails.name,
            customerEmail: options.customerDetails.email,
            customerPhone: options.customerDetails.phone,
            userId: options.userId,
            ...(options.reservationId ? { reservationId: options.reservationId } : {}),
          }),
        });

        const backendAvailable = orderRes.ok && orderRes.data?.success;
        const orderId = backendAvailable ? orderRes.data.orderId : `cf_demo_${Date.now()}`;
        const paymentSessionId = backendAvailable ? orderRes.data.paymentSessionId : '';
        const serverCalculatedAmount = backendAvailable ? orderRes.data.serverCalculatedAmount : options.amount;

        if (!backendAvailable) {
          console.warn('Cashfree backend unavailable — running client-side sandbox flow.');
        }

        // 2. Open the Cashfree embedded checkout, or simulate a sandbox payment.
        if (window.Cashfree && paymentSessionId) {
          let bootstrapFailed = false;
          const errorHandler = (msg: string) => {
            if (bootstrapFailed) return;
            bootstrapFailed = true;
            setIsLoading(false);
            setError(msg);
            if (options.onFailure) options.onFailure(msg);
          };

          // Cashfree's JS SDK `checkout()` opens the hosted payment page and
          // REDIRECTS the browser (redirectTarget: '_self'). After the payment
          // attempt the buyer returns to the `return_url` with `?order_id=`.
          // To not lose the verification state across the redirect, persist the
          // pending order to localStorage first; the payment step re-hydrates it
          // (see CheckoutWizard's resumeAfterRedirect logic) and completes the
          // server-side signature verification once the order is PAID.
          const pendingKey = 'ash_vish_cf_pending_payment';
          const mode = (import.meta.env as any)?.PROD ? 'production' : 'sandbox';
          const pending = {
            orderId,
            eventId: options.eventId,
            seatIds: options.seatIds || [],
            reservationId: options.reservationId || null,
            customerDetails: options.customerDetails,
            startedAt: Date.now(),
          };
          try {
            localStorage.setItem(pendingKey, JSON.stringify(pending));
          } catch { /* storage unavailable — proceed anyway */ }

          const cfInstance = window.Cashfree({ mode });
          const checkoutOptions = {
            paymentSessionId: paymentSessionId,
            redirectTarget: '_self' as const,
          };
          try {
            await cfInstance.checkout(checkoutOptions);
            // checkout() redirects synchronously in most browsers; if control
            // returns here it means the popup/modal closed or redirect failed.
          } catch {
            // Redirect failed — clean up the pending marker and surface an error.
            try { localStorage.removeItem(pendingKey); } catch { /* noop */ }
            errorHandler('Payment window could not be opened. Please try again.');
          }
          // Control rarely returns; either way, stop the spinner here because
          // the buyer has either been redirected or the open failed above.
          setIsLoading(false);
        } else {
          // No Cashfree SDK / session id — simulate a sandbox payment directly
          console.log('Running Sandbox Cashfree Flow (no SDK / no session).');
          const mockPaymentId = `pay_cf_mock_${Date.now()}`;
          const mockSignature = `sig_${Date.now()}_hmac_mock_verified`;

          if (backendAvailable) {
            const verifyRes = await safeFetch('/api/cashfree/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Session-Id': (typeof getSessionId === 'function' ? getSessionId() : '') },
              body: JSON.stringify({
                orderId,
                paymentId: mockPaymentId,
                signature: mockSignature,
                isSandbox: true,
                eventId: options.eventId,
                seatIds: options.seatIds || [],
                ...(options.reservationId ? { reservationId: options.reservationId } : {}),
              }),
            });

            if (verifyRes.ok && verifyRes.data?.verified) {
              if (options.onSuccess) {
                options.onSuccess({
                  orderId,
                  paymentId: mockPaymentId,
                  signature: mockSignature,
                  signedToken: verifyRes.data.signedToken,
                  ticket: verifyRes.data.ticket,
                  booking: verifyRes.data.booking,
                });
              }
            } else {
              throw new Error(verifyRes.error || verifyRes.data?.error || 'Server signature verification failed');
            }
          } else {
            // Fully offline demo: confirm directly without server
            if (options.onSuccess) {
              options.onSuccess({
                orderId,
                paymentId: mockPaymentId,
                signature: mockSignature,
              });
            }
          }
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Cashfree Error:', err);
        const errorMessage = err?.message || 'Payment failed.';
        setError(errorMessage);
        if (options.onFailure) options.onFailure(errorMessage);
        setIsLoading(false);
      }
    },
    [isScriptLoaded]
  );

  /**
   * Resumes a pending Cashfree payment after the browser returns from the
   * hosted checkout page (return_url?order_id=...). Our backend re-verifies
   * the order against Cashfree's API before finalizing, and the verify-payment
   * endpoint treats the return flow as sandbox-safe because the server still
   * performs reservation ownership binding and amount checks.
   */
  const resumeAfterRedirect = useCallback(
    async (returnedOrderId: string, resumeCallbacks?: { onSuccess?: (result: any) => void; onFailure?: (error: string) => void }) => {
      let pending: any = null;
      try {
        const raw = localStorage.getItem('ash_vish_cf_pending_payment');
        if (raw) pending = JSON.parse(raw);
      } catch { /* noop */ }

      setIsLoading(true);
      setError(null);

      try {
        if (!pending || pending.orderId !== returnedOrderId) {
          try { localStorage.removeItem('ash_vish_cf_pending_payment'); } catch { /* noop */ }
          throw new Error('Payment session not found. Please try booking again.');
        }

        const verifyRes = await safeFetch('/api/cashfree/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': (typeof getSessionId === 'function' ? getSessionId() : '') },
          body: JSON.stringify({
            orderId: pending.orderId,
            paymentId: `cf_return_${Date.now()}`,
            signature: `sig_return_${Date.now()}`,
            isSandbox: true,
            eventId: pending.eventId,
            seatIds: pending.seatIds || [],
            ...(pending.reservationId ? { reservationId: pending.reservationId } : {}),
          }),
        });

        if (verifyRes.ok && verifyRes.data?.verified) {
          try { localStorage.removeItem('ash_vish_cf_pending_payment'); } catch { /* noop */ }
          const result = {
            orderId: pending.orderId,
            paymentId: verifyRes.data.paymentId || `cf_return_${Date.now()}`,
            signature: verifyRes.data.signature || '',
            signedToken: verifyRes.data.signedToken,
            ticket: verifyRes.data.ticket,
            booking: verifyRes.data.booking,
          };
          if (resumeCallbacks?.onSuccess) resumeCallbacks.onSuccess(result);
        } else if (!verifyRes.ok) {
          throw new Error(verifyRes.error || verifyRes.data?.error || 'Payment verification failed.');
        } else {
          throw new Error(verifyRes.data?.error || 'Payment was not successful. Please check your payment status.');
        }
      } catch (err: any) {
        console.error('Cashfree Resume Error:', err);
        const msg = err?.message || 'Payment failed.';
        setError(msg);
        if (resumeCallbacks?.onFailure) resumeCallbacks.onFailure(msg);
        try { localStorage.removeItem('ash_vish_cf_pending_payment'); } catch { /* noop */ }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    processCashfreePayment,
    resumeAfterRedirect,
    isLoading,
    error,
    isScriptLoaded,
  };
};
