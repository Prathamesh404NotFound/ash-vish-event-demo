import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  Camera,
  RefreshCw,
  AlertTriangle,
  Phone,
  Clock,
  Zap,
  ZapOff,
  SwitchCamera,
  Sparkles
} from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { Ticket } from '../types';

interface TicketScannerProps {
  title?: string;
  subtitle?: string;
  onDecoded?: (code: string) => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

const LAST_CAMERA_STORAGE_KEY = 'ash_scanner_last_camera_id';

export const TicketScanner: React.FC<TicketScannerProps> = ({
  title = 'Gate Pass Scanner',
  subtitle = 'Scan digital/printed ticket QR codes or perform manual attendee lookups.',
  onDecoded,
}) => {
  const { scanTicketQR, allTickets } = useBooking();
  const { user } = useAuth();

  const isDevMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).has('dev') ||
    Boolean(import.meta.env.DEV)
  );

  const [inputVal, setInputVal] = useState('');
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraRequested, setIsCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Camera selection & hardware controls
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAST_CAMERA_STORAGE_KEY) || '';
    }
    return '';
  });
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isDecodingActive, setIsDecodingActive] = useState(false);
  const [stalledScanHint, setStalledScanHint] = useState(false);
  const [qrBoxSize, setQrBoxSize] = useState<{ width: number; height: number }>({ width: 320, height: 320 });

  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    ticket?: Ticket;
    alreadyRedeemed?: boolean;
    isVoid?: boolean;
    isTampered?: boolean;
  } | null>(null);

  const html5QrcodeRef = useRef<any>(null);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingRef = useRef(false);

  // Responsive decode region: larger of 90vmin and min(480px, 92vw)
  const calculateQrBox = useCallback(() => {
    if (typeof window === 'undefined') return { width: 320, height: 320 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const vmin = Math.min(w, h);
    const dim = Math.round(Math.max(vmin * 0.9, Math.min(480, w * 0.92)));
    return { width: dim, height: dim };
  }, []);

  // Update qrbox dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setQrBoxSize(calculateQrBox());
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateQrBox]);

  const handleScanCode = async (code: string) => {
    if (!code.trim()) return;
    const res = await scanTicketQR(code, user?.name || 'Gate Staff #402');
    setLastResult(res);
  };

  // Inspect stream for torch capabilities
  const inspectTorchCapability = () => {
    try {
      const videoEl = document.querySelector('#reader video') as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && typeof (track as any).getCapabilities === 'function') {
        const capabilities = (track as any).getCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorch(Boolean(capabilities.torch));
          return;
        }
      }
      setHasTorch(false);
    } catch {
      setHasTorch(false);
    }
  };

  // Toggle Torch
  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    try {
      const videoEl = document.querySelector('#reader video') as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
      } else if (html5QrcodeRef.current?.applyVideoConstraints) {
        await html5QrcodeRef.current.applyVideoConstraints({
          advanced: [{ torch: nextState }],
        });
      }
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('[CAMERA] Torch toggle failed:', err);
    }
  };

  // Cycle available cameras
  const handleCycleCamera = async () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];
    if (nextCamera) {
      setSelectedCameraId(nextCamera.id);
      localStorage.setItem(LAST_CAMERA_STORAGE_KEY, nextCamera.id);
      await stopCamera();
      // startCamera will be re-triggered by the effect or explicit call
      setIsCameraRequested(true);
    }
  };

  // Stop Camera Scanning
  const stopCamera = async () => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setStalledScanHint(false);
    setIsDecodingActive(false);
    setIsTorchOn(false);
    setHasTorch(false);

    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (e) {
        console.warn('[CAMERA] Error stopping camera:', e);
      } finally {
        html5QrcodeRef.current = null;
      }
    }
    setIsCameraActive(false);
  };

  // Start Camera Scanning
  const startCamera = async (targetDeviceId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);
    setStalledScanHint(false);
    setIsTorchOn(false);

    // Browser permission pre-check where supported
    if (navigator?.permissions?.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'camera' as any });
        if (perm.state === 'denied') {
          setCameraError('Camera access blocked. Open your phone Settings → Browser → Camera, allow access, then reload this page.');
          setIsCameraActive(false);
          isStartingRef.current = false;
          return;
        }
      } catch {
        // Not all browsers support permissions query for camera
      }
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      // 1. Enumerate devices
      let cameras: CameraDevice[] = [];
      try {
        const enumerated = await Html5Qrcode.getCameras();
        if (enumerated && enumerated.length > 0) {
          cameras = enumerated.map((c) => ({ id: c.id, label: c.label || `Camera ${c.id.substring(0, 4)}` }));
          setAvailableCameras(cameras);
        }
      } catch (enumErr) {
        console.warn('[CAMERA] getCameras enumeration warning:', enumErr);
      }

      // 2. Select camera ID (Rear preferred, then saved, then last in list)
      let activeDeviceId = targetDeviceId || selectedCameraId;
      if (!activeDeviceId || !cameras.some((c) => c.id === activeDeviceId)) {
        const savedId = localStorage.getItem(LAST_CAMERA_STORAGE_KEY);
        if (savedId && cameras.some((c) => c.id === savedId)) {
          activeDeviceId = savedId;
        } else {
          // Prefer rear / environment camera
          const rearCam = cameras.find((c) => /back|rear|environment|rear-facing/i.test(c.label));
          if (rearCam) {
            activeDeviceId = rearCam.id;
          } else if (cameras.length > 0) {
            activeDeviceId = cameras[cameras.length - 1].id;
          }
        }
      }

      if (activeDeviceId) {
        setSelectedCameraId(activeDeviceId);
        localStorage.setItem(LAST_CAMERA_STORAGE_KEY, activeDeviceId);
      }

      // 3. Instantiate Html5Qrcode
      if (html5QrcodeRef.current) {
        await stopCamera();
      }

      const html5QrCode = new Html5Qrcode('reader');
      html5QrcodeRef.current = html5QrCode;

      // 4. Sizing & High-resolution 1080p video constraints
      const box = calculateQrBox();
      setQrBoxSize(box);

      // Html5Qrcode strictly requires cameraIdOrConfig to be either a string (deviceId) or an object with exactly 1 key ({ facingMode: 'environment' })
      const cameraSource: string | { facingMode: 'environment' | 'user' } = activeDeviceId
        ? activeDeviceId
        : { facingMode: 'environment' };

      const scanConfig = {
        fps: 30, // 30 fps decoding for rapid capture
        qrbox: box,
        disableFlip: false,
        videoConstraints: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          ...(activeDeviceId ? { deviceId: { exact: activeDeviceId } } : { facingMode: 'environment' }),
        },
      };

      const handleSuccess = (decodedText: string) => {
        // Live scan detected: emit log, notify parent, pause indicators and process
        console.log('[SCAN_DETECTED]', decodedText);
        if (hintTimerRef.current) {
          clearTimeout(hintTimerRef.current);
          hintTimerRef.current = null;
        }
        setStalledScanHint(false);
        setIsDecodingActive(false);
        onDecoded?.(decodedText);
        handleScanCode(decodedText);
      };

      const handleFrameError = () => {
        // Frame decode pass (ignore standard non-match frames)
      };

      try {
        await html5QrCode.start(
          cameraSource,
          scanConfig,
          handleSuccess,
          handleFrameError
        );
      } catch (firstStartErr: any) {
        console.warn('[CAMERA] High-res config start failed, trying basic constraints fallback:', firstStartErr);
        // Fallback without videoConstraints in case browser rejects ideal dimensions
        await html5QrCode.start(
          cameraSource,
          { fps: 30, qrbox: box, disableFlip: false },
          handleSuccess,
          handleFrameError
        );
      }

      setIsCameraActive(true);
      setIsDecodingActive(true);

      // Start 3s timer to offer helpful guidance if QR is stalled
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => {
        setStalledScanHint(true);
      }, 3000);

      // Check hardware torch capabilities after stream attaches
      setTimeout(inspectTorchCapability, 800);
    } catch (err: any) {
      console.warn('[CAMERA] Start failure:', err);
      const errMsg = String(err?.name || err?.message || err || '');
      if (
        errMsg.includes('NotAllowedError') ||
        errMsg.includes('PermissionDeniedError') ||
        errMsg.includes('denied') ||
        errMsg.includes('Allowed')
      ) {
        setCameraError('Camera access blocked. Open your phone Settings → Browser → Camera, allow access, then reload this page.');
      } else if (
        errMsg.includes('NotFoundError') ||
        errMsg.includes('DevicesNotFoundError') ||
        errMsg.includes('not found') ||
        errMsg.includes('OverconstrainedError')
      ) {
        setCameraError('No camera found on this device. Connect a camera or use manual entry instead.');
      } else {
        setCameraError('Could not start the camera. Try reloading or a different device.');
      }
      setIsCameraActive(false);
      setIsDecodingActive(false);
    } finally {
      isStartingRef.current = false;
    }
  };

  // Re-run camera when tab changes or when requested
  useEffect(() => {
    if (activeTab === 'camera') {
      if (isCameraRequested) {
        startCamera();
      }
    } else {
      stopCamera();
      setIsCameraRequested(false);
    }

    return () => {
      stopCamera();
    };
  }, [activeTab, isCameraRequested]);

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
      <style>{`
        #reader {
          border: none !important;
          background: #000000 !important;
          width: 100% !important;
          height: 100% !important;
        }
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1.25rem !important;
        }
        #reader__scan_region {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        #reader__dashboard_section {
          display: none !important;
        }
        @keyframes scanline-pulse {
          0% { top: 10%; opacity: 0.2; }
          50% { top: 50%; opacity: 1; }
          100% { top: 90%; opacity: 0.2; }
        }
        .animate-scanline {
          animation: scanline-pulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Scanner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]">
              <QrCode className="w-5 h-5" />
            </span>
            <h2 className="font-heading font-extrabold text-xl text-white">{title}</h2>
          </div>
          <p className="text-gray-300 text-xs mt-1">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('camera')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
                : 'bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/5'
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
                : 'bg-[#1C1C1C] text-gray-300 hover:text-white border border-white/5'
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
                
                <div className="flex items-center gap-2">
                  {/* Camera Switcher Button (if multi-camera) */}
                  {isCameraActive && availableCameras.length > 1 && (
                    <button
                      onClick={handleCycleCamera}
                      title="Switch Camera Lens"
                      className="px-2.5 py-1.5 rounded-xl bg-[#1C1C1C] hover:bg-[#282828] border border-white/10 text-gray-200 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <SwitchCamera className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span className="hidden sm:inline">Switch Camera</span>
                    </button>
                  )}

                  {/* Flashlight / Torch Toggle */}
                  {isCameraActive && hasTorch && (
                    <button
                      onClick={handleToggleTorch}
                      title={isTorchOn ? 'Turn Off Flashlight' : 'Turn On Flashlight'}
                      className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                        isTorchOn
                          ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/30'
                          : 'bg-[#1C1C1C] text-gray-300 hover:text-white border-white/10'
                      }`}
                    >
                      {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
                    </button>
                  )}

                  {isCameraActive && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Live 30 FPS
                    </span>
                  )}
                </div>
              </div>

              {cameraError ? (
                <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Camera Initialization Notice</span>
                  </div>
                  <p className="text-amber-200/90 leading-relaxed">{cameraError}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => {
                        setCameraError(null);
                        startCamera();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-xs border border-amber-500/30 cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Camera</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className="px-3.5 py-2 rounded-xl bg-[#1C1C1C] hover:bg-[#282828] text-gray-300 font-bold text-xs border border-white/10 cursor-pointer"
                    >
                      Switch to Manual Lookup
                    </button>
                  </div>
                </div>
              ) : !isCameraRequested ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#1C1C1C] aspect-[4/3] sm:aspect-video flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="p-4 rounded-2xl bg-[#D4AF37]/10 text-[#D4AF37] shadow-inner">
                    <Camera className="w-9 h-9" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <p className="text-sm font-bold text-white uppercase tracking-wider">Fast Gate Camera Scanner</p>
                    <p className="text-gray-300 text-xs leading-relaxed">
                      Tap below to activate 30 FPS high-definition scanning. Point your device at guest passes for instant check-in.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsCameraRequested(true)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs shadow-lg shadow-[#D4AF37]/20 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Start Scanner Stream</span>
                  </button>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[4/3] sm:aspect-video w-full flex items-center justify-center shadow-2xl">
                  {/* html5-qrcode reader canvas */}
                  <div id="reader" className="w-full h-full" />

                  {/* Overlaid Corner Brackets & Live Laser Target Frame */}
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                      <div
                        className="relative transition-all duration-300 flex items-center justify-center"
                        style={{
                          width: `${Math.min(qrBoxSize.width, 360)}px`,
                          height: `${Math.min(qrBoxSize.height, 360)}px`,
                        }}
                      >
                        {/* Gold Corner Brackets */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#D4AF37] rounded-tl-xl shadow-sm" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#D4AF37] rounded-tr-xl shadow-sm" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#D4AF37] rounded-bl-xl shadow-sm" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#D4AF37] rounded-br-xl shadow-sm" />

                        {/* Subtle Pulsing Scan Laser Line */}
                        {isDecodingActive && (
                          <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent animate-scanline shadow-[0_0_8px_#D4AF37]" />
                        )}
                      </div>

                      {/* Live Guidance Subtitle */}
                      <div className="mt-4 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-gray-200 flex items-center gap-2 shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                        <span>Scanning… aim the QR inside the frame</span>
                      </div>
                    </div>
                  )}

                  {/* Stalled Scan Help Hint Banner */}
                  {isCameraActive && stalledScanHint && (
                    <div className="absolute bottom-3 inset-x-3 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-[#D4AF37]/30 text-[#F3E5AB] text-[11px] text-center font-medium shadow-xl">
                        💡 Move the QR inside the brackets • bring the phone 10–20 cm away • brighten the screen.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Direct Code / Token Input Form */}
              <div className="p-4 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-2">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {isDevMode ? 'Direct Token or QR Code Payload Input (Dev Mode)' : 'Enter ticket code manually'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScanCode(inputVal)}
                    placeholder={isDevMode ? 'Paste signed HMAC token (e.g. ASH_PASS_v1...)' : 'Enter ticket number or code...'}
                    className="w-full pl-4 pr-28 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white placeholder-gray-500 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    onClick={() => handleScanCode(inputVal)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-[11px] cursor-pointer"
                  >
                    {isDevMode ? 'Scan QR Token' : 'Validate Code'}
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
                <p className="text-xs text-gray-300 mt-0.5">
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
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredManualTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-300 border border-dashed border-white/10 rounded-2xl">
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
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-300 text-[11px]">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-300" /> {t.attendeePhone || 'No Phone'}
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
                            <span className="text-[10px] text-gray-300 block mt-0.5">
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

          {/* Quick Simulation Testing Triggers (Dev Gate Only) */}
          {isDevMode && (
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Quick Test Token Scans (Dev Only)
                </h3>
                <span className="text-[10px] text-gray-400 font-mono">?dev=1 active</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handleScanCode('ASH_PASS_v1.b25saW5lX29yZGVyXzA1:evt_001.valid_sig')}
                  className="p-2.5 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 text-left transition-all cursor-pointer"
                >
                  <span className="font-bold text-emerald-400 block">Valid Signed Pass</span>
                  <span className="text-[10px] text-gray-300">HMAC-SHA256 Signed</span>
                </button>

                <button
                  onClick={() => handleScanCode('ASH_PASS_v1.TAMPERED_HEADER_FAIL.fake_sig')}
                  className="p-2.5 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/5 text-left transition-all cursor-pointer"
                >
                  <span className="font-bold text-red-400 block">Tampered Pass</span>
                  <span className="text-[10px] text-gray-300">Fake Signature Test</span>
                </button>
              </div>
            </div>
          )}
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
                    <span className="text-gray-300">Ticket No:</span>
                    <span className="font-mono font-bold text-[#D4AF37]">{lastResult.ticket.ticketNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Guest Name:</span>
                    <span className="font-bold text-white">{lastResult.ticket.attendeeName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Phone:</span>
                    <span className="text-gray-200">{lastResult.ticket.attendeePhone || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Event:</span>
                    <span className="font-semibold text-gray-200 truncate max-w-[170px]">
                      {lastResult.ticket.eventTitle}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Pass Tier:</span>
                    <span className="font-bold text-emerald-400">{lastResult.ticket.tierName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Seat / Section:</span>
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
            <div className="h-full min-h-[320px] p-8 rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center text-center space-y-3 text-gray-300">
              <QrCode className="w-12 h-12 stroke-[1.5] text-gray-300" />
              <p className="text-sm font-semibold text-gray-300">Ready to Scan</p>
              <p className="text-xs max-w-xs leading-relaxed text-gray-300">
                Scan or enter a ticket QR token to inspect guest details and validate gate admission.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
