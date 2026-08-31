import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import jsQR from 'jsqr';
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
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
  UserCheck,
  UserX,
  ArrowRight,
  ShieldAlert,
  Loader2,
  ZoomIn,
} from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { Ticket } from '../types';

export type ScanPhase = 'idle' | 'verifying' | 'allowed' | 'duplicate' | 'denied' | 'network_err';

export interface ScanResultState {
  phase: ScanPhase;
  heading: string;
  subheading: string;
  actionHint?: string;
  ticket?: Ticket;
  scannedToken?: string;
  scannedAt?: string;
  scannedBy?: string;
  isRecentlyScanned?: boolean;
}

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
const SOUND_ENABLED_STORAGE_KEY = 'ash_scanner_sound_enabled';

// Web Audio API Sound Effects Engine (Inline, zero external assets)
class SoundEffects {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioContextClass();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  static playAllowed() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // 880 Hz crisp high chime
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // Audio fails gracefully on un-interacted browsers
    }
  }

  static playDeniedOrDuplicate() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now); // 440 Hz low warning buzz
      osc.frequency.setValueAtTime(330, now + 0.08);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.19);
    } catch {
      // Audio fails gracefully
    }
  }
}

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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraRequested, setIsCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Sound and Haptic State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(next));
    }
  };

  // State Machine
  const [scanState, setScanState] = useState<ScanResultState>({
    phase: 'idle',
    heading: '',
    subheading: '',
  });

  const [flashType, setFlashType] = useState<'allowed' | 'duplicate' | 'denied' | null>(null);

  // Hardware controls & capabilities
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAST_CAMERA_STORAGE_KEY) || '';
    }
    return '';
  });
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [availableZoomLevels, setAvailableZoomLevels] = useState<number[]>([1]);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [hasExposureComp, setHasExposureComp] = useState(false);
  const [isDecodingActive, setIsDecodingActive] = useState(false);
  const missedScanFramesRef = useRef<number>(0);
  const [stalledScanHint, setStalledScanHint] = useState(false);
  const [qrBoxSize, setQrBoxSize] = useState<{ width: number; height: number }>({ width: 320, height: 320 });

  // Adaptive performance profile (low-end device detection)
  const isLowEndDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const cores = navigator.hardwareConcurrency || 4;
    const ua = navigator.userAgent || '';
    const isLowEndUA = /Android.*(Go|SM-|Redmi 9|Moto G|K10|C11|Helio|Exynos 7|Snapdragon 4)/i.test(ua);
    return cores <= 4 || isLowEndUA;
  }, []);

  const html5QrcodeRef = useRef<any>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const roiLoopActiveRef = useRef<boolean>(false);
  const roiRafIdRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingRef = useRef(false);

  // Client-side lockout tracking (Prevents redundant requests on continuous QR decode)
  const lastScanLockRef = useRef<{
    token: string;
    timestamp: number;
    result: ScanResultState;
  } | null>(null);

  // Debounce manual search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(manualSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [manualSearchQuery]);

  // Responsive decode region: larger of 90vmin and min(480px, 92vw)
  const calculateQrBox = useCallback(() => {
    if (typeof window === 'undefined') return { width: 320, height: 320 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const vmin = Math.min(w, h);
    const dim = Math.round(Math.max(vmin * 0.9, Math.min(480, w * 0.92)));
    return { width: dim, height: dim };
  }, []);

  // Update qrbox dimensions on window resize
  useEffect(() => {
    const handleResize = () => {
      setQrBoxSize(calculateQrBox());
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateQrBox]);

  const triggerVibrate = (pattern: number[] = [40]) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore unsupported devices
    }
  };

  const triggerFlash = (type: 'allowed' | 'duplicate' | 'denied') => {
    setFlashType(type);
    setTimeout(() => {
      setFlashType(null);
    }, 350);
  };

  const startAutoClearTimer = (durationMs = 3000) => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
    }
    autoClearTimerRef.current = setTimeout(() => {
      setScanState({
        phase: 'idle',
        heading: '',
        subheading: '',
      });
      setIsDecodingActive(true);
    }, durationMs);
  };

  const handleDismiss = () => {
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }
    setScanState({
      phase: 'idle',
      heading: '',
      subheading: '',
    });
    setInputVal('');
    setIsDecodingActive(true);
  };

  // Primary Scan Code Execution with State Machine & 3-Second Lockout
  const handleScanCode = async (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    // Soft lock: If currently verifying, allowed or duplicate in flight, ignore incoming duplicate frames
    if (scanState.phase === 'verifying') return;

    const now = Date.now();

    // 2. Client-side Idempotent Lockout check
    if (
      lastScanLockRef.current &&
      lastScanLockRef.current.token === cleanCode &&
      now - lastScanLockRef.current.timestamp < 3000
    ) {
      const cached = lastScanLockRef.current.result;
      setScanState({
        ...cached,
        isRecentlyScanned: true,
      });
      if (cached.phase === 'allowed' || cached.phase === 'duplicate') {
        startAutoClearTimer(3000);
      }
      return;
    }

    // 1. IDLE -> VERIFYING
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }

    const previewToken = cleanCode.length > 24
      ? `${cleanCode.substring(0, 10)}…${cleanCode.substring(cleanCode.length - 8)}`
      : cleanCode;

    setScanState({
      phase: 'verifying',
      heading: 'VERIFYING…',
      subheading: 'Validating gate pass cryptographic signature',
      scannedToken: previewToken,
    });

    // 3. Network call with 8s timeout protection
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 8000)
    );

    try {
      const staffName = user?.name || 'Gate Staff #402';
      const res = await Promise.race([
        scanTicketQR(cleanCode, staffName),
        timeoutPromise,
      ]);

      if (res.success) {
        // ALLOWED: Positive auto-clear outcome
        if (soundEnabled) SoundEffects.playAllowed();
        triggerVibrate([40]);
        triggerFlash('allowed');

        const allowedState: ScanResultState = {
          phase: 'allowed',
          heading: 'ADMITTED ✓',
          subheading: 'Let them in.',
          ticket: res.ticket,
          scannedToken: previewToken,
          scannedAt: res.ticket?.scannedAt || 'Just now',
          scannedBy: res.ticket?.scannedBy || staffName,
        };

        setScanState(allowedState);
        lastScanLockRef.current = { token: cleanCode, timestamp: Date.now(), result: allowedState };
        startAutoClearTimer(3000);
      } else if (res.alreadyRedeemed) {
        // DUPLICATE: Positive warning with staff attribution & auto-clear
        if (soundEnabled) SoundEffects.playDeniedOrDuplicate();
        triggerFlash('duplicate');

        const duplicateState: ScanResultState = {
          phase: 'duplicate',
          heading: 'ALREADY ADMITTED',
          subheading: `Was checked in by ${res.ticket?.scannedBy || 'Gate Staff'} at ${res.ticket?.scannedAt || 'earlier today'}.`,
          actionHint: 'Do not admit again without supervisor clearance.',
          ticket: res.ticket,
          scannedToken: previewToken,
          scannedAt: res.ticket?.scannedAt,
          scannedBy: res.ticket?.scannedBy,
        };

        setScanState(duplicateState);
        lastScanLockRef.current = { token: cleanCode, timestamp: Date.now(), result: duplicateState };
        startAutoClearTimer(3000);
      } else {
        // DENIED: Negative outcome requires explicit Dismiss
        if (soundEnabled) SoundEffects.playDeniedOrDuplicate();
        triggerFlash('denied');

        let rawMsg = res.message || '';
        let sub = "This pass doesn't match our records.";
        let hint = "Ask the guest to open the live Ash-vish pass — screenshots and printouts can fail. If it persists, use manual lookup.";

        if (res.isVoid) {
          sub = 'Ticket is void or cancelled. Do not admit.';
          hint = 'This pass has been cancelled or refunded.';
        } else if (
          res.isTampered ||
          rawMsg.toLowerCase().includes('hmac') ||
          rawMsg.toLowerCase().includes('tampered') ||
          rawMsg.toLowerCase().includes('signature')
        ) {
          sub = "This pass doesn't match our records.";
          hint = "Ask the guest to open the live Ash-vish pass — screenshots and printouts can fail. If it persists, use manual lookup.";
        } else if (
          rawMsg.toLowerCase().includes('not found') ||
          rawMsg.toLowerCase().includes('valid ticket')
        ) {
          sub = 'Pass not found. Check the guest opened the latest pass.';
          hint = 'Verify the booking ID with the manual guest list.';
        } else if (
          rawMsg.toLowerCase().includes('payment') ||
          rawMsg.toLowerCase().includes('402')
        ) {
          sub = 'PAYMENT DUE';
          hint = 'Send guest to the pay counter before entry.';
        }

        const deniedState: ScanResultState = {
          phase: 'denied',
          heading: 'NOT VALID ✗',
          subheading: sub,
          actionHint: hint,
          ticket: res.ticket,
          scannedToken: previewToken,
        };

        setScanState(deniedState);
        lastScanLockRef.current = { token: cleanCode, timestamp: Date.now(), result: deniedState };
        // Negative outcomes NEVER auto-clear
      }
    } catch (err: any) {
      // NETWORK_ERR: Offline or timeout
      console.warn('[SCANNER] Network verification error:', err);
      if (soundEnabled) SoundEffects.playDeniedOrDuplicate();
      triggerFlash('denied');

      const netErrState: ScanResultState = {
        phase: 'network_err',
        heading: 'CONNECTION LOST',
        subheading: 'Connection lost — retry or use manual lookup.',
        actionHint: 'Check Wi-Fi / cellular data or search the guest list by name.',
        scannedToken: previewToken,
      };

      setScanState(netErrState);
      // Network failures NEVER auto-clear
    }
  };

  // Apply advanced hardware camera capabilities (Continuous focus, anti-glare exposure, default 1.5x zoom)
  const applyAdvancedCameraFeatures = async (videoTrack: MediaStreamTrack) => {
    if (!videoTrack || typeof (videoTrack as any).getCapabilities !== 'function') return;
    try {
      const caps = (videoTrack as any).getCapabilities() || {};
      const advancedConstraint: any = {};

      // A1. Continuous autofocus
      if (caps.focusMode && (Array.isArray(caps.focusMode) ? caps.focusMode.includes('continuous') : caps.focusMode === 'continuous')) {
        advancedConstraint.focusMode = 'continuous';
      }

      // Continuous exposure & white balance
      if (caps.exposureMode && (Array.isArray(caps.exposureMode) ? caps.exposureMode.includes('continuous') : caps.exposureMode === 'continuous')) {
        advancedConstraint.exposureMode = 'continuous';
      }
      if (caps.whiteBalanceMode && (Array.isArray(caps.whiteBalanceMode) ? caps.whiteBalanceMode.includes('continuous') : caps.whiteBalanceMode === 'continuous')) {
        advancedConstraint.whiteBalanceMode = 'continuous';
      }

      // B1. Anti-glare exposure compensation (-0.5 on emissive phone screens)
      if (caps.exposureCompensation) {
        const minExp = typeof caps.exposureCompensation.min === 'number' ? caps.exposureCompensation.min : -2;
        const maxExp = typeof caps.exposureCompensation.max === 'number' ? caps.exposureCompensation.max : 2;
        const targetExp = Math.max(minExp, Math.min(maxExp, -0.5));
        advancedConstraint.exposureCompensation = targetExp;
        setHasExposureComp(true);
      }

      // A1. Zoom constraint & tactile step controls (1x, 1.5x, 2x)
      if (caps.zoom) {
        const minZoom = typeof caps.zoom.min === 'number' ? caps.zoom.min : 1;
        const maxZoom = typeof caps.zoom.max === 'number' ? caps.zoom.max : 1;

        if (maxZoom >= 1.5) {
          const levels = [1, 1.5, 2].filter((lvl) => lvl >= minZoom && lvl <= maxZoom);
          if (!levels.includes(1) && minZoom <= 1) levels.unshift(1);
          setAvailableZoomLevels(levels);

          const defaultZoom = Math.min(maxZoom, Math.max(minZoom, 1.5));
          setCurrentZoom(defaultZoom);
          advancedConstraint.zoom = defaultZoom;
        } else if (maxZoom > 1) {
          setAvailableZoomLevels([1, maxZoom]);
        }
      }

      // Torch support check
      if ('torch' in caps) {
        setHasTorch(Boolean(caps.torch));
      }

      if (Object.keys(advancedConstraint).length > 0 && typeof videoTrack.applyConstraints === 'function') {
        await videoTrack.applyConstraints({
          advanced: [advancedConstraint],
        });
        console.log('[CAMERA] Applied advanced constraints:', advancedConstraint);
      }
    } catch (constraintErr) {
      console.warn('[CAMERA] Advanced constraints gracefully degraded:', constraintErr);
    }
  };

  // Inspect stream for torch and hardware features
  const inspectTorchCapability = () => {
    try {
      const videoEl = document.querySelector('#reader video') as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        videoTrackRef.current = track;
        applyAdvancedCameraFeatures(track);
      }
    } catch (e) {
      console.warn('[CAMERA] Capability inspection error:', e);
    }
  };

  // Handle Zoom change
  const handleSetZoom = async (targetZoom: number) => {
    setCurrentZoom(targetZoom);
    try {
      const track = videoTrackRef.current;
      if (track && typeof track.applyConstraints === 'function') {
        await track.applyConstraints({
          advanced: [{ zoom: targetZoom } as any],
        });
      }
    } catch (err) {
      console.warn('[CAMERA] Zoom adjustment failed:', err);
    }
  };

  // Toggle Torch
  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    try {
      const videoEl = document.querySelector('#reader video') as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0] || videoTrackRef.current;
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
      setIsCameraRequested(true);
    }
  };

  // High-Speed ROI Crop & Contrast Normalization Decoder Loop (jsQR)
  const startRoiDecodingLoop = (onSuccess: (code: string) => void) => {
    if (roiLoopActiveRef.current) return;
    roiLoopActiveRef.current = true;

    const targetInterval = isLowEndDevice ? 66 : 33; // 15 FPS on low-end, 30 FPS on modern
    let lastDecodeTime = 0;

    const decodeFrame = () => {
      if (!roiLoopActiveRef.current) return;

      const videoEl = document.querySelector('#reader video') as HTMLVideoElement | null;
      const now = performance.now();

      if (
        videoEl &&
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        now - lastDecodeTime >= targetInterval
      ) {
        lastDecodeTime = now;

        try {
          // Offscreen canvas setup
          if (!offscreenCanvasRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = 360;
            canvas.height = 360;
            offscreenCanvasRef.current = canvas;
          }
          const canvas = offscreenCanvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (ctx) {
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;

            // Compute central ROI (+20% margin around qrbox region)
            // Analyzing <= 25% of total frame pixels for instantaneous decoding
            const cropDimension = Math.round(Math.min(vw, vh) * 0.70);
            const sx = Math.round((vw - cropDimension) / 2);
            const sy = Math.round((vh - cropDimension) / 2);

            ctx.drawImage(videoEl, sx, sy, cropDimension, cropDimension, 0, 0, 360, 360);
            const imageData = ctx.getImageData(0, 0, 360, 360);
            const data = imageData.data;
            const len = data.length;

            // B3. Dynamic luminance contrast stretch & anti-glare normalization
            const factor = 1.25;
            const offset = 128 * (1 - factor) - 6;
            for (let i = 0; i < len; i += 4) {
              data[i] = Math.min(255, Math.max(0, data[i] * factor + offset));
              data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + offset));
              data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + offset));
            }

            const qrCode = jsQR(data, 360, 360, {
              inversionAttempts: 'attemptBoth',
            });

            if (qrCode && qrCode.data) {
              // SMART AUTO-ZOOM: QR detected successfully.
              // Reset missed-frame counter and return zoom toward 1x if currently zoomed.
              missedScanFramesRef.current = 0;
              if (videoTrackRef.current && availableZoomLevels.length > 1) {
                const caps = (videoTrackRef.current as any).getCapabilities?.();
                const maxZoom = caps?.zoom?.max || 1;
                if (currentZoom > 1 && maxZoom > 1) {
                  // Smoothly return toward 1x after successful detection
                  const newZoom = Math.max(1, currentZoom - 0.25);
                  if (Math.abs(newZoom - currentZoom) > 0.01) {
                    setCurrentZoom(newZoom);
                    videoTrackRef.current.applyConstraints({ advanced: [{ zoom: newZoom } as any] }).catch(() => {});
                  }
                }
              }
              onSuccess(qrCode.data);
            } else {
              // SMART AUTO-ZOOM: No QR detected this frame.
              // After ~30 consecutive misses (≈1s at 30fps), step up zoom if available.
              missedScanFramesRef.current++;
              if (missedScanFramesRef.current >= 30 && videoTrackRef.current && availableZoomLevels.length > 1) {
                missedScanFramesRef.current = 0;
                const caps = (videoTrackRef.current as any).getCapabilities?.();
                const maxZoom = caps?.zoom?.max || 1;
                if (currentZoom < maxZoom && maxZoom > 1) {
                  const step = availableZoomLevels.length > 2 ? 0.5 : (maxZoom - 1) / 2;
                  const newZoom = Math.min(maxZoom, currentZoom + Math.max(step, 0.25));
                  if (Math.abs(newZoom - currentZoom) > 0.01) {
                    setCurrentZoom(newZoom);
                    videoTrackRef.current.applyConstraints({ advanced: [{ zoom: newZoom } as any] }).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (e) {
          // Non-critical decode cycle pass
        }
      }

      if (roiLoopActiveRef.current) {
        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype && videoEl && (videoEl as any).requestVideoFrameCallback) {
          (videoEl as any).requestVideoFrameCallback(decodeFrame);
        } else {
          roiRafIdRef.current = requestAnimationFrame(decodeFrame);
        }
      }
    };

    roiRafIdRef.current = requestAnimationFrame(decodeFrame);
  };

  // Stop Camera Scanning
  const stopCamera = async () => {
    roiLoopActiveRef.current = false;
    if (roiRafIdRef.current) {
      cancelAnimationFrame(roiRafIdRef.current);
      roiRafIdRef.current = null;
    }
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setStalledScanHint(false);
    setIsDecodingActive(false);
    setIsTorchOn(false);
    setHasTorch(false);
    setAvailableZoomLevels([1]);
    setCurrentZoom(1);
    videoTrackRef.current = null;

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
    missedScanFramesRef.current = 0;

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

      // 4. Sizing & Adaptive resolution video constraints
      const box = calculateQrBox();
      setQrBoxSize(box);

      const cameraSource: string | { facingMode: 'environment' | 'user' } = activeDeviceId
        ? activeDeviceId
        : { facingMode: 'environment' };

      const scanConfig = {
        fps: isLowEndDevice ? 15 : 30, // Adaptive FPS based on device class
        qrbox: box,
        disableFlip: true, // C3 requirement
        videoConstraints: {
          width: { ideal: isLowEndDevice ? 1280 : 1920 },
          height: { ideal: isLowEndDevice ? 720 : 1080 },
          ...(activeDeviceId ? { deviceId: { exact: activeDeviceId } } : { facingMode: 'environment' }),
        },
      };

      const handleSuccess = (decodedText: string) => {
        if (hintTimerRef.current) {
          clearTimeout(hintTimerRef.current);
          hintTimerRef.current = null;
        }
        setStalledScanHint(false);
        onDecoded?.(decodedText);
        handleScanCode(decodedText);
      };

      const handleFrameError = () => {
        // Frame decode pass
      };

      // PERF FIX: Pass no-op callbacks to html5-qrcode so it only manages the
      // camera stream without running its own scanning loop. The custom ROI
      // decoder (startRoiDecodingLoop) handles all QR detection at ~50% CPU
      // because it crops to a 360px center region instead of scanning the full
      // high-res frame.
      const noopFrame = () => {};
      try {
        await html5QrCode.start(
          cameraSource,
          scanConfig,
          noopFrame,
          noopFrame
        );
      } catch (firstStartErr: any) {
        console.warn('[CAMERA] High-res config start failed, trying basic constraints fallback:', firstStartErr);
        await html5QrCode.start(
          cameraSource,
          { fps: isLowEndDevice ? 15 : 30, qrbox: box, disableFlip: true },
          noopFrame,
          noopFrame
        );
      }

      setIsCameraActive(true);
      setIsDecodingActive(true);

      // Start high-performance ROI decoding loop (sole QR decoder)
      startRoiDecodingLoop(handleSuccess);

      // Start 4s timer (A2 requirement: 4s instead of 3s) for hold-distance guidance
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => {
        setStalledScanHint(true);
      }, 4000);

      // Inspect hardware capabilities & apply continuous focus / zoom / exposure
      setTimeout(inspectTorchCapability, 400);
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
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
      }
    };
  }, [activeTab, isCameraRequested]);

  // Filtered tickets with debouncing and max 10 result cap
  const { filteredManualTickets, totalMatches } = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) {
      return {
        filteredManualTickets: allTickets.slice(0, 10),
        totalMatches: allTickets.length,
      };
    }
    const matches = allTickets.filter(
      (t) =>
        t.attendeeName.toLowerCase().includes(q) ||
        t.attendeePhone.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.eventTitle.toLowerCase().includes(q) ||
        t.seatNumber.toLowerCase().includes(q)
    );
    return {
      filteredManualTickets: matches.slice(0, 10),
      totalMatches: matches.length,
    };
  }, [allTickets, debouncedSearchQuery]);

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
        @keyframes flash-emerald {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes flash-amber {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        @keyframes flash-red {
          0% { opacity: 0.9; }
          100% { opacity: 0; }
        }
        .flash-emerald-anim {
          animation: flash-emerald 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .flash-amber-anim {
          animation: flash-amber 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .flash-red-anim {
          animation: flash-red 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .flash-emerald-anim, .flash-amber-anim, .flash-red-anim, .animate-scanline {
            animation: none !important;
          }
        }
      `}</style>

      {/* Scanner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10 shadow-xl">
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
          {/* Audio Speaker Mute/Unmute */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Gate audio beeps enabled' : 'Gate audio beeps muted'}
            className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-[#1C1C1C] text-[#D4AF37] border-[#D4AF37]/30 hover:border-[#D4AF37]'
                : 'bg-[#1C1C1C] text-gray-400 border-white/5 hover:text-white'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

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
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Scanner Section */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'camera' ? (
            <div className="relative p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4 overflow-hidden shadow-2xl">
              {/* Full Screen / Card Flash Overlay */}
              {flashType === 'allowed' && (
                <div className="absolute inset-0 z-30 pointer-events-none bg-emerald-500 flash-emerald-anim" />
              )}
              {flashType === 'duplicate' && (
                <div className="absolute inset-0 z-30 pointer-events-none bg-amber-500 flash-amber-anim" />
              )}
              {flashType === 'denied' && (
                <div className="absolute inset-0 z-30 pointer-events-none bg-red-600 flash-red-anim" />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#D4AF37]" />
                  Camera QR Decoder
                </span>

                <div className="flex items-center gap-2">
                  {/* Zoom Level Switcher */}
                  {isCameraActive && availableZoomLevels.length > 1 && (
                    <div className="flex items-center bg-[#1C1C1C] border border-white/10 rounded-xl p-0.5 shadow-sm">
                      {availableZoomLevels.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => handleSetZoom(lvl)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            currentZoom === lvl
                              ? 'bg-[#D4AF37] text-black shadow-sm'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {lvl}x
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Camera Switcher Button */}
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
                      Live {isLowEndDevice ? '15 FPS (Eco)' : '30 FPS'}
                    </span>
                  )}
                </div>
              </div>

              {cameraError ? (
                <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Camera Access Notice</span>
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
                      Switch to Manual Entry
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
                      Tap below to activate {isLowEndDevice ? '15 FPS' : '30 FPS'} scanning. Point your device at guest passes for instant check-in.
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
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-[4/3] sm:aspect-video w-full flex items-center justify-center shadow-2xl">
                    {/* html5-qrcode reader element */}
                    <div id="reader" className="w-full h-full" />

                    {/* Overlaid Corner Brackets & Target Frame (Exact Geometry Match without arbitrary 360px cap) */}
                    {isCameraActive && scanState.phase === 'idle' && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                        <div
                          className="relative transition-all duration-300 flex items-center justify-center"
                          style={{
                            width: `${qrBoxSize.width}px`,
                            height: `${qrBoxSize.height}px`,
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

                    {/* State Machine Viewfinder Overlay: VERIFYING */}
                    {scanState.phase === 'verifying' && (
                      <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 animate-in fade-in">
                        <div className="p-4 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] animate-spin">
                          <Loader2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-heading font-extrabold text-lg text-white tracking-wide">
                            VERIFYING PASS…
                          </p>
                          <p className="text-xs text-gray-300">Checking security signature & gate database</p>
                        </div>
                        {scanState.scannedToken && (
                          <div className="px-3 py-1 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px] text-[#D4AF37]">
                            TOKEN: {scanState.scannedToken}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stalled Scan Help Hint Banner (A2 requirement: Exact hold-distance wording) */}
                    {isCameraActive && stalledScanHint && scanState.phase === 'idle' && (
                      <div className="absolute bottom-3 inset-x-3 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                        <div className="p-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-[#D4AF37]/30 text-[#F3E5AB] text-[11px] text-center font-medium shadow-xl">
                          Hold the guest&apos;s phone 10–25 cm away — closer than a hand span makes focus fail.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* A2. Always-visible hold-distance guidance caption during IDLE */}
                  {isCameraActive && scanState.phase === 'idle' && (
                    <p className="text-[11px] text-gray-400 text-center font-medium">
                      Hold the guest&apos;s phone 10–25 cm away — closer than a hand span makes focus fail.
                    </p>
                  )}
                </div>
              )}

              {/* Direct Code Input Form */}
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
                    placeholder={isDevMode ? 'Paste signed HMAC token (e.g. ASH_PASS_v1...)' : 'Enter ticket number or reference code...'}
                    className="w-full pl-4 pr-28 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white placeholder-gray-500 text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    onClick={() => handleScanCode(inputVal)}
                    disabled={scanState.phase === 'verifying'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-[11px] cursor-pointer"
                  >
                    {isDevMode ? 'Scan QR Token' : 'Validate Code'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Fallback Manual Guest Lookup */
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4 shadow-xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#D4AF37]" />
                  Look up guest
                </h3>
                <p className="text-xs text-gray-300 mt-0.5">
                  Search by name, phone, or ticket number when the QR can't be scanned.
                </p>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  placeholder="Type attendee name, mobile, ticket # or booking ID…"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              </div>

              {totalMatches > 10 && (
                <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-[#D4AF37] flex items-center justify-between">
                  <span>Showing top 10 results out of {totalMatches} matches</span>
                  <span className="text-gray-400">Refine search query to filter</span>
                </div>
              )}

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredManualTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-300 border border-dashed border-white/10 rounded-2xl">
                    No attendee records found matching "{manualSearchQuery}".
                  </div>
                ) : (
                  filteredManualTickets.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-2xl bg-[#1C1C1C] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-white/20 transition-all"
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
                              ALREADY ADMITTED
                            </span>
                            <span className="text-[10px] text-gray-300 block mt-0.5">
                              {t.scannedAt || 'Admitted'}
                            </span>
                          </div>
                        ) : t.status === 'void' || t.status === 'cancelled' ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            VOID / REVOKED
                          </span>
                        ) : (
                          <button
                            onClick={() => handleScanCode(t.id)}
                            disabled={scanState.phase === 'verifying'}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-xs shadow-md shadow-[#D4AF37]/20 transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Admit Guest</span>
                            <ArrowRight className="w-3 h-3" />
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

        {/* Scan Result Panel / Full-Feedback Sidebar */}
        <div className="lg:col-span-5">
          {scanState.phase === 'allowed' ? (
            /* ALLOWED OUTCOME */
            <div className="p-6 sm:p-8 rounded-3xl border border-emerald-500/50 bg-emerald-950/40 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between">
                <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                {scanState.isRecentlyScanned && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                    Recently scanned
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-4xl sm:text-5xl font-heading font-black text-emerald-400 tracking-tight leading-none">
                  {scanState.heading}
                </h1>
                <p className="text-lg text-emerald-200/90 font-bold mt-2">
                  {scanState.subheading}
                </p>
              </div>

              {scanState.ticket && (
                <div className="p-5 rounded-2xl bg-black/60 border border-emerald-500/30 space-y-3.5 text-xs">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                      Attendee Name
                    </span>
                    <span className="text-2xl font-extrabold text-white leading-tight block mt-0.5">
                      {scanState.ticket.attendeeName}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase">Tickets</span>
                      <p className="font-bold text-amber-300 text-sm">{(scanState.ticket as any)?.quantity || 1}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase">Pass Tier</span>
                      <p className="font-bold text-emerald-300 text-sm">{scanState.ticket.tierName}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase">Seat / Section</span>
                      <p className="font-bold text-white text-sm">{scanState.ticket.seatNumber}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-gray-400">Ticket #</span>
                    <span className="font-mono font-bold text-[#D4AF37]">{scanState.ticket.ticketNumber}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Event</span>
                    <span className="font-semibold text-gray-200 truncate max-w-[180px]">
                      {scanState.ticket.eventTitle}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-emerald-300/70 pt-1">
                <span>Auto-clearing in 3 seconds…</span>
                <button
                  onClick={handleDismiss}
                  className="text-white hover:text-emerald-300 font-bold underline cursor-pointer"
                >
                  Scan next now
                </button>
              </div>
            </div>
          ) : scanState.phase === 'duplicate' ? (
            /* DUPLICATE OUTCOME */
            <div className="p-6 sm:p-8 rounded-3xl border border-amber-500/50 bg-amber-950/40 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between">
                <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Clock className="w-12 h-12" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                  Already Checked In
                </span>
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl font-heading font-black text-amber-400 tracking-tight leading-none">
                  {scanState.heading}
                </h1>
                <p className="text-sm sm:text-base text-amber-200/90 font-medium mt-2 leading-relaxed">
                  {scanState.subheading}
                </p>
              </div>

              {scanState.ticket && (
                <div className="p-5 rounded-2xl bg-black/60 border border-amber-500/30 space-y-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Attendee Name
                    </span>
                    <span className="text-xl font-bold text-white block mt-0.5">
                      {scanState.ticket.attendeeName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-gray-400">Tickets</span>
                    <span className="font-bold text-amber-300">{(scanState.ticket as any)?.quantity || 1}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Ticket #</span>
                    <span className="font-mono font-bold text-[#D4AF37]">{scanState.ticket.ticketNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Pass Tier</span>
                    <span className="font-bold text-gray-200">{scanState.ticket.tierName}</span>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/30 text-amber-200 text-xs">
                ⚠️ {scanState.actionHint || 'Do not admit again without supervisor clearance.'}
              </div>

              <div className="flex items-center justify-between text-xs text-amber-300/70 pt-1">
                <span>Auto-clearing in 3 seconds…</span>
                <button
                  onClick={handleDismiss}
                  className="text-white hover:text-amber-300 font-bold underline cursor-pointer"
                >
                  Scan next now
                </button>
              </div>
            </div>
          ) : scanState.phase === 'denied' ? (
            /* DENIED OUTCOME */
            <div className="p-6 sm:p-8 rounded-3xl border border-red-500/50 bg-red-950/40 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="p-3.5 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 w-fit">
                <XCircle className="w-12 h-12" />
              </div>

              <div>
                <h1 className="text-4xl sm:text-5xl font-heading font-black text-red-400 tracking-tight leading-none">
                  {scanState.heading}
                </h1>
                <p className="text-base font-bold text-red-200 mt-2">
                  {scanState.subheading}
                </p>
              </div>

              {scanState.actionHint && (
                <div className="p-4 rounded-2xl bg-black/60 border border-red-500/30 text-red-200 text-xs leading-relaxed">
                  {scanState.actionHint}
                </div>
              )}

              <button
                onClick={handleDismiss}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:brightness-110 text-white font-extrabold text-sm shadow-lg shadow-red-950/50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Dismiss & Ready for Next</span>
              </button>
            </div>
          ) : scanState.phase === 'network_err' ? (
            /* NETWORK ERROR OUTCOME */
            <div className="p-6 sm:p-8 rounded-3xl border border-amber-500/50 bg-amber-950/40 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 w-fit">
                <WifiOff className="w-12 h-12" />
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl font-heading font-black text-amber-400 tracking-tight leading-none">
                  {scanState.heading}
                </h1>
                <p className="text-sm sm:text-base font-medium text-amber-200 mt-2">
                  {scanState.subheading}
                </p>
              </div>

              {scanState.actionHint && (
                <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/30 text-amber-200 text-xs leading-relaxed">
                  {scanState.actionHint}
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={() => {
                    if (scanState.scannedToken) {
                      handleScanCode(scanState.scannedToken);
                    } else {
                      handleDismiss();
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs shadow-md shadow-[#D4AF37]/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Verification</span>
                </button>
                <button
                  onClick={() => {
                    handleDismiss();
                    setActiveTab('manual');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#1C1C1C] hover:bg-[#282828] text-gray-200 font-bold text-xs border border-white/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Look up guest manually</span>
                </button>
              </div>
            </div>
          ) : (
            /* IDLE STATE */
            <div className="h-full min-h-[340px] p-8 rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center text-center space-y-4 text-gray-300 shadow-xl">
              <div className="p-4 rounded-2xl bg-[#1C1C1C] text-[#D4AF37] border border-white/5">
                <QrCode className="w-12 h-12 stroke-[1.5]" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-white">Ready for Attendee</p>
                <p className="text-xs max-w-xs leading-relaxed text-gray-400">
                  Scan guest QR pass or search attendee records to admit entry instantly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
