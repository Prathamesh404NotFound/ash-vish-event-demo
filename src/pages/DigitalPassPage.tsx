import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { 
  Calendar, MapPin, User, CheckCircle2, AlertTriangle, XCircle, 
  Download, Printer, Share2, Copy, Sparkles, ShieldCheck, ArrowRight, MessageSquareCode 
} from 'lucide-react';
import { passUrl } from '../utils/passLink';
import { sendTicketToWhatsApp } from '../utils/whatsapp';

export function DigitalPassPage() {
  const { passId } = useParams<{ passId: string }>();
  const [searchParams] = useSearchParams();
  const sig = searchParams.get('sig');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [passData, setPassData] = useState<any>(null);
  const [errorState, setErrorState] = useState<'404' | '403' | '410' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchPass() {
      if (!passId || !sig) {
        setErrorState('403');
        setErrorMessage('Invalid pass link parameters.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/passes/${passId}?sig=${encodeURIComponent(sig)}`);
        const data = await res.json();

        if (res.status === 410 || data.error === 'PASS_CANCELLED') {
          setErrorState('410');
          setErrorMessage(data.message || 'This ticket has been cancelled.');
          setLoading(false);
          return;
        }
        if (res.status === 403) {
          setErrorState('403');
          setErrorMessage('Invalid or forged digital pass signature.');
          setLoading(false);
          return;
        }
        if (res.status === 404 || !data.success) {
          setErrorState('404');
          setErrorMessage('Digital pass not found or expired.');
          setLoading(false);
          return;
        }
        setPassData(data.pass);
      } catch (err: any) {
        setErrorState('error');
        setErrorMessage(err.message || 'Could not load digital pass.');
      } finally {
        setLoading(false);
      }
    }
    fetchPass();
  }, [passId, sig]);

  const handleCopyLink = () => {
    if (!passId || !sig) return;
    const link = passUrl(passId, sig);
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadPNG = () => {
    const svgElement = document.getElementById('pass-qr-svg');
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      if (ctx) {
        canvas.width = 600;
        canvas.height = 600;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 600, 600);
        ctx.drawImage(img, 50, 50, 500, 500);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `ash-vish-pass-${passData?.ticketNumber || 'ticket'}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060606] text-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full border-4 border-[#D4AF37]/20 border-t-[#D4AF37] animate-spin mb-6" />
        <h2 className="text-xl font-bold tracking-tight text-[#F3E5AB]">Verifying Secure Digital Pass...</h2>
        <p className="text-sm text-gray-400 mt-2">Checking cryptographic signature & gate permissions</p>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="min-h-screen bg-[#060606] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6 shadow-2xl shadow-red-500/10">
          {errorState === '410' ? <AlertTriangle className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">
          {errorState === '410' ? 'Ticket Cancelled' : 'Invalid or Expired Pass'}
        </h1>
        <p className="text-sm text-gray-400 max-w-md mb-8 leading-relaxed">
          {errorMessage || 'This link may have been revoked, expired, or is invalid.'}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-extrabold text-sm transition-all shadow-lg shadow-[#D4AF37]/20 cursor-pointer"
        >
          Explore Ash-Vish Events
        </button>
      </div>
    );
  }

  const isRedeemed = passData?.redeemed || passData?.status === 'redeemed';
  const isReservation = passData?.passType === 'reservation' && passData?.paymentStatus !== 'paid';

  return (
    <div className="min-h-screen bg-[#060606] text-white flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#D4AF37] selection:text-black">
      {/* Background ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Official Digital Pass
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">ASH-VISH EVENTS</h2>
          <p className="text-xs text-gray-400 mt-1">Verified Secure Gateway Pass</p>
        </div>

        {/* Cinematic Ticket Card */}
        <div className="relative bg-[#0F0F0F] rounded-3xl border border-white/15 overflow-hidden shadow-2xl shadow-black/80">
          {/* Top banner / Poster preview */}
          <div className="relative h-44 overflow-hidden bg-gray-900">
            <img 
              src={passData?.eventPoster || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800"} 
              alt={passData?.eventTitle}
              className="w-full h-full object-cover filter brightness-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F0F] via-transparent to-black/40" />
            
            {/* Status Badge */}
            <div className="absolute top-4 right-4">
              {isRedeemed ? (
                <span className="px-3 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                  <XCircle className="w-3.5 h-3.5" /> REDEEMED
                </span>
              ) : isReservation ? (
                <span className="px-3 py-1.5 rounded-full bg-amber-500/90 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg">
                  <AlertTriangle className="w-3.5 h-3.5" /> PAY AT COUNTER
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full bg-emerald-500/90 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VALID FOR ENTRY
                </span>
              )}
            </div>

            <div className="absolute bottom-4 left-5 right-5">
              <span className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold block mb-1">
                {passData?.tierName} Pass
              </span>
              <h1 className="text-xl font-extrabold text-white leading-tight drop-shadow-md">
                {passData?.eventTitle}
              </h1>
            </div>
          </div>

          {/* Perforated divider line */}
          <div className="relative flex items-center justify-between px-4 bg-[#0F0F0F]">
            <div className="w-6 h-6 rounded-full bg-[#060606] -ml-7 border-r border-white/15" />
            <div className="flex-1 border-t border-dashed border-white/25 mx-2" />
            <div className="w-6 h-6 rounded-full bg-[#060606] -mr-7 border-l border-white/15" />
          </div>

          {/* Ticket Body Details */}
          <div className="p-6 space-y-5 bg-[#0F0F0F]">
            {/* Attendee & Ref */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Attendee</span>
                <span className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <User className="w-4 h-4 text-[#D4AF37]" /> {passData?.attendeeName}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Ticket Ref</span>
                <span className="text-sm font-mono font-bold text-[#F3E5AB]">{passData?.ticketNumber}</span>
              </div>
            </div>

            {/* Date, Time & Venue */}
            <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Date & Time</span>
                <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> {passData?.date} • {passData?.time}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Venue</span>
                <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" /> {passData?.venue}, {passData?.city}
                </span>
              </div>
            </div>

            {/* Seat / Section */}
            <div className="flex items-center justify-between bg-white/5 rounded-2xl p-3 border border-white/10">
              <span className="text-xs text-gray-400">Assigned Seat / Access</span>
              <span className="text-xs font-bold text-[#D4AF37] font-mono">{passData?.seatNumber}</span>
            </div>

            {/* QR Code Section */}
            <div className="flex flex-col items-center justify-center pt-2 pb-1 relative">
              <div className="bg-white p-4 rounded-2xl shadow-xl relative overflow-hidden group">
                <QRCodeSVG
                  id="pass-qr-svg"
                  value={passData?.qrCodeValue || passData?.ticketNumber}
                  size={190}
                  level="H"
                  includeMargin={false}
                />
                {/* Brand logo overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-xl bg-black border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] font-bold text-xs shadow-lg">
                    AV
                  </div>
                </div>

                {/* Redeemed Overlay */}
                {isRedeemed && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-2 text-center">
                    <span className="text-red-500 font-black text-lg tracking-widest border-2 border-red-500 px-3 py-1 rounded-lg transform -rotate-6">
                      ALREADY USED
                    </span>
                    <span className="text-[10px] text-gray-300 mt-2">
                      Redeemed at {passData?.redeemedAt ? new Date(passData.redeemedAt).toLocaleTimeString() : 'Venue Gate'}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-400 mt-3 text-center flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Present this QR at the venue entrance for instant check-in
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCopyLink}
              className="py-3 px-4 rounded-xl bg-[#141414] hover:bg-[#1E1E1E] border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Copy className="w-4 h-4 text-[#D4AF37]" />
              <span>{copied ? 'Copied Link!' : 'Copy Link'}</span>
            </button>

            <button
              onClick={() => {
                // Share to whatsapp helper
                const dummyTicket: any = {
                  ...passData,
                  attendeePhone: ''
                };
                sendTicketToWhatsApp(dummyTicket);
              }}
              className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              <MessageSquareCode className="w-4 h-4 stroke-[2.5]" />
              <span>WhatsApp</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPNG}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#D4AF37]/20"
            >
              <Download className="w-4 h-4" />
              <span>Download QR</span>
            </button>

            <button
              onClick={() => window.print()}
              className="py-3 px-4 rounded-xl bg-[#141414] hover:bg-[#1E1E1E] border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>Print Pass</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-8 text-[11px] text-gray-500">
          Powered by Ash-Vish Events Secure Gate System
        </div>
      </motion.div>
    </div>
  );
}
