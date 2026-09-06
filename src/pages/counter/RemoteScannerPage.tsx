import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { CheckCircle2, XCircle, AlertCircle, Link2, Loader2 } from 'lucide-react';
import { joinScanLink, submitRemoteScan, watchScanLink, watchScanEntries, SCANNER_LINK_TTL_MS } from '../../lib/scannerLink';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Remote Gate Scanner (phone side).
 *
 * A lightweight, mobile-first scanner that pairs with the laptop gate
 * scanner via a 6-digit code. Scans are submitted over RTDB; the laptop
 * performs the authoritative server verification and writes the verdict
 * back, which this page shows as a brief overlay so the operator holding
 * the phone sees the result instantly.
 */

type OverlayState = {
  kind: 'allowed' | 'denied' | 'duplicate';
  title: string;
  detail: string;
} | null;

export const RemoteScannerPage: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [linked, setLinked] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [cameraError, setCameraError] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTokenRef = useRef<{ token: string; at: number } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const uid = (user as any)?.uid || (user as any)?.id || '';
  const name = (user as any)?.name || (user as any)?.email || 'Phone scanner';

  // Subscribe to our own scan results once linked, to drive the overlay.
  useEffect(() => {
    if (!linked || !code) return;
    const seen = new Set<string>();
    const unsub = watchScanEntries(code, (entries) => {
      const mine = Object.entries(entries || {})
        .filter(([, e]) => e?.phoneUid === uid && e?.result && !seen.has(`${e.at}:${e.signedToken.slice(0, 24)}`));
      for (const [, e] of mine) {
        seen.add(`${e.at}:${e.signedToken.slice(0, 24)}`);
        const r = e.result!;
        const kind = r.ok ? 'allowed' : r.verdict.toLowerCase().includes('already') ? 'duplicate' : 'denied';
        showOverlay({
          kind,
          title: r.ok ? 'ADMITTED ✓' : r.verdict.toLowerCase().includes('already') ? 'ALREADY ADMITTED' : 'NOT VALID ✗',
          detail: [r.attendee, r.ticketNumber].filter(Boolean).join(' • ') || r.verdict,
        });
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, code, uid]);

  const showOverlay = (o: Exclude<OverlayState, null>) => {
    setOverlay(o);
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(() => setOverlay(null), 4000);
  };

  const handleJoin = async () => {
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setLinkError('Enter the 6-digit code shown on the laptop.');
      return;
    }
    setLinkError('');
    const rec = await joinScanLink(clean, uid, name);
    if (!rec) {
      setLinkError('Code not found or expired. Ask the laptop to generate a new one.');
      return;
    }
    setLinked(true);
  };

  // QR decoding loop (lightweight jsQR on a downscaled frame — mobile friendly).
  const decodeLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(decodeLoop);
      return;
    }
    const w = 480;
    const scale = w / video.videoWidth || 1;
    canvas.width = w;
    canvas.height = Math.round((video.videoHeight || 360) * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (found?.data) {
        const token = found.data.trim();
        const now = Date.now();
        const last = lastTokenRef.current;
        // Debounce: same token within 4s is ignored (staff may hold the camera).
        if (token && (!last || last.token !== token || now - last.at > 4000)) {
          lastTokenRef.current = { token, at: now };
          void submitRemoteScan(code, token, uid);
        }
      }
    }
    rafRef.current = requestAnimationFrame(decodeLoop);
  }, [code, uid]);

  useEffect(() => {
    if (!linked) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setIsScanning(true);
        rafRef.current = requestAnimationFrame(decodeLoop);
      } catch {
        setCameraError('Camera access is required. Allow camera permission and reload.');
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setIsScanning(false);
    };
  }, [linked, decodeLoop]);

  const handleUnlink = async () => {
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    setLinked(false);
    setCode('');
    setOverlay(null);
  };

  // ---------- Render ----------
  const overlayColor =
    overlay?.kind === 'allowed' ? 'bg-emerald-500/90' :
    overlay?.kind === 'duplicate' ? 'bg-amber-500/90' : 'bg-red-500/90';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {!linked ? (
        <div className="max-w-sm mx-auto px-5 py-16 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto">
              <Link2 className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <h1 className="font-heading font-extrabold text-xl">Remote Gate Scanner</h1>
            <p className="text-xs text-gray-400">
              Enter the 6-digit code displayed on the laptop scanner to link this phone.
            </p>
          </div>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full text-center text-3xl font-mono font-extrabold tracking-[0.4em] py-4 rounded-2xl bg-[#141414] border border-white/10 focus:border-[#D4AF37] focus:outline-none"
          />
          {linkError && <p className="text-red-400 text-xs text-center">{linkError}</p>}
          <button
            onClick={handleJoin}
            className="w-full py-3.5 rounded-2xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-extrabold text-sm cursor-pointer"
          >
            Link to Laptop
          </button>
          <p className="text-[10px] text-gray-500 text-center">
            Sessions expire automatically after {Math.round(SCANNER_LINK_TTL_MS / 60000)} minutes.
          </p>
        </div>
      ) : (
        <div className="relative h-screen">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          {/* Scan frame guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-[#D4AF37]/70 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
          </div>

          {/* Status bar */}
          <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between bg-black/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">
              {isScanning ? '● Live — linked to laptop' : 'Linking…'}
            </span>
            <button onClick={handleUnlink} className="text-[10px] font-bold text-gray-300 hover:text-white cursor-pointer">
              Unlink
            </button>
          </div>

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                {cameraError}
              </div>
            </div>
          )}

          {/* Result overlay */}
          {overlay && (
            <div className={`absolute inset-x-4 top-1/2 -translate-y-1/2 p-5 rounded-3xl ${overlayColor} text-black shadow-2xl animate-in fade-in slide-in-from-top-2`}>
              <div className="flex items-start gap-3">
                {overlay.kind === 'allowed' ? <CheckCircle2 className="w-7 h-7 shrink-0" /> :
                 overlay.kind === 'duplicate' ? <AlertCircle className="w-7 h-7 shrink-0" /> :
                 <XCircle className="w-7 h-7 shrink-0" />}
                <div>
                  <p className="font-extrabold text-lg leading-tight">{overlay.title}</p>
                  <p className="text-xs font-semibold opacity-80 mt-1">{overlay.detail}</p>
                </div>
              </div>
            </div>
          )}

          {/* Pending indicator */}
          {!overlay && isScanning && (
            <div className="absolute bottom-8 inset-x-0 flex justify-center">
              <span className="px-3 py-1.5 rounded-full bg-black/60 text-[10px] text-gray-300 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Awaiting scan…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
