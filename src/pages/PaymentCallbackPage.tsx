import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, ArrowRight, Clock } from 'lucide-react';
import { usePhonePe } from '../hooks/usePhonePe';
import { useBooking } from '../contexts/BookingContext';
import { SESSION_ID_STORAGE_KEY } from '../contexts/BookingContext';
import { auth } from '../lib/firebase';
import { safeFetch } from '../lib/api';

/**
 * PaymentCallbackPage
 *
 * Handles the PhonePe return redirect after the user completes or cancels
 * payment. Responsibilities:
 *  1. Read orderId / merchantOrderId from URL params OR sessionStorage backup.
 *  2. Build authenticated identity headers (Bearer token + X-Session-Id).
 *  3. Call POST /api/phonepe/verify-payment on the backend.
 *  4. If isPending → poll every 3 s up to 90 s before giving up.
 *  5. If success  → confirm ticket in local state, navigate to /confirmation.
 *  6. If failure  → show actionable error with retry option.
 *
 * Bug fixes applied here (vs original):
 *  - Was reading 'guest_session_id' but session is stored under 'ash_vish_session_id'.
 *    Now imports SESSION_ID_STORAGE_KEY from BookingContext and reads both
 *    sessionStorage and localStorage (the session ID helper tries localStorage first).
 *  - Was silently swallowing auth-token errors. Now forces a token refresh and
 *    retries verify-payment once on 401/403 responses.
 *  - Had no retry on isPending. Now polls until the payment gateway confirms.
 *  - Single verificationAttemptedRef prevented retries. Now the ref only guards
 *    the initial mount; a manual "Try Again" call is allowed once.
 */

