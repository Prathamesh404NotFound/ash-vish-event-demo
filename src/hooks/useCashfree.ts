import { useState, useCallback, useEffect } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import { safeFetch } from '../lib/api';

export interface CashfreeCustomerDetails {
  name: string;
  email: string;
  phone: string;
}

export interface PayWithCashfreeOptions {
  amount: number;
  customerDetails: CashfreeCustomerDetails;
  orderId?: string;
  eventId?: string;
  tierId?: string;
  seatIds?: string[];
  quantity?: number;
  userId?: string;
  couponCode?: string;
  onSuccess?: (details: { orderId: string; paymentSessionId: string; ticket?: any; booking?: any }) => void;
  onFailure?: (error: string) => void;
}

export interface PendingCashfreeOrder {
  orderId: string;
  paymentSessionId: string;
  amount: number;
  customerDetails: CashfreeCustomerDetails;
  options: PayWithCashfreeOptions;
}

const CASHFREE_APP_ID =
  (import.meta as any).env?.VITE_CASHFREE_APP_ID ||
  (import.meta as any).env?.CASHFREE_APP_ID ||
  'TEST_APP_ID_DEFAULT';

export const useCashfree = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingCashfreeOrder | null>(null);
  const [cashfreeSDK, setCashfreeSDK] = useState<any>(null);

  // Initialize Cashfree PG SDK with CASHFREE_APP_ID from environment
  useEffect(() => {
    const initSDK = async () => {
      try {
        const cashfreeMode = (((import.meta as any).env?.VITE_CASHFREE_ENV) || 'sandbox') as 'sandbox' | 'production';
        const cf = await load({ mode: cashfreeMode });
        setCashfreeSDK(cf);
      } catch (e) {
        console.warn('Cashfree SDK initialization notice:', e);
      }
    };
    initSDK();
  }, []);

  const processPayment = useCallback(
    async (options: PayWithCashfreeOptions): Promise<{ orderId: string; paymentSessionId: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Create payment session on backend
        const response = await safeFetch('/api/cashfree/create-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: options.amount,
            customerName: options.customerDetails.name,
            customerEmail: options.customerDetails.email,
            customerPhone: options.customerDetails.phone,
            orderId: options.orderId,
            eventId: options.eventId,
            tierId: options.tierId,
            seatIds: options.seatIds || [],
            quantity: options.quantity || 1,
            userId: options.userId,
            couponCode: options.couponCode,
            appId: CASHFREE_APP_ID,
          }),
        });

        if (!response.ok || !response.data?.success || !response.data?.payment_session_id) {
          throw new Error(response.error || response.data?.error || 'Failed to initialize Cashfree payment session');
        }

        const paymentSessionId = response.data.payment_session_id;
        const orderId = response.data.order_id;
        const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

        // 2. Execute checkout via Cashfree JS SDK
        const cf = cashfreeSDK || (await load({ mode: 'sandbox' }));

        if (cf && typeof cf.checkout === 'function') {
          const redirectTarget = isInIframe ? '_blank' : '_modal';
          const result = await cf.checkout({
            paymentSessionId,
            redirectTarget,
          });

          if (result && result.error) {
            console.warn('Cashfree checkout error/abort:', result.error);
            const errStr = String(result.error.message || '').toLowerCase();
            if (errStr.includes('aborted') || errStr.includes('cancelled') || isInIframe) {
              setPendingOrder({
                orderId,
                paymentSessionId,
                amount: options.amount,
                customerDetails: options.customerDetails,
                options,
              });
              setIsLoading(false);
              return { orderId, paymentSessionId };
            } else {
              throw new Error(result.error.message || 'Payment failed.');
            }
          }

          if (options.onSuccess) {
            options.onSuccess({ orderId, paymentSessionId });
          }

          return { orderId, paymentSessionId };
        } else {
          // Fallback if Cashfree checkout not modal ready
          setPendingOrder({
            orderId,
            paymentSessionId,
            amount: options.amount,
            customerDetails: options.customerDetails,
            options,
          });
          setIsLoading(false);
          return { orderId, paymentSessionId };
        }
      } catch (err: any) {
        console.error('Process Payment Error:', err);
        const errorMessage = err?.message || 'Payment failed. Please try again.';
        setError(errorMessage);
        if (options.onFailure) {
          options.onFailure(errorMessage);
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cashfreeSDK]
  );

  const initiatePayment = useCallback(
    (options: PayWithCashfreeOptions) => {
      return processPayment(options);
    },
    [processPayment]
  );

  const confirmPendingOrder = useCallback(() => {
    if (pendingOrder) {
      const { orderId, paymentSessionId, options } = pendingOrder;
      setPendingOrder(null);
      if (options.onSuccess) {
        options.onSuccess({ orderId, paymentSessionId });
      }
    }
  }, [pendingOrder]);

  const cancelPendingOrder = useCallback(() => {
    if (pendingOrder) {
      const { options } = pendingOrder;
      setPendingOrder(null);
      if (options.onFailure) {
        options.onFailure('Payment was cancelled.');
      }
    }
  }, [pendingOrder]);

  return {
    processPayment,
    initiatePayment,
    payWithCashfree: initiatePayment,
    isLoading,
    error,
    pendingOrder,
    confirmPendingOrder,
    cancelPendingOrder,
  };
};

