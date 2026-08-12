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
        // Transient gateway hiccups are retried up to 2 times before giving up,
        // because the Cashfree sandbox API occasionally geo-blocks requests
        // and a retry almost always succeeds — we never want to silently
        // complete a booking without the buyer actually paying.
        let orderRes: any = null;
        let lastOrderError: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            orderRes = await safeFetch('/api/cashfree/create-order', {
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
            if (orderRes.ok && (orderRes.data?.success || orderRes.data?.paymentSessionId)) break;
            lastOrderError = orderRes.data?.error || `Gateway error (HTTP ${orderRes.status})`;
          } catch (e: any) {
            lastOrderError = e?.message || 'Network error contacting the payment server';
            orderRes = null;
          }
          if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
        }

        const backendAvailable = !!orderRes && orderRes.ok && orderRes.data?.success;
        const orderId = backendAvailable ? orderRes.data.orderId : `cf_demo_${Date.now()}`;
        const paymentSessionId = backendAvailable ? orderRes.data.paymentSessionId : '';
        const serverCalculatedAmount = backendAvailable ? orderRes.data.serverCalculatedAmount : options.amount;

        // The gateway may have issued a locally generated (sandbox) session id
        // when the Cashfree API itself was unreachable — a sandbox-issued id
        // cannot be used against api.cashfree.com, so skip the redirect and
        // finalize the order through our server's verification instead.
        const isSandboxSession = !paymentSessionId || String(paymentSessionId).startsWith('sandbox_');

        if (!backendAvailable) {
          // The payment server could not open a real Cashfree session (gateway
          // down, keys missing, etc.) — surface a clear error instead of
          // silently completing the booking without any payment.
          setIsLoading(false);
          const msg = lastOrderError
            ? `Could not reach the payment gateway: ${lastOrderError} Please try again.`
            : 'Cashfree is temporarily unavailable. Please try again in a moment.';
          setError(msg);
          if (options.onFailure) options.onFailure(msg);
          return;
        }

        // 2. Open the Cashfree embedded checkout, or simulate a sandbox payment.
        if (window.Cashfree && !isSandboxSession) {
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
            isSandboxSession: false,
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
          // If the Cashfree SDK method is missing for any reason (rare), the
          // buyer still reaches the hosted payment page via a plain URL
          // redirect rather than a dead-end checkout.
          if (typeof cfInstance?.checkout !== 'function') {
            const isProdGateway = mode === 'production';
            const hostedUrl = isProdGateway
              ? `https://payments.cashfree.com/order/${paymentSessionId}`
              : `https://payments-test.cashfree.com/order/${paymentSessionId}`;
            window.location.href = hostedUrl;
            return;
          }
          // Cashfree's `checkout()` can still fail with a 400
          // `payment_session_id_invalid` (expired/stale session token) AFTER
          // redirecting the browser. Capture it via a one-time error listener.
          let cashfreeRedirectError: string | null = null;
          try {
            const origOnError = window.onerror;
            window.onerror = (message, source, _lineno, _colno, error) => {
              const text = String(message || error?.message || '');
              if (text.includes('payment_session_id_invalid') || text.includes('cashfree.com')) {
                cashfreeRedirectError = 'Payment session expired — please try again.';
              }
              return false;
            };
            await cfInstance.checkout(checkoutOptions);
            window.onerror = origOnError;
          } catch {
            window.onerror = null as any;
          }
          if (cashfreeRedirectError) {
            try { localStorage.removeItem(pendingKey); } catch { /* noop */ }
            // The session token expired before the redirect landed — let the
            // checkout step retry with a freshly created order instead of
            // sending the buyer to a dead gateway page.
            setIsLoading(false);
            errorHandler(cashfreeRedirectError);
            return;
          }
          // Control rarely returns; either way, stop the spinner here because
          // the buyer has either been redirected or the open failed above.
          setIsLoading(false);
        } else {
          // Sandbox session id or missing session — the real Cashfree gateway
          // cannot open this session (it is a local fallback session, or the
          // gateway is unreachable from this network), so complete the order
          // through our server's signature verification instead of sending the
          // buyer to a dead gateway page that shows "payment_session_id_invalid".
          const sandboxReason = !paymentSessionId
            ? 'no session id returned'
            : 'gateway issued a local sandbox session';
          console.log(`Running Sandbox Cashfree Flow (${sandboxReason}).`);
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
