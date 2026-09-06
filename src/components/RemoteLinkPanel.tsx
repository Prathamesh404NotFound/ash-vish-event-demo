import React, { useEffect, useRef, useState } from 'react';
import { Link2, Copy, RefreshCw, Smartphone, Loader2 } from 'lucide-react';
import {
  generateLinkCode, createScanLink, closeScanLink, watchScanLink,
  watchScanEntries, reportScanResult, ScanLinkRecord, ScanLinkEntry,
} from '../lib/scannerLink';
import { useAuth } from '../contexts/AuthContext';

/**
 * Laptop side of the phone↔laptop scanner link.
 *
 * Shows a 6-digit pairing code; scans submitted by the paired phone arrive
 * over RTDB, are verified through the same server-authoritative path as
 * camera scans (passed in via `onVerifyToken`), and the verdict is written
 * back so the phone sees the result. Every remote scan lands in the laptop's
 * normal scan-result UI, so both devices act as counters simultaneously.
 */

interface RemoteLinkPanelProps {
  onVerifyToken: (token: string) => Promise<{ ok: boolean; verdict: string; attendee?: string; ticketNumber?: string }>;
}

export const RemoteLinkPanel: React.FC<RemoteLinkPanelProps> = ({ onVerifyToken }) => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [session, setSession] = useState<ScanLinkRecord | null>(null);
  const [starting, setStarting] = useState(false);
  const [log, setLog] = useState<{ id: string; entry: ScanLinkEntry }[]>([]);
  const codeRef = useRef('');
  const processingRef = useRef<Set<string>>(new Set());

  const uid = (user as any)?.uid || (user as any)?.id || '';
  const name = (user as any)?.name || (user as any)?.email || 'Laptop';

  const startSession = async () => {
    setStarting(true);
    try {
      // Try a few times in the unlikely event of a code collision.
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateLinkCode();
        const ok = await createScanLink(candidate, uid, name);
        if (ok) {
          codeRef.current = candidate;
          setCode(candidate);
          return;
        }
      }
    } finally {
      setStarting(false);
    }
  };

  const endSession = async () => {
    if (codeRef.current) await closeScanLink(codeRef.current);
    codeRef.current = '';
    setCode('');
    setSession(null);
    setLog([]);
  };

  // Watch the session while it exists.
  useEffect(() => {
    if (!code) return;
    const unsub = watchScanLink(code, (rec) => setSession(rec));
    return () => unsub();
  }, [code]);

  // Auto-clean on unmount.
  useEffect(() => {
    return () => {
      if (codeRef.current) void closeScanLink(codeRef.current);
    };
  }, []);

  // Watch incoming phone scans and verify them through the real pipeline.
  useEffect(() => {
    if (!code) return;
    const unsub = watchScanEntries(code, (entries) => {
      for (const [id, entry] of Object.entries(entries || {})) {
        if (!entry || entry.result || processingRef.current.has(id)) continue;
        processingRef.current.add(id);
        void (async () => {
          try {
            const r = await onVerifyToken(entry.signedToken);
            await reportScanResult(code, id, r);
            setLog((prev) => [{ id, entry: { ...entry, result: r } }, ...prev].slice(0, 5));
          } catch {
            await reportScanResult(code, id, { ok: false, verdict: 'Verification failed — retry the scan.' });
          } finally {
            processingRef.current.delete(id);
          }
        })();
      }
    });
    return () => unsub();
  }, [code, onVerifyToken]);

  return (
    <div className="p-5 rounded-3xl bg-[#141414] border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[#D4AF37]" />
          Phone Scanner Link
        </span>
        {session?.status === 'active' && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
            {session.phoneName || 'Phone'} linked
          </span>
        )}
      </div>

      {!code ? (
        <>
          <p className="text-[11px] text-gray-400">
            Turn a staff phone into a second gate scanner. Scans on the phone are verified and logged here in real time.
          </p>
          <button
            onClick={startSession}
            disabled={starting}
            className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {starting ? 'Generating…' : 'Generate Pairing Code'}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center py-3 rounded-2xl bg-[#1C1C1C] border border-[#D4AF37]/30">
              <p className="text-3xl font-mono font-extrabold tracking-[0.3em] text-[#D4AF37]">{code}</p>
              <p className="text-[10px] text-gray-500 mt-1">
                {session?.status === 'active'
                  ? `Linked to ${session.phoneName || 'phone'} — scanning live`
                  : 'On the phone: open Remote Scanner and enter this code'}
              </p>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(code)}
              title="Copy code"
              className="p-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-gray-300 hover:text-white cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {log.length > 0 && (
            <div className="space-y-1.5">
              {log.map(({ id, entry }) => (
                <div key={id} className={`px-3 py-2 rounded-xl text-[11px] font-bold flex items-center justify-between ${
                  entry.result?.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                }`}>
                  <span>{entry.result?.attendee || 'Scan'}</span>
                  <span className="opacity-80">{entry.result?.ticketNumber || entry.result?.verdict || '…'}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={endSession}
            className="w-full py-2 rounded-xl bg-[#222] hover:bg-[#333] border border-white/10 text-gray-300 font-bold text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
            End Session
          </button>
        </div>
      )}
    </div>
  );
};
