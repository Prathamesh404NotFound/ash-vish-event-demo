import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';
import { usePhonePe } from '../hooks/usePhonePe';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { safeFetch } from '../lib/api';

export function PaymentCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyPayment } = usePhonePe();
  const { confirmServerPurchasedTicket, resetBookingFlow } = useBooking();
  const { user } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [ticketData, setTicketData] = useState<any>(null);
  const verificationAttemptedRef = useRef(false);

  // Identity headers resolver
  const getIdentityHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    const guestSessionId = sessionStorage.getItem('guest_session_id') || localStorage.getItem('guest_session_id');
    if (guestSessionId) {
      headers['X-Session-Id'] = guestSessionId;
    }
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        headers['Authorization'] = `Bearer ${await currentUser.getIdToken()}`;
      }
    } catch {
      // Ignore token fetch issues
    }
    return headers;
  };

  useEffect(() => {
    if (verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;

    const runVerification = async () => {
      // 1. Check URL parameters
      let orderId = searchParams.get('orderId') || '';
      let merchantOrderId = searchParams.get('merchantOrderId') || searchParams.get('transactionId') || '';

      // 2. Fallback to active sessionStorage session
      try {
        const stored = sessionStorage.getItem('phonepe_active_order');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!orderId && parsed.orderId) orderId = parsed.orderId;
          if (!merchantOrderId && parsed.merchantOrderId) merchantOrderId = parsed.merchantOrderId;
        }
      } catch {
        // storage fallback
      }

      if (!orderId && !merchantOrderId) {
        setStatus('failed');
        setErrorMessage('No transaction reference found. Please check your tickets in My Account.');
        return;
      }

      try {
        const result = await verifyPayment(orderId, merchantOrderId, getIdentityHeaders);

        if (!result.success) {
          setStatus('failed');
          if (result.isPending) {
            setErrorMessage('Your payment is still being processed by PhonePe. If money was debited, your ticket will appear in My Tickets shortly.');
          } else if (result.refundConfirmed) {
            setErrorMessage('Payment was refunded because the selected seat hold expired during checkout. Please choose seats again.');
          } else {
            setErrorMessage(result.error || 'Payment verification could not be completed.');
          }
          return;
        }

        if (result.ticket && result.booking) {
          const confirmed = confirmServerPurchasedTicket(result.ticket, result.booking);
          setTicketData(confirmed);
          safeFetch('/api/tickets/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              attendeeEmail: confirmed.customerEmail,
              attendeeName: confirmed.customerName,
              ticketNumber: confirmed.ticketNumber,
              eventTitle: confirmed.eventTitle,
            }),
          }).catch(() => {});
        }

        // Clear active checkout order from session
        try {
          sessionStorage.removeItem('phonepe_active_order');
        } catch {}

        setStatus('success');
        resetBookingFlow();

        // Auto-navigate to confirmation after brief confirmation display
        setTimeout(() => {
          navigate('/confirmation', { replace: true });
        }, 1800);
      } catch (err: any) {
        setStatus('failed');
        setErrorMessage(err?.message || 'Failed to verify transaction with payment gateway.');
      }
    };

    runVerification();
  }, [searchParams, verifyPayment, confirmServerPurchasedTicket, resetBookingFlow, navigate]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-xl">
        {status === 'verifying' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-[#D4AF37]/20 animate-ping" />
              <div className="w-16 h-16 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-bold text-white tracking-wide">
                Verifying Payment
              </h2>
              <p className="text-sm text-gray-400">
                Confirming transaction securely with PhonePe. Please do not close or refresh this window...
              </p>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
              <span>Contacting PhonePe Gateway Server...</span>
            </div>
          </motion.div>
        )}

        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 mx-auto bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-bold text-white tracking-wide">
                Payment Confirmed!
              </h2>
              <p className="text-sm text-gray-300">
                Your tickets have been issued and digital passes sent to your email & WhatsApp.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => navigate('/confirmation', { replace: true })}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black font-bold uppercase tracking-wider text-sm flex items-center justify-center space-x-2 hover:opacity-95 transition-opacity"
              >
                <span>View My Tickets</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="w-20 h-20 mx-auto bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-400">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-bold text-white tracking-wide">
                Payment Incomplete
              </h2>
              <p className="text-sm text-gray-300">
                {errorMessage || 'We could not confirm your payment status with PhonePe.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => navigate('/checkout')}
                className="flex-1 py-3 px-4 rounded-xl bg-[#D4AF37] text-black font-semibold text-sm hover:bg-[#c49f2e] transition-colors"
              >
                Return to Checkout
              </button>
              <button
                onClick={() => navigate('/account/tickets')}
                className="flex-1 py-3 px-4 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-colors"
              >
                Check My Tickets
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
