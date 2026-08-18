import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { 
  Calendar, MapPin, User, CheckCircle2, AlertTriangle, XCircle, 
  Download, Share2, Copy, Sparkles, ShieldCheck 
} from 'lucide-react';
import { QRPlaceholder } from '../components/QRPlaceholder';

type TicketPayload = {
  ticketNumber: string;
  eventTitle: string;
  eventPoster: string;
  venue: string;
  city: string;
  date: string;
  time: string;
  tierName: string;
  seatNumber: string;
  attendeeName: string;
  qrCodeValue: string;
  passType: string;
  paymentStatus: string;
  status: string;
  redeemedAt: string | null;
};

export function TicketPassPage() {
  const { slug, signature, passId } = useParams<{ slug?: string; signature?: string; passId?: string }>();
  const [searchParams] = useSearchParams();
  const querySig = searchParams.get('sig');
  const navigate = useNavigate();

  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'redeemed' | 'error'>('loading');
  const [ticket, setTicket] = useState<TicketPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const activeSlug = slug || passId;
    const activeSig = signature || querySig;

    if (!activeSlug) {
      setState('invalid');
      setErrorMessage('Missing secure pass link parameters.');
      return;
    }

    const passEndpoint = activeSig 
      ? `/api/passes/${encodeURIComponent(activeSlug)}?sig=${encodeURIComponent(activeSig)}`
      : `/api/passes/${encodeURIComponent(activeSlug)}`;

    fetch(passEndpoint)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (res.status === 410 || data.error === 'PASS_CANCELLED') {
            setState('invalid');
            setErrorMessage('This pass has been cancelled or revoked.');
            return;
          }
          setState('invalid');
          setErrorMessage(data.error || 'Digital pass not found or invalid signature.');
          return;
        }
        const t = data.ticket || data.pass;
        setTicket(t);
        setState(t?.status === 'redeemed' || t?.redeemed ? 'redeemed' : 'ok');
      })
      .catch(() => {
        setState('error');
        setErrorMessage('Network error while verifying digital pass.');
      });
  }, [slug, signature, passId, querySig]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (state === 'loading') {
    return (
      <div className="fixed inset-0 bg-[#070707] text-white flex flex-col items-center justify-center p-6 selection:bg-[#D4AF37]">
        <div className="w-16 h-16 rounded-full border-4 border-[#D4AF37]/20 border-t-[#D4AF37] animate-spin mb-6" />
        <h2 className="text-xl font-bold tracking-tight text-[#F3E5AB]">Verifying Secure Digital Pass...</h2>
        <p className="text-sm text-gray-400 mt-2">Checking cryptographic signature & gate permissions</p>
      </div>
    );
  }

  if (state === 'invalid' || state === 'error') {
    return (
      <div className="fixed inset-0 bg-[#070707] text-white flex flex-col items-center justify-center p-6 text-center selection:bg-[#D4AF37]">
        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6 shadow-2xl">
          <XCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">Invalid or Expired Pass</h1>
        <p className="text-sm text-gray-400 max-w-md mb-8 leading-relaxed">
          {errorMessage || 'This pass link is invalid, expired, or has been revoked by the organiser.'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-extrabold text-sm transition-all shadow-lg cursor-pointer"
        >
          Explore Ash-Vish Events
        </button>
      </div>
    );
  }

  const isRedeemed = state === 'redeemed' || ticket?.status === 'redeemed';

  return (
    <div className="fixed inset-0 bg-[#070707] text-gray-100 overflow-y-auto selection:bg-[#D4AF37] selection:text-black"
         style={{ backgroundImage: 'radial-gradient(ellipse at top, #1a1408 0%, #070707 60%)' }}>
      
      <div className="max-w-md mx-auto min-h-screen flex flex-col justify-between p-4 sm:p-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center pt-4 pb-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-bold tracking-widest uppercase mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Official Digital QR Pass
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">ASH-VISH EVENTS</h1>
          <p className="text-xs text-gray-400">Verified Secure Gateway Pass · Kolhapur & India</p>
        </div>

        {/* Ticket Card */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative bg-[#111] rounded-3xl border border-white/15 overflow-hidden shadow-2xl shadow-black my-4"
        >
          {/* Redeemed Banner Overlay */}
          {isRedeemed && (
            <div className="absolute inset-x-0 top-0 bg-red-600 text-white py-2 px-4 text-center text-xs font-extrabold uppercase tracking-widest z-20 flex items-center justify-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4" />
              ALREADY USED — Entry Completed
            </div>
          )}

          {/* Poster Header */}
          <div className="relative h-40 overflow-hidden bg-gray-900">
            <img 
              src={ticket?.eventPoster || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800"} 
              alt={ticket?.eventTitle}
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/40" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-md bg-[#D4AF37] text-black text-[10px] font-extrabold uppercase tracking-wider">
                  {ticket?.tierName || 'Standard Entry'}
                </span>
                <h2 className="text-lg font-bold text-white mt-1 line-clamp-1">{ticket?.eventTitle}</h2>
              </div>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="p-5 space-y-3.5 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Attendee</span>
              <span className="text-white font-bold text-sm">{ticket?.attendeeName}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Ticket Ref</span>
              <span className="text-[#D4AF37] font-mono font-bold">{ticket?.ticketNumber}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Seat / Access</span>
              <span className="text-white font-semibold">{ticket?.tierName} · {ticket?.seatNumber}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Date & Time</span>
              <span className="text-white font-semibold">{ticket?.date} @ {ticket?.time}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-400 font-medium">Venue</span>
              <span className="text-white font-semibold text-right max-w-[200px] truncate">{ticket?.venue}, {ticket?.city}</span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-[#161616] p-6 border-t border-white/10 flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-white rounded-2xl shadow-xl">
              <QRPlaceholder value={ticket?.qrCodeValue || 'ASHVISH-PASS'} size={240} showScanLine={!isRedeemed} />
            </div>
            <p className="text-[11px] text-gray-400 text-center max-w-xs leading-relaxed">
              Show this QR code at the entrance gate for instant check-in.
            </p>
          </div>

        </motion.div>

        {/* Actions */}
        <div className="space-y-3 pb-4">
          <button
            onClick={handleCopyLink}
            className="w-full py-3 rounded-xl bg-[#222] hover:bg-[#333] border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Copy className="w-4 h-4 text-[#D4AF37]" />
            <span>{copied ? 'Pass Link Copied to Clipboard!' : 'Copy Secure Pass Link'}</span>
          </button>
          <div className="text-center text-[10px] text-gray-500">
            Ash-vish Events Gate Security · Kolhapur, Maharashtra
          </div>
        </div>

      </div>
    </div>
  );
}
