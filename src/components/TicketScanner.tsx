import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  Camera,
  RefreshCw,
  AlertTriangle,
  User,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Ticket as TicketIcon
} from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { Ticket } from '../types';

interface TicketScannerProps {
  title?: string;
  subtitle?: string;
}

export const TicketScanner: React.FC<TicketScannerProps> = ({
  title = 'Gate Pass Scanner',
  subtitle = 'Scan digital/printed ticket QR codes or perform manual attendee lookups.',
}) => {
  const { scanTicketQR, allTickets } = useBooking();
  const { user } = useAuth();

  const [inputVal, setInputVal] = useState('');
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    ticket?: Ticket;
    alreadyRedeemed?: boolean;
    isVoid?: boolean;
    isTampered?: boolean;
  } | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);

  const handleScanCode = async (code: string) => {
    if (!code.trim()) return;
    const res = await scanTicketQR(code, user?.name || 'Gate Staff #402');
    setLastResult(res);
  };

  // Start Camera Scanning
  const startCamera = async () => {
    setCameraError(null);
    try {
      const html5QrCode = new Html5Qrcode('reader');
      html5QrcodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
        },
        (decodedText) => {
          handleScanCode(decodedText);
        },
        (_errorMessage) => {
          // ignore scan frame errors
        }
      );
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Camera access unavailable or blocked on this device/browser. Please use Manual Lookup or sample codes.');
      setIsCameraActive(false);
    }
  };

  // Stop Camera Scanning
  const stopCamera = async () => {
    if (html5QrcodeRef.current && isCameraActive) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (e) {
        console.warn('Error stopping camera:', e);
      }
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [activeTab]);

  // Filtered tickets for manual lookup fallback
  const filteredManualTickets = allTickets.filter((t) => {
    if (!manualSearchQuery.trim()) return true;
    const q = manualSearchQuery.toLowerCase();
    return (
      t.attendeeName.toLowerCase().includes(q) ||
      t.attendeePhone.toLowerCase().includes(q) ||
      t.ticketNumber.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.eventTitle.toLowerCase().includes(q) ||
      t.seatNumber.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in">
      {/* Scanner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]">
              <QrCode className="w-5 h-5" />
            </span>
            <h2 className="font-heading font-extrabold text-xl text-white">{title}</h2>
          </div>
          <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('camera')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
                : 'bg-[#1C1C1C] text-gray-400 hover:text-white border border-white/5'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera Stream</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
                : 'bg-[#1C1C1C] text-gray-400 hover:text-white border border-white/5'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Manual Lookup</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Scanner Section */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'camera' ? (
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#D4AF37]" />
                  Camera QR Decoder
                </span>
                {isCameraActive && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold animate-pulse">
                    Camera Stream Active
                  </span>
                )}
              </div>

              {cameraError ? (
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Camera Permission Notice</span>
                  </div>
                  <p className="text-amber-200/80">{cameraError}</p>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-xs border border-amber-500/30 cursor-pointer"
                  >
                    Switch to Manual Lookup
                  </button>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black min-h-[280px] flex items-center justify-center">
                  <div id="reader" className="w-full text-white" />
                </div>
              )}

              <div className="p-3 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Direct Token or QR Code Payload Input
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScanCode(inputVal)}
                    placeholder="Paste signed HMAC token (e.g. ASH_PASS_v1...)"
                    className="w-full pl-4 pr-28 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white placeholder-gray-500 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    onClick={() => handleScanCode(inputVal)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-[11px] cursor-pointer"
                  >
                    Scan QR Token
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Fallback Manual Booking Lookup */
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#D4AF37]" />
                  Manual Attendee Booking Lookup
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Search guest by Name, Phone, Ticket Number, or Booking ID when physical QR scan is unavailable.
                </p>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  placeholder="Filter by name, phone, seat number, ticket ID..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredManualTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-500 border border-dashed border-white/10 rounded-2xl">
                    No tickets found matching "{manualSearchQuery}".
                  </div>
                ) : (
                  filteredManualTickets.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-2xl bg-[#1C1C1C] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{t.attendeeName}</span>
                          <span className="font-mono text-[11px] text-[#D4AF37] font-semibold">
                            #{t.ticketNumber}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-400 text-[11px]">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-500" /> {t.attendeePhone || 'No Phone'}
                          </span>
                          <span>• {t.eventTitle}</span>
                          <span className="text-emerald-400 font-bold">({t.tierName} - {t.seatNumber})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {t.status === 'redeemed' || t.status === 'used' ? (
                          <div className="text-right">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 block">
                              REDEEMED
                            </span>
                            <span className="text-[10px] text-gray-500 block mt-0.5">
                              {t.scannedAt || 'Scanned'}
                            </span>
                          </div>
                        ) : t.status === 'void' || t.status === 'cancelled' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            VOID / REVOKED
                          </span>
                        ) : (
                          <button
                            onClick={() => handleScanCode(t.id)}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs shadow-md shadow-[#D4AF37]/20 transition-all cursor-pointer"
                          >
                            Redeem Pass
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Quick Simulation Testing Triggers */}
          <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Quick Test Token Scans
              </h3>
              <span className="text-[10px] text-gray-500">Click to run test scan</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => handleScanCode('ASH_PASS_v1.b25saW5lX29yZGVyXzA1:evt_001.valid_sig')}
                className="p-2.5 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 text-left transition-all cursor-pointer"
              >
                <span className="font-bold text-emerald-400 block">Valid Signed Pass</span>
                <span className="text-[10px] text-gray-400">HMAC-SHA256 Signed</span>
              </button>

              <button
                onClick={() => handleScanCode('ASH_PASS_v1.TAMPERED_HEADER_FAIL.fake_sig')}
                className="p-2.5 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 text-left transition-all cursor-pointer"
              >
                <span className="font-bold text-red-400 block">Tampered Pass</span>
                <span className="text-[10px] text-gray-400">Fake Signature Test</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scan Result Sidebar */}
        <div className="lg:col-span-5">
          {lastResult ? (
            <div
              className={`p-6 rounded-3xl border space-y-6 shadow-2xl transition-all ${
                lastResult.success
                  ? 'bg-emerald-950/20 border-emerald-500/40'
                  : lastResult.alreadyRedeemed
                  ? 'bg-amber-950/20 border-amber-500/40'
                  : 'bg-red-950/20 border-red-500/40'
              }`}
            >
              <div className="flex items-center gap-3">
                {lastResult.success ? (
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 flex-shrink-0" />
                ) : lastResult.alreadyRedeemed ? (
                  <Clock className="w-10 h-10 text-amber-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-10 h-10 text-red-400 flex-shrink-0" />
                )}
                <div>
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                      lastResult.success
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : lastResult.alreadyRedeemed
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}
                  >
                    {lastResult.success
                      ? 'Access Granted'
                      : lastResult.alreadyRedeemed
                      ? 'Already Redeemed'
                      : lastResult.isVoid
                      ? 'Ticket Void'
                      : 'Security Failure'}
                  </span>
                  <p className="font-heading font-extrabold text-base text-white mt-1 leading-snug">
                    {lastResult.message}
                  </p>
                </div>
              </div>

              {lastResult.ticket && (
                <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <span className="text-gray-400">Ticket No:</span>
                    <span className="font-mono font-bold text-[#D4AF37]">{lastResult.ticket.ticketNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Guest Name:</span>
                    <span className="font-bold text-white">{lastResult.ticket.attendeeName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Phone:</span>
                    <span className="text-gray-300">{lastResult.ticket.attendeePhone || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Event:</span>
                    <span className="font-semibold text-gray-200 truncate max-w-[170px]">
                      {lastResult.ticket.eventTitle}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Pass Tier:</span>
                    <span className="font-bold text-emerald-400">{lastResult.ticket.tierName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Seat / Section:</span>
                    <span className="text-gray-200">{lastResult.ticket.seatNumber}</span>
                  </div>

                  {lastResult.ticket.scannedBy && (
                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-amber-300">
                      <span>Redeemed Officer:</span>
                      <span className="font-semibold">{lastResult.ticket.scannedBy}</span>
                    </div>
                  )}

                  {lastResult.ticket.scannedAt && (
                    <div className="flex items-center justify-between text-[11px] text-amber-300">
                      <span>Redemption Time:</span>
                      <span className="font-semibold">{lastResult.ticket.scannedAt}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setLastResult(null);
                  setInputVal('');
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#222] hover:bg-[#333] text-gray-200 font-bold text-xs transition-all border border-white/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Ready for Next Attendee</span>
              </button>
            </div>
          ) : (
            <div className="h-full min-h-[320px] p-8 rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center text-center space-y-3 text-gray-500">
              <QrCode className="w-12 h-12 stroke-[1.5] text-gray-600" />
              <p className="text-sm font-semibold text-gray-400">Ready to Scan</p>
              <p className="text-xs max-w-xs leading-relaxed">
                Scan or enter a ticket QR token to inspect guest details and validate gate admission.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
