import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Calendar, MapPin, User, CheckCircle2, AlertTriangle, XCircle, 
  Download, Share2, Copy, Sparkles, ShieldCheck, Clock, RefreshCw
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
  quantity?: number;
  seatNumber: string;
  attendeeName: string;
  qrCodeValue: string;
  passType: string;
  paymentStatus: string;
  amountDue?: number;
  status: string;
  redeemedAt: string | null;
  eventGoogleMapsQuery?: string;
  passed?: boolean;
};

export function TicketPassPage() {
  const { slug, signature, passId } = useParams<{ slug?: string; signature?: string; passId?: string }>();
  const [searchParams] = useSearchParams();
  const querySig = searchParams.get('sig');
  const navigate = useNavigate();

  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'redeemed' | 'server_error'>('loading');
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
          if (res.status === 503 || data.error === 'PASS_SERVICE_UNAVAILABLE' || res.status === 500) {
            setState('server_error');
            setErrorMessage('Technical issue — pull down to retry or call +91-9876543210');
            return;
          }
          if (res.status === 410 || data.error === 'PASS_CANCELLED') {
            setState('invalid');
            setErrorMessage('This ticket has been cancelled or revoked.');
            return;
          }
          setState('invalid');
          setErrorMessage(data.error || 'Digital pass not found or invalid signature.');
          return;
        }
        const t = data.ticket || data.pass;
        setTicket(t);
        setState(t?.status === 'redeemed' || t?.redeemed ? 'redeemed' : 'ok');

        // Dynamic OpenGraph and Title metadata
        if (t) {
          document.title = `${t.eventTitle || 'Event Pass'} — ${t.attendeeName || 'Pass'} | Ash-vish Events`;
          document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${t.eventTitle || 'Event'} — ${t.attendeeName || 'Valued Guest'} | Ash-vish Events`);
          document.querySelector('meta[property="og:description"]')?.setAttribute('content', `Digital pass for ${t.eventTitle || 'Event'} on ${t.date || ''} at ${t.venue || ''}, ${t.city || ''}.`);
          if (t.eventPoster) {
            document.querySelector('meta[property="og:image"]')?.setAttribute('content', t.eventPoster);
          }
        }
      })
      .catch(() => {
        setState('server_error');
        setErrorMessage('Technical issue — pull down to retry or call +91-9876543210');
      });
  }, [slug, signature, passId, querySig]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenMaps = () => {
    if (!ticket) return;
    const query = ticket.eventGoogleMapsQuery || `${ticket.venue}, ${ticket.city}`;
    if (/^https?:\/\//i.test(query)) {
      window.open(query, '_blank', 'noopener,noreferrer');
      return;
    }
    // Deep link first: intent URL opens the Google Maps app on mobile Android,
    // fallback goes to the universal https URL for iOS / desktop browsers.
    const mapsDeepLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    const mapsUniversal = `https://maps.google.com/?q=${encodeURIComponent(query)}`;
    if (/Android/i.test(navigator.userAgent)) {
      window.location.href = mapsDeepLink;
    } else {
      window.open(mapsUniversal, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShare = () => {
    if (!ticket) return;
    if (navigator.share) {
      navigator.share({
        title: `${ticket.eventTitle} - Secure Pass`,
        text: `My digital pass for ${ticket.eventTitle}`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(`Check my pass for ${ticket.eventTitle}: ${window.location.href}`)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownloadQR = () => {
    if (!ticket) return;
    const svgEl = document.querySelector('#pass-qr-element svg') as SVGElement | null;
    if (svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, 600, 600);
          context.drawImage(image, 50, 50, 500, 500);
          const png = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = png;
          downloadLink.download = `Pass-${ticket.ticketNumber || 'QR'}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
      };
      image.src = blobURL;
    }
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

  if (state === 'server_error') {
    return (
      <div className="fixed inset-0 bg-[#070707] text-white flex flex-col items-center justify-center p-6 text-center selection:bg-[#D4AF37]">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6 shadow-2xl">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">Temporary Network Issue</h1>
        <p className="text-sm text-gray-400 max-w-md mb-8 leading-relaxed">
          {errorMessage || 'Technical issue — pull down to retry or call +91-9876543210'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-extrabold text-sm transition-all shadow-lg cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Now</span>
        </button>
      </div>
    );
  }

  if (state === 'invalid') {
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
  const isPaid = ticket?.paymentStatus === 'paid';

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
          {/* Status Banner Overlays */}
          {isRedeemed && (
            <div className="bg-red-600 text-white py-2 px-4 text-center text-xs font-extrabold uppercase tracking-widest z-20 flex items-center justify-center gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4" />
              ALREADY USED — Entry Completed
            </div>
          )}

          {ticket?.passed && !isRedeemed && (
            <div className="bg-amber-500/90 text-black py-2 px-4 text-center text-xs font-extrabold uppercase tracking-wider z-20 flex items-center justify-center gap-2 shadow-md">
              <Clock className="w-4 h-4" />
              The show has started — show this screen to gate staff
            </div>
          )}

          {/* Poster Header */}
          <div className="relative h-44 overflow-hidden bg-gray-900">
            <img 
              src={ticket?.eventPoster || "/sufiyana-shaam-poster.jpg"} 
              alt={ticket?.eventTitle}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/40" />
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
              {isPaid ? (
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/90 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-lg inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Paid
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-md bg-amber-500/90 text-black text-[10px] font-extrabold uppercase tracking-wider shadow-lg inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pay at Venue
                </span>
              )}
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <span className="px-2.5 py-0.5 rounded-md bg-[#D4AF37] text-black text-[10px] font-extrabold uppercase tracking-wider shadow">
                  {ticket?.tierName || 'Standard Entry'}
                </span>
                <h2 className="text-lg font-bold text-white mt-1 line-clamp-2 drop-shadow-lg">{ticket?.eventTitle}</h2>
              </div>
              <button
                onClick={handleOpenMaps}
                aria-label="Open venue location in Google Maps"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-black/55 hover:bg-black/75 border border-white/25 text-white text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-sm transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                Maps
              </button>
            </div>
          </div>

          {/* Ticket Body */}
          <div className="p-5 space-y-3 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Attendee</span>
              <span className="text-white font-bold text-sm">{ticket?.attendeeName}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Tickets</span>
              <span className="text-white font-bold">{ticket?.quantity ?? 1} × {ticket?.tierName || 'Standard'}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Ticket Ref</span>
              <span className="text-[#D4AF37] font-mono font-bold">{ticket?.ticketNumber}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-gray-400 font-medium">Payment Status</span>
              {isPaid ? (
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[11px] inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Pay at venue ({ticket?.amountDue ? `₹${ticket.amountDue}` : 'Pending'})
                </span>
              )}
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

            {/* Full-width Google Maps directions button */}
            <div className="pt-1.5">
              <button
                onClick={handleOpenMaps}
                aria-label="Get directions to the venue on Google Maps"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer  active:scale-[0.98]"
              >
                <MapPin className="w-4 h-4" />
                <span>Get Directions on Google Maps</span>
              </button>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-[#161616] p-6 border-t border-white/10 flex flex-col items-center justify-center space-y-3">
            <div id="pass-qr-element" className="p-3 bg-white rounded-2xl shadow-xl">
              <QRPlaceholder value={ticket?.qrCodeValue || 'ASHVISH-PASS'} size={240} showScanLine={!isRedeemed} />
            </div>
            <p className="text-[11px] text-gray-400 text-center max-w-xs leading-relaxed">
              Show this QR code at the entrance gate for instant check-in.
            </p>

            {/* Download & Share Actions */}
            <div className="grid grid-cols-2 gap-3 w-full pt-1">
              <button
                onClick={handleDownloadQR}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Save QR</span>
              </button>
              <button
                onClick={handleShare}
                className="py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Share Pass</span>
              </button>
            </div>
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