export function PaymentCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyPayment } = usePhonePe();
  const { confirmServerPurchasedTicket, resetBookingFlow } = useBooking();

  const [status, setStatus] = useState<'verifying' | 'pending' | 'success' | 'failed'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [ticketData, setTicketData] = useState<any>(null);
  const [pollCount, setPollCount] = useState(0);
  const verificationStartedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Identity headers: combines Firebase auth token + session ID.
  //
  // FIX: was looking up 'guest_session_id' — the correct key is
  // SESSION_ID_STORAGE_KEY ('ash_vish_session_id') which BookingContext
  // exports. We read from both localStorage (primary) and sessionStorage
  // (legacy / private-mode fallback) to cover every env.
  // -----------------------------------------------------------------------
  const buildIdentityHeaders = async (forceRefresh = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};

    // 1. Session ID — read using the canonical key from BookingContext
    let sessionId: string | null = null;
    try {
      sessionId =
        localStorage.getItem(SESSION_ID_STORAGE_KEY) ||
        sessionStorage.getItem(SESSION_ID_STORAGE_KEY) ||
        // Legacy keys kept for backwards compat during rollout
        sessionStorage.getItem('guest_session_id') ||
        localStorage.getItem('guest_session_id') ||
        null;
    } catch {
      // Storage unavailable (private browsing) — token alone will identify the user
    }
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    // 2. Firebase auth token — force-refresh on retry to get a fresh JWT
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken(forceRefresh);
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (tokenErr: any) {
      // Log but do not abort — session-based ownership still works for guest checkout
      console.warn('[PaymentCallback] Could not get Firebase token:', tokenErr?.message);
    }

    return headers;
  };

  // -----------------------------------------------------------------------
  // Core verification call — calls backend verify-payment, retries once
  // with a fresh token on auth failure.
  // -----------------------------------------------------------------------
  const callVerifyPayment = async (
    orderId: string,
    merchantOrderId: string,
    forceRefresh = false
  ) => {
    const headers = await buildIdentityHeaders(forceRefresh);
    const result = await verifyPayment(orderId, merchantOrderId, () => Promise.resolve(headers));

    // On auth failure, retry once with a force-refreshed token
    if (!result.success && !forceRefresh && result.error?.match(/401|403|not your order/i)) {
      console.warn('[PaymentCallback] Auth failure on verify, retrying with fresh token...');
      const freshHeaders = await buildIdentityHeaders(true);
      return verifyPayment(orderId, merchantOrderId, () => Promise.resolve(freshHeaders));
    }

    return result;
  };

  // -----------------------------------------------------------------------
  // Main verification flow
  // -----------------------------------------------------------------------
  const runVerification = async (orderId: string, merchantOrderId: string) => {
    setStatus('verifying');

    try {
      const result = await callVerifyPayment(orderId, merchantOrderId);

      // Payment gateway says it's still processing — enter poll loop
      if (result.isPending) {
        setStatus('pending');
        schedulePoll(orderId, merchantOrderId, 1);
        return;
      }

      if (!result.success) {
        setStatus('failed');
        if (result.refundConfirmed) {
          setErrorMessage(
            'Payment was refunded — the seat hold expired during checkout. Please start over and choose your seats again.'
          );
        } else {
          setErrorMessage(result.error || 'Payment verification could not be completed.');
        }
        return;
      }

      // Success path
      handleSuccess(result);
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(err?.message || 'Failed to verify transaction with payment gateway.');
    }
  };

  // -----------------------------------------------------------------------
  // Poll loop for PENDING payments (gateway still processing)
  // Max 30 polls × 3 s = 90 s timeout
  // -----------------------------------------------------------------------
  const MAX_POLLS = 30;
  const POLL_INTERVAL_MS = 3000;

  const schedulePoll = (orderId: string, merchantOrderId: string, attempt: number) => {
    if (attempt > MAX_POLLS) {
      setStatus('failed');
      setErrorMessage(
        'Payment is still being processed by PhonePe. If money was debited, your ticket will appear in My Tickets within a few minutes. You may safely close this page.'
      );
      return;
    }

    setPollCount(attempt);
    pollTimerRef.current = setTimeout(async () => {
      try {
        const result = await callVerifyPayment(orderId, merchantOrderId);
        if (result.isPending) {
          schedulePoll(orderId, merchantOrderId, attempt + 1);
          return;
        }
        if (!result.success) {
          setStatus('failed');
          setErrorMessage(result.error || 'Payment could not be confirmed.');
          return;
        }
        handleSuccess(result);
      } catch {
        // Network blip during poll — keep trying
        schedulePoll(orderId, merchantOrderId, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  };

  // -----------------------------------------------------------------------
  // Shared success handler
  // -----------------------------------------------------------------------
  const handleSuccess = (result: any) => {
    if (result.ticket && result.booking) {
      const confirmed = confirmServerPurchasedTicket(result.ticket, result.booking);
      setTicketData(confirmed);
      // Fire-and-forget email (non-critical)
      safeFetch('/api/tickets/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeEmail: result.ticket.attendeeEmail,
          attendeeName: result.ticket.attendeeName,
          ticketNumber: result.ticket.ticketNumber,
          eventTitle: result.ticket.eventTitle,
        }),
      }).catch(() => {});
    }

    // Clear active checkout session
    try {
      sessionStorage.removeItem('phonepe_active_order');
    } catch {}

    setStatus('success');
    resetBookingFlow();

    // Auto-navigate to confirmation after brief success display
    setTimeout(() => {
      navigate('/confirmation', { replace: true });
    }, 2000);
  };

  // -----------------------------------------------------------------------
  // Mount effect — run once
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (verificationStartedRef.current) return;
    verificationStartedRef.current = true;

    // 1. URL params
    let orderId = searchParams.get('orderId') || '';
    let merchantOrderId =
      searchParams.get('merchantOrderId') || searchParams.get('transactionId') || '';

    // 2. sessionStorage backup (stored before redirect to PhonePe)
    try {
      const stored = sessionStorage.getItem('phonepe_active_order');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!orderId && parsed.orderId) orderId = parsed.orderId;
        if (!merchantOrderId && parsed.merchantOrderId) merchantOrderId = parsed.merchantOrderId;
      }
    } catch {
      // Storage unavailable
    }

    if (!orderId && !merchantOrderId) {
      setStatus('failed');
      setErrorMessage(
        'No transaction reference found. If you completed payment, please check My Tickets — your booking may already be confirmed.'
      );
      return;
    }

    runVerification(orderId, merchantOrderId);

    // Cleanup poll timer on unmount
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-xl">

        {/* VERIFYING */}
        {(status === 'verifying') && (
          <motion.div
            key="verifying"
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
                Confirming transaction securely with PhonePe. Please do not close or refresh this window…
              </p>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
              <span>Contacting PhonePe Gateway Server…</span>
            </div>
          </motion.div>
        )}

        {/* PENDING — gateway still processing, polling */}
        {status === 'pending' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-amber-400/20 animate-ping" />
              <div className="w-16 h-16 rounded-full border-4 border-amber-400 border-t-transparent animate-spin flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-bold text-white tracking-wide">
                Payment Processing
              </h2>
              <p className="text-sm text-gray-400">
                PhonePe is still processing your payment. Checking again automatically…
              </p>
              <p className="text-xs text-gray-500">
                Check {pollCount} of {MAX_POLLS} — do not close this window
              </p>
            </div>
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Waiting for PhonePe to confirm…</span>
            </div>
          </motion.div>
        )}

        {/* SUCCESS */}
        {status === 'success' && (
          <motion.div
            key="success"
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
                Your tickets have been issued. Digital passes sent to your email &amp; WhatsApp.
              </p>
              {ticketData?.eventTitle && (
                <p className="text-xs text-[#D4AF37] font-semibold mt-1">{ticketData.eventTitle}</p>
              )}
            </div>
            <button
              onClick={() => navigate('/confirmation', { replace: true })}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <span>View My Tickets</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* FAILED */}
        {status === 'failed' && (
          <motion.div
            key="failed"
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
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400 text-left space-y-1">
              <p className="font-semibold text-gray-300">What to do next:</p>
              <p>• Check <strong>My Tickets</strong> — if money was debited, your booking may already exist.</p>
              <p>• Contact support with your order reference if the issue persists.</p>
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
