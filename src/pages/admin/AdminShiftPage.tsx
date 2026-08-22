import React, { useEffect, useState, useCallback } from 'react';
import { 
  Clock, 
  DollarSign, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  History, 
  TrendingUp, 
  AlertTriangle, 
  Armchair,
  Users,
  Search,
  Filter,
  X,
  ExternalLink,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

interface ShiftLiveTotals {
  expectedCash: number;
  cashSalesCount: number;
  totalSales: number;
  byMethod: Record<string, number>;
}

interface CounterShift {
  shiftId: string;
  staffId: string;
  staffName: string;
  staffRole?: string;
  counterId?: string;
  counterName?: string;
  subUserId?: string;
  subUserName?: string;
  startTime: string;
  endTime?: string;
  startingCash: number;
  countedCash?: number;
  expectedCash?: number;
  discrepancy?: number;
  cashSalesCount?: number;
  totalSales?: number;
  byMethod?: Record<string, number>;
  status: 'open' | 'closed';
  closedBy?: string;
  liveTotals?: ShiftLiveTotals;
}

export const AdminShiftPage: React.FC = () => {
  const [shifts, setShifts] = useState<CounterShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedShift, setSelectedShift] = useState<CounterShift | null>(null);
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [closeCountedCash, setCloseCountedCash] = useState<number | ''>('');

  const loadShifts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; shifts: CounterShift[]; error?: string }>('/api/counter/shifts', { headers });
      
      if (res.ok && res.data?.success) {
        // Sort shifts by start time descending
        const sorted = (res.data.shifts || []).sort((a, b) => 
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
        setShifts(sorted);
        setSelectedShift((current) => {
          if (!current) return null;
          return sorted.find((shift) => shift.shiftId === current.shiftId) || null;
        });
      } else {
        setError(res.data?.error || res.error || 'Failed to load shifts.');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading shifts.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Keep active terminal totals current while the admin panel is open. The
  // selected detail view is synchronized in loadShifts so force-close actions
  // and sales made on another terminal are reflected without reopening it.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void loadShifts();
      }
    };
    const interval = window.setInterval(refreshIfVisible, 30000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [loadShifts]);

  const handleEndShift = async () => {
    if (!selectedShift || closeCountedCash === '') return;
    
    try {
      setIsClosingShift(true);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; error?: string }>(
        `/api/counter/shifts/${selectedShift.shiftId}/end`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ countedCash: Number(closeCountedCash) }),
        }
      );

      if (res.ok && res.data?.success) {
        setSelectedShift(null);
        setCloseCountedCash('');
        await loadShifts();
      } else {
        alert(res.data?.error || 'Could not end shift.');
      }
    } catch (err: any) {
      alert(err.message || 'Error ending shift.');
    } finally {
      setIsClosingShift(false);
    }
  };

  const filteredShifts = shifts.filter(s => {
    const matchesSearch = 
      s.staffName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.counterName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.subUserName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.shiftId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const openShifts = shifts.filter(s => s.status === 'open');
  const totalOpenCash = openShifts.reduce((sum, s) => sum + (s.liveTotals?.expectedCash || 0) + s.startingCash, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-[#1C1C1C] via-[#141414] to-[#0D0D0D] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-2xl">
        <div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
            OPERATIONAL AUDIT
          </span>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mt-1 flex items-center gap-2">
            <Clock className="w-8 h-8 text-[#D4AF37]" />
            <span>Counter Shift Management</span>
          </h1>
          <p className="text-gray-400 text-xs md:text-sm mt-1">
            Monitor active terminals, reconcile cash drawers, and audit staff shift history.
          </p>
        </div>

        <button
          onClick={loadShifts}
          disabled={isLoading}
          className="p-3 rounded-2xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block text-center">Active Terminals</span>
          <span className="font-heading font-extrabold text-4xl text-[#D4AF37] block text-center">
            {openShifts.length}
          </span>
          <div className="flex justify-center">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Live Sessions
            </span>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block text-center">Est. Cash in Drawers</span>
          <span className="font-heading font-extrabold text-4xl text-white block text-center">
            ₹{totalOpenCash.toLocaleString()}
          </span>
          <div className="flex justify-center">
            <span className="text-xs text-gray-400 font-medium">Aggregate float + cash sales</span>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block text-center">Shift Discrepancy</span>
          <span className={`font-heading font-extrabold text-4xl block text-center ${shifts.some(s => (s.discrepancy || 0) !== 0) ? 'text-red-500' : 'text-emerald-500'}`}>
            ₹{shifts.reduce((sum, s) => sum + (s.discrepancy || 0), 0).toLocaleString()}
          </span>
          <div className="flex justify-center">
            <span className="text-xs text-gray-400 font-medium">Net over/short for all history</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[#D4AF37] transition-colors" />
          <input
            type="text"
            placeholder="Search by operator, counter, or shift ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#141414] border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 bg-[#141414] border border-white/10 rounded-2xl p-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === 'all' ? 'bg-[#D4AF37] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            All History
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === 'open' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Open Now
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === 'closed' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Reconciled
          </button>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Operator & Counter</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Duration</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Float/Sales</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Discrepancy</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredShifts.length > 0 ? (
                filteredShifts.map((s) => (
                  <tr key={s.shiftId} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.status === 'open' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">
                            {s.subUserName || s.staffName}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Armchair className="w-2.5 h-2.5" /> {s.counterName || 'Main Terminal'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <p className="text-xs text-gray-300 font-medium">
                          {new Date(s.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {s.endTime ? ` — ${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (Active)'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="space-y-0.5">
                        <p className="text-xs text-white font-bold">₹{(s.status === 'open' ? (s.liveTotals?.totalSales || 0) : (s.totalSales || 0)).toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">Float: ₹{s.startingCash}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {s.status === 'closed' ? (
                        <span className={`text-xs font-bold ${(s.discrepancy || 0) === 0 ? 'text-emerald-500' : (s.discrepancy || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(s.discrepancy || 0) > 0 ? '+' : ''}{s.discrepancy?.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500 italic">Unreconciled</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {s.status === 'open' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-extrabold uppercase tracking-widest border border-emerald-500/20">
                          Live
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 text-[10px] font-extrabold uppercase tracking-widest border border-gray-500/20">
                          Closed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedShift(s)}
                        className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all"
                        title="View Details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <History className="w-12 h-12 opacity-20" />
                      <p className="text-sm">No shift records match your search.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Details / Control Modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#121212] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedShift.status === 'open' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-500'}`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-white">Shift Audit Details</h3>
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{selectedShift.shiftId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedShift(null)}
                className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Status Banner */}
              {selectedShift.status === 'open' ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 animate-pulse">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-emerald-400">Active Session</p>
                    <p className="text-[10px] text-emerald-400/70">This terminal is currently issuing tickets. Metrics are real-time.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-gray-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-gray-300">Reconciled Session</p>
                    <p className="text-[10px] text-gray-500">This shift was closed and audited on {new Date(selectedShift.endTime!).toLocaleString()}.</p>
                  </div>
                </div>
              )}

              {/* Attribution Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Operator</span>
                  <p className="text-sm font-bold text-white">{selectedShift.subUserName || selectedShift.staffName}</p>
                  <p className="text-[10px] text-gray-400">{selectedShift.staffRole || 'Counter Staff'}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Terminal</span>
                  <p className="text-sm font-bold text-white">{selectedShift.counterName || 'Main Counter'}</p>
                  <p className="text-[10px] text-gray-400">ID: {selectedShift.counterId || 'N/A'}</p>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#D4AF37]" /> Financial Reconciliation
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Left Column: Input/Expected */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-xs text-gray-400">Starting Float</span>
                      <span className="text-sm font-bold text-white">₹{selectedShift.startingCash.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-xs text-gray-400">Cash Sales</span>
                      <span className="text-sm font-bold text-emerald-400">
                        +₹{(selectedShift.status === 'open' ? (selectedShift.liveTotals?.expectedCash || 0) : (selectedShift.expectedCash || 0)).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-xs font-bold text-white">Expected Total</span>
                      <span className="text-sm font-black text-white">
                        ₹{(selectedShift.startingCash + (selectedShift.status === 'open' ? (selectedShift.liveTotals?.expectedCash || 0) : (selectedShift.expectedCash || 0))).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actual/Result */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-xs text-gray-400">Counted Cash</span>
                      <span className="text-sm font-bold text-white">
                        {selectedShift.status === 'open' ? '—' : `₹${selectedShift.countedCash?.toLocaleString()}`}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center p-3 rounded-xl border ${selectedShift.status === 'open' ? 'bg-white/[0.02] border-white/5' : (selectedShift.discrepancy || 0) === 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <span className="text-xs text-gray-400">Discrepancy</span>
                      <span className={`text-sm font-black ${selectedShift.status === 'open' ? 'text-gray-500' : (selectedShift.discrepancy || 0) === 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {selectedShift.status === 'open' ? 'Pending' : `${(selectedShift.discrepancy || 0) > 0 ? '+' : ''}${selectedShift.discrepancy?.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" /> Revenue by Channel
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(selectedShift.status === 'open' ? (selectedShift.liveTotals?.byMethod || {}) : (selectedShift.byMethod || {})).map(([method, amount]) => (
                    <div key={method} className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block">{method}</span>
                      <span className="text-sm font-bold text-white">₹{amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {Object.keys(selectedShift.status === 'open' ? (selectedShift.liveTotals?.byMethod || {}) : (selectedShift.byMethod || {})).length === 0 && (
                    <div className="col-span-full p-4 text-center text-[10px] text-gray-500 italic">
                      No sales recorded for this shift yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Force-Close Control */}
              {selectedShift.status === 'open' && (
                <div className="pt-6 border-t border-white/10 space-y-4">
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-widest">Administrative Control</h4>
                  </div>
                  <div className="p-6 rounded-[24px] bg-amber-500/5 border border-amber-500/20 space-y-4">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      You are about to force-close this active terminal shift. This should only be done if the staff member forgot to end their shift or in case of terminal failure.
                    </p>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Reconciled Cash Amount (₹)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Enter final cash count..."
                          value={closeCountedCash}
                          onChange={(e) => setCloseCountedCash(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50"
                        />
                        <button
                          onClick={handleEndShift}
                          disabled={isClosingShift || closeCountedCash === ''}
                          className="px-6 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xs transition-all flex items-center gap-2"
                        >
                          {isClosingShift ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          <span>Force Close</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-white/[0.02] border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedShift(null)}
                className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
