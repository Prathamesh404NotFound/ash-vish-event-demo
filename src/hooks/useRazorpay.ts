import { useState, useCallback, useEffect } from 'react';
import { safeFetch } from '../lib/api';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOptions {
  amount: number; // in INR
  eventId: string;
  tierId: string;
  seatIds?: string[];
  quantity?: number;
  couponCode?: string;
  userId?: string;
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

export const useRazorpay = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Load Razorpay Checkout SDK Script
  useEffect(() => {
    if (window.Razorpay) {
      setIsScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => setError('Failed to load Razorpay payment gateway SDK.');
    document.body.appendChild(script);
  }, []);

  const processRazorpayPayment = useCallback(
    async (options: RazorpayOptions) => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Calculate and verify price on server & create order
        const orderRes = await safeFetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          }),
        });

        if (!orderRes.ok || !orderRes.data?.success) {
          throw new Error(orderRes.error || orderRes.data?.error || 'Failed to create server-verified payment order');
        }

        const { orderId, amountInPaise, keyId, serverCalculatedAmount } = orderRes.data;

        // 2. Open Razorpay Modal or fallback test flow
        if (window.Razorpay && keyId && keyId !== 'rzp_test_placeholder') {
          const rzpOptions = {
            key: keyId,
            amount: amountInPaise,
            currency: 'INR',
            name: 'Ash & Vish Live Events',
            description: `Tickets Order #${orderId.slice(-6)} (${serverCalculatedAmount} INR)`,
            order_id: orderId,
            prefill: {
              name: options.customerDetails.name,
              email: options.customerDetails.email,
              contact: options.customerDetails.phone,
            },
            theme: {
              color: '#D4AF37',
            },
            handler: async function (response: any) {
              try {
                // 3. Server-side HMAC Signature Verification
                const verifyRes = await safeFetch('/api/razorpay/verify-payment', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    eventId: options.eventId,
                    seatIds: options.seatIds || [],
                  }),
                });

                if (verifyRes.ok && verifyRes.data?.success && verifyRes.data?.verified) {
                  if (options.onSuccess) {
                    options.onSuccess({
                      orderId: response.razorpay_order_id,
                      paymentId: response.razorpay_payment_id,
                      signature: response.razorpay_signature,
                      signedToken: verifyRes.data.signedToken,
                      ticket: verifyRes.data.ticket,
                      booking: verifyRes.data.booking,
                    });
                  }
                } else {
                  throw new Error(verifyRes.error || verifyRes.data?.error || 'Server HMAC Signature Verification Failed!');
                }
              } catch (verifyErr: any) {
                const msg = verifyErr?.message || 'Payment signature verification failed.';
                setError(msg);
                if (options.onFailure) options.onFailure(msg);
              } finally {
                setIsLoading(false);
              }
            },
            modal: {
              ondismiss: function () {
                setIsLoading(false);
                if (options.onCancel) options.onCancel();
              },
            },
          };

          const rzp = new window.Razorpay(rzpOptions);
          rzp.on('payment.failed', function (resp: any) {
            setIsLoading(false);
            const failMsg = resp.error?.description || 'Payment Failed or Cancelled';
            setError(failMsg);
            if (options.onFailure) options.onFailure(failMsg);
          });
          rzp.open();
        } else {
          // Sandbox / Preview mode simulation with Server Verification Endpoint
          console.log('Running Sandbox Razorpay Flow with Server HMAC Signature Verification');
          const mockPaymentId = `pay_rzp_mock_${Date.now()}`;
          const mockSignature = `sig_${Date.now()}_hmac_mock_verified`;

          const verifyRes = await safeFetch('/api/razorpay/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: orderId,
              razorpay_payment_id: mockPaymentId,
              razorpay_signature: mockSignature,
              isSandbox: true,
              eventId: options.eventId,
              seatIds: options.seatIds || [],
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
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Razorpay Error:', err);
        const errorMessage = err?.message || 'Payment failed.';
        setError(errorMessage);
        if (options.onFailure) options.onFailure(errorMessage);
        setIsLoading(false);
      }
    },
    [isScriptLoaded]
  );

  return {
    processRazorpayPayment,
    isLoading,
    error,
    isScriptLoaded,
  };
};
