import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Ban } from 'lucide-react';

export type EntryStatus = 'UNUSED' | 'PARTIALLY_CHECKED_IN' | 'FULLY_CHECKED_IN' | 'CANCELLED' | 'EXPIRED' | 'INVALID';

/** Derives a consistent entry status from the authoritative ticket fields. */
export function deriveEntryStatus(ticket: any): EntryStatus {
  const qty = Math.max(1, Math.floor(Number(ticket?.quantity) || 1));
  const st = String(ticket?.status || 'valid').toLowerCase();
  if (st === 'expired') return 'EXPIRED';
  if (['voided', 'void', 'cancelled', 'canceled', 'refunded', 'deleted'].includes(st)) return 'CANCELLED';
  const checkedIn = st === 'redeemed' && ticket?.checkedInQuantity == null
    ? qty
    : Math.min(qty, Math.max(0, Math.floor(Number(ticket?.checkedInQuantity) || 0)));
  if (checkedIn >= qty) return 'FULLY_CHECKED_IN';
  if (checkedIn > 0) return 'PARTIALLY_CHECKED_IN';
  return 'UNUSED';
}

export function entryCounts(ticket: any): { total: number; admitted: number; remaining: number } {
  const total = Math.max(1, Math.floor(Number(ticket?.quantity) || 1));
  const st = String(ticket?.status || 'valid').toLowerCase();
  const admitted = st === 'redeemed' && ticket?.checkedInQuantity == null
    ? total
    : Math.min(total, Math.max(0, Math.floor(Number(ticket?.checkedInQuantity) || 0)));
  return { total, admitted, remaining: Math.max(0, total - admitted) };
}

const STATUS_META: Record<EntryStatus, { label: string; className: string; icon: React.ReactNode }> = {
  UNUSED: { label: 'UNUSED', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  PARTIALLY_CHECKED_IN: { label: 'PARTIAL ENTRY', className: 'bg-sky-500/10 text-sky-400 border-sky-500/30', icon: <Clock className="w-3 h-3" /> },
  FULLY_CHECKED_IN: { label: 'FULLY CHECKED IN', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
  CANCELLED: { label: 'CANCELLED', className: 'bg-red-500/10 text-red-400 border-red-500/30', icon: <Ban className="w-3 h-3" /> },
  EXPIRED: { label: 'EXPIRED', className: 'bg-red-500/10 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
  INVALID: { label: 'INVALID', className: 'bg-red-500/10 text-red-400 border-red-500/30', icon: <XCircle className="w-3 h-3" /> },
};

/** Consistent status badge: color + icon + text (never color alone). */
export const EntryStatusBadge: React.FC<{ ticket: any; className?: string }> = ({ ticket, className = '' }) => {
  const status = deriveEntryStatus(ticket);
  const meta = STATUS_META[status];
  const { total, admitted, remaining } = entryCounts(ticket);
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.className}`}>
        {meta.icon}
        <span>{meta.label}</span>
      </span>
      <span className="text-[10px] text-gray-400 font-semibold whitespace-nowrap">
        {admitted} / {total} admitted · {remaining} remaining
      </span>
    </div>
  );
};

/** Chronological entry history list (newest first) with reversals shown separately. */
export const EntryHistoryList: React.FC<{ records: any[]; total?: number; max?: number }> = ({ records, total, max = 5 }) => {
  if (!records?.length) return null;
  const sorted = [...records].sort((a, b) => String(b.scannedAt || '').localeCompare(String(a.scannedAt || '')));
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Entry History</p>
      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {sorted.slice(0, max).map((r: any) => (
          <div key={r.id || r.entryTransactionId} className={`p-2.5 rounded-xl border text-[11px] ${r.type === 'reversal' ? 'bg-red-950/30 border-red-500/20' : 'bg-black/50 border-white/5'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${r.type === 'reversal' ? 'text-red-300' : 'text-white'}`}>
                {r.type === 'reversal' ? `−${r.quantityReversed} reversed` : `+${r.quantityEntered} guests`}
              </span>
              <span className="text-gray-500">{r.totalAfter ?? ''}{total ? ` / ${total}` : ''}</span>
            </div>
            <span className="text-gray-400 block">
              {r.scannedAt || r.reversedAt ? new Date(r.scannedAt || r.reversedAt).toLocaleString() : ''}
              {r.scannedBy ? ` · ${r.scannedBy}` : ''}{r.counterId ? ` · ${r.counterId}` : ''}
            </span>
            {r.note && <span className="text-[#D4AF37] block mt-0.5">“{r.note}”</span>}
            {r.type === 'reversal' && r.reason && <span className="text-red-300 block">Reason: {r.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
