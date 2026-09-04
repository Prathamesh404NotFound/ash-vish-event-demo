import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, QrCode, Keyboard, Search, CheckCircle2, 
  XCircle, AlertTriangle, Calendar, MapPin, User, Ticket,
  Camera, ArrowRight, RefreshCw
} from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';

type VerifyResult = {
  valid: boolean;
  used?: boolean;
  ticketNumber?: string;
  eventTitle?: string;
  venue?: string;
  date?: string;
  tierName?: string;
  attendeeName?: string;
  quantity?: number;
  error?: string;
};

export function VerifyTicketPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<'scan' | 'manual'>('manual');
  const [ticketNumber, setTicketNumber] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleVerify = useCallback(async (number?: string) => {
    const num = (number || ticketNumber).trim();
    if (!num) {
      setError('Please enter a ticket number.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/public/verify-ticket?ticketNumber=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResult({ valid: false, error: data.error || 'Ticket not found.' });
      } else {
        setResult({
          valid: true,
          used: data.used || false,
          ticketNumber: data.ticketNumber,
          eventTitle: data.eventTitle,
          venue: data.venue,
          date: data.date,
          tierName: data.tierName,
          attendeeName: data.attendeeName,
          quantity: data.quantity,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [ticketNumber]);

  const handleQRScan = useCallback((decodedText: string) => {
    // Extract ticket number from QR code value if it's a pass URL
    const match = decodedText.match(/ASH[-_]\d+[-_]SRV/i) || decodedText.match(/ticketNumber=([^&]+)/i);
    if (match) {
      const num = match[1] || match[0];
      setTicketNumber(num);
      handleVerify(num);
    } else {
      setTicketNumber(decodedText);
      handleVerify(decodedText);
    }
  }, [handleVerify]);

  const reset = () => {
    setResult(null);
    setTicketNumber('');
    setError('');
    inputRef.current?.focus();
  };

  const statusColor = result?.used
    ? 'text-amber-400 border-amber-400/30 bg-amber-400/5'
    : result?.valid
    ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'
    : 'text-red-400 border-red-400/30 bg-red-400/5';

  const StatusIcon = result?.used ? AlertTriangle : result?.valid ? CheckCircle2 : XCircle;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h1 className="font-heading font-extrabold text-3xl text-white">{t('verify.title')}</h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">{t('verify.subtitle')}</p>
        </motion.div>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-[#141414] rounded-xl border border-white/10">
          <button
            onClick={() => { setMode('manual'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              mode === 'manual' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            {t('verify.enterNumber')}
          </button>
          <button
            onClick={() => { setMode('scan'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              mode === 'scan' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            {t('verify.scanQR')}
          </button>
        </div>

        {/* Input Area */}
        <AnimatePresence mode="wait">
          {mode === 'manual' ? (
            <motion.div
              key="manual"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  placeholder={t('verify.placeholder')}
                  className="w-full pl-12 pr-4 py-4 bg-[#141414] border border-white/10 rounded-xl text-white text-lg font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#D4AF37] transition-colors"
                  autoFocus
                />
              </div>
              <button
                onClick={() => handleVerify()}
                disabled={loading || !ticketNumber.trim()}
                className="w-full py-4 rounded-xl bg-[#D4AF37] text-black font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#E3C456] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {t('verify.button')}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="bg-[#141414] border border-white/10 rounded-xl p-8 text-center">
                <QrCode className="w-12 h-12 text-[#D4AF37] mx-auto mb-4" />
                <p className="text-gray-400 text-sm mb-2">Point your camera at the ticket QR code</p>
                <p className="text-gray-600 text-xs">
                  QR scanning requires camera access. Enter the ticket number manually if camera is unavailable.
                </p>
                <button
                  onClick={() => setMode('manual')}
                  className="mt-4 px-4 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-bold hover:bg-white/10 cursor-pointer"
                >
                  Switch to manual entry
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`rounded-2xl border p-6 space-y-4 ${statusColor}`}
            >
              <div className="flex items-center gap-3">
                <StatusIcon className="w-8 h-8 shrink-0" />
                <div>
                  <p className="font-heading font-extrabold text-lg">
                    {result.used ? t('verify.used') : result.valid ? t('verify.valid') : t('verify.invalid')}
                  </p>
                  {result.ticketNumber && (
                    <p className="text-xs opacity-70 font-mono mt-0.5">{result.ticketNumber}</p>
                  )}
                </div>
              </div>

              {result.valid && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {result.eventTitle && (
                    <div className="flex items-center gap-2">
                      <Ticket className="w-3.5 h-3.5 opacity-60" />
                      <span>{result.eventTitle}</span>
                    </div>
                  )}
                  {result.venue && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 opacity-60" />
                      <span>{result.venue}</span>
                    </div>
                  )}
                  {result.date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 opacity-60" />
                      <span>{result.date}</span>
                    </div>
                  )}
                  {result.tierName && (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 opacity-60" />
                      <span>{result.tierName}</span>
                    </div>
                  )}
                  {result.attendeeName && (
                    <div className="flex items-center gap-2 col-span-2">
                      <User className="w-3.5 h-3.5 opacity-60" />
                      <span>{result.attendeeName}{result.quantity ? ` × ${result.quantity}` : ''}</span>
                    </div>
                  )}
                </div>
              )}

              {result.error && (
                <p className="text-xs opacity-70">{result.error}</p>
              )}

              <button
                onClick={reset}
                className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 cursor-pointer"
              >
                {t('verify.scanQR')} / {t('verify.enterNumber')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
