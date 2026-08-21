import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  CreditCard,
  QrCode,
  Calendar,
  User,
  History,
  TrendingUp,
  AlertTriangle,
  Lock,
  Unlock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

interface ShiftLiveTotals {
  expectedCash: number;
  cashSalesCount: number;
  totalSales: number;
  byMethod: Record<string, number>;
}

interface CounterSubUser {
  id: string;
  name: string;
  phone: string;
  status: 'active' | 'inactive';
}

interface Counter {
  id: string;
  name: string;
  subUsers?: Record<string, CounterSubUser>;
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

const QUICK_FLOAT_PRESETS = [0, 500, 1000, 2000, 5000];

export const ShiftPage: React.FC = () => {
  const { user } = useAuth();

  const [shifts, setShifts] = useState<CounterShift[]>([]);
  const [activeShift, setActiveShift] = useState<CounterShift | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  // Start shift form
  const [startingCash, setStartingCash] = useState<number | ''>(1000);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');
  const [selectedSubUserId, setSelectedSubUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');

  // End shift form
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [recentEndedShift, setRecentEndedShift] = useState<CounterShift | null>(null);

  const loadShifts = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorBanner('');
      const headers = await authenticatedApiHeaders();
      const [shiftRes, counterRes] = await Promise.all([
        safeFetch<{ success: boolean; shifts: CounterShift[]; error?: string }>('/api/counter/shifts', { headers }),
        safeFetch<{ success: boolean; counters: Counter[]; error?: string }>('/api/counter/list', { headers })
      ]);

      if (counterRes.ok && counterRes.data?.success) {
        setCounters(counterRes.data.counters || []);
      }

      if (shiftRes.ok && shiftRes.data?.success) {
        const list = shiftRes.data.shifts || [];
        // Sort newest first
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setShifts(list);

        // Find open shift for current user
        const open = list.find((s) => s.status === 'open' && (!s.staffId || s.staffId === user?.uid || (user as any)?.rbacRole === 'super_admin'));
        setActiveShift(open || null);
      } else {
        setErrorBanner(shiftRes.data?.error || shiftRes.error || 'Failed to load shifts.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error loading counter shifts.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Handle Start Shift
  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    setSuccessBanner('');

    const startVal = Number(startingCash);
    if (!Number.isFinite(startVal) || startVal < 0) {
      setErrorBanner('Starting cash float must be a valid non-negative number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; shift?: CounterShift; error?: string }>(
        '/api/counter/shifts/start',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            startingCash: startVal,
            counterId: selectedCounterId,
            subUserId: selectedSubUserId,
            pin: pin
          }),
        }
      );

      if (res.ok && res.data?.success && res.data.shift) {
        setSuccessBanner('Shift started successfully! Cash drawer is now open.');
        setStartingCash(1000);
        setSelectedCounterId('');
        setSelectedSubUserId('');
        setPin('');
        await loadShifts();
      } else {
        setErrorBanner(res.data?.error || res.error || 'Could not start shift.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error starting shift.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle End Shift
  const handleEndShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    setErrorBanner('');
    setSuccessBanner('');

    const countedVal = Number(countedCash);
    if (!Number.isFinite(countedVal) || countedVal < 0) {
      setErrorBanner('Counted ending cash must be a valid non-negative number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; shift?: CounterShift; totals?: ShiftLiveTotals; error?: string }>(
        `/api/counter/shifts/${activeShift.shiftId}/end`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ countedCash: countedVal }),
        }
      );

      if (res.ok && res.data?.success && res.data.shift) {
        setRecentEndedShift(res.data.shift);
        setSuccessBanner('Shift closed and reconciled successfully.');
        setCountedCash('');
        await loadShifts();
      } else {
        setErrorBanner(res.data?.error || res.error || 'Could not end shift.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error ending shift.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Live totals for currently active shift
  const liveTotals = activeShift?.liveTotals || {
    expectedCash: 0,
    cashSalesCount: 0,
    totalSales: 0,
    byMethod: {},
  };
  const expectedTotalCashInDrawer = (activeShift?.startingCash || 0) + liveTotals.expectedCash;

  const pastClosedShifts = shifts.filter((s) => s.status === 'closed');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl text-white">Shift & Cash Reconciliation</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Open/close gate cash registers, balance float amounts, and audit counter transaction totals.
            </p>
          </div>
        </div>

        <button
          onClick={loadShifts}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          <span>Refresh Shifts</span>
        </button>
      </div>

      {/* Alerts */}
      {errorBanner && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{errorBanner}</span>
        </div>
      )}

      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{successBanner}</span>
        </div>
      )}

      {/* Main Shift Status / Actions Container */}
      {isLoading && shifts.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141414] border border-white/10 text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center animate-spin mx-auto text-[#D4AF37]">
            <RefreshCw className="w-5 h-5" />
          </div>
          <p className="text-gray-400 text-xs font-medium">Checking shift registration status...</p>
        </div>
      ) : activeShift ? (
        /* ACTIVE OPEN SHIFT VIEW */
        <div className="space-y-6">
          {/* Active Shift Banner Card */}
          <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-[#1C1C1C] via-[#141414] to-[#0E0E0E] border border-emerald-500/40 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Unlock className="w-6 h-6" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                    ● Shift In Progress
                  </div>
                  <h2 className="font-heading font-extrabold text-xl text-white">
                    Shift ID: <span className="font-mono text-[#D4AF37]">{activeShift.shiftId}</span>
                  </h2>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1">
                <p className="text-gray-400">
                  Staff: <strong className="text-white">{activeShift.staffName}</strong>
                </p>
                <p className="text-gray-500 text-[11px]">
                  Started: {new Date(activeShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(activeShift.startTime).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Running Shift Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-gray-400 text-xs">
                  <span>Starting Float</span>
                  <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <p className="font-heading font-extrabold text-2xl text-white">₹{activeShift.startingCash}</p>
                <p className="text-[10px] text-gray-500">Initial drawer cash</p>
              </div>

              <div className="p-4 rounded-2xl bg-black/50 border border-emerald-500/20 space-y-1.5">
                <div className="flex items-center justify-between text-emerald-400 text-xs">
                  <span>Cash Collected</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="font-heading font-extrabold text-2xl text-emerald-400">₹{liveTotals.expectedCash}</p>
                <p className="text-[10px] text-gray-500">{liveTotals.cashSalesCount} cash sales made</p>
              </div>

              <div className="p-4 rounded-2xl bg-black/50 border border-blue-500/20 space-y-1.5">
                <div className="flex items-center justify-between text-blue-400 text-xs">
                  <span>Card & UPI Total</span>
                  <CreditCard className="w-4 h-4 text-blue-400" />
                </div>
                <p className="font-heading font-extrabold text-2xl text-white">
                  ₹{(liveTotals.byMethod?.card || 0) + (liveTotals.byMethod?.upi || 0)}
                </p>
                <p className="text-[10px] text-gray-500">
                  Card: ₹{liveTotals.byMethod?.card || 0} • UPI: ₹{liveTotals.byMethod?.upi || 0}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 space-y-1.5">
                <div className="flex items-center justify-between text-[#D4AF37] text-xs font-bold">
                  <span>Expected Drawer Total</span>
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <p className="font-heading font-extrabold text-2xl text-[#F3E5AB]">₹{expectedTotalCashInDrawer}</p>
                <p className="text-[10px] text-[#D4AF37]/80">Float + cash sales sum</p>
              </div>
            </div>

            {/* End Shift Form */}
            <form onSubmit={handleEndShift} className="p-6 rounded-2xl bg-black/60 border border-white/10 space-y-4">
              <div>
                <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#D4AF37]" />
                  <span>End Shift & Reconcile Cash</span>
                </h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  Count the physical cash in the drawer and enter below. The server will compute any variance.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-300">
                    Counted Ending Cash Amount (₹) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      placeholder="e.g. 3500"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || countedCash === ''}
                  className="w-full py-2.5 px-5 rounded-xl bg-gradient-to-r from-red-500/80 to-red-600 hover:brightness-110 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Reconcile & Close Shift</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* NO ACTIVE SHIFT — START SHIFT FORM */
        <div className="p-6 md:p-8 rounded-3xl bg-[#141414] border border-white/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                Cash Drawer Closed
              </span>
              <h2 className="font-heading font-extrabold text-xl text-white mt-1">Start New Shift</h2>
              <p className="text-gray-400 text-xs">
                Enter the opening float in the cash drawer before issuing walk-in passes.
              </p>
            </div>
          </div>

          {recentEndedShift && (
            <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
              Number(recentEndedShift.discrepancy || 0) === 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>Last Shift Summary (Shift #{recentEndedShift.shiftId})</span>
                <span>Discrepancy: ₹{recentEndedShift.discrepancy || 0}</span>
              </div>
              <p className="text-[11px] opacity-90">
                Counted: ₹{recentEndedShift.countedCash} vs Expected: ₹{(Number(recentEndedShift.startingCash) + Number(recentEndedShift.expectedCash || 0))}
                {Number(recentEndedShift.discrepancy || 0) === 0 ? ' (Perfect match ✓)' : ' (Variance recorded in audit log)'}
              </p>
            </div>
          )}

          <form onSubmit={handleStartShift} className="space-y-5 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Select Counter <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={selectedCounterId}
                  onChange={(e) => {
                    setSelectedCounterId(e.target.value);
                    setSelectedSubUserId('');
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
                >
                  <option value="">Choose a counter...</option>
                  {counters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Select Sub-User <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  disabled={!selectedCounterId}
                  value={selectedSubUserId}
                  onChange={(e) => setSelectedSubUserId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-all disabled:opacity-50"
                >
                  <option value="">Choose your name...</option>
                  {selectedCounterId && counters.find(c => c.id === selectedCounterId)?.subUsers && 
                    Object.values(counters.find(c => c.id === selectedCounterId)!.subUsers!).map(u => {
                      const sub = u as any;
                      return <option key={sub.id} value={sub.id}>{sub.name}</option>;
                    })
                  }
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Access PIN (4-digits) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    placeholder="****"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-white font-mono text-base tracking-widest focus:outline-none focus:border-[#D4AF37] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Starting Cash Float Amount (₹) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    placeholder="1000"
                    value={startingCash}
                    onChange={(e) => setStartingCash(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-white font-mono text-base focus:outline-none focus:border-[#D4AF37] transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {/* Quick Float Chips */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[11px] text-gray-500">Quick presets:</span>
                {QUICK_FLOAT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStartingCash(preset)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      startingCash === preset
                        ? 'bg-[#D4AF37] text-black shadow-md shadow-[#D4AF37]/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                    }`}
                  >
                    ₹{preset}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || startingCash === ''}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4 stroke-[2.5]" />
                  <span>Open Shift & Start Terminal</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Shift History Section */}
      <div className="p-6 md:p-8 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-heading font-extrabold text-lg text-white">Shift Audit History</h2>
        </div>

        {pastClosedShifts.length === 0 ? (
          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 text-center text-gray-500 text-xs">
            No closed shifts on record yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Shift ID</th>
                  <th className="py-3 px-3">Staff Member</th>
                  <th className="py-3 px-3">Opened</th>
                  <th className="py-3 px-3">Closed</th>
                  <th className="py-3 px-3 text-right">Start Float</th>
                  <th className="py-3 px-3 text-right">Counted Cash</th>
                  <th className="py-3 px-3 text-right">Sales Total</th>
                  <th className="py-3 px-3 text-center">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {pastClosedShifts.map((s) => {
                  const disc = Number(s.discrepancy || 0);
                  return (
                    <tr key={s.shiftId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3 font-bold text-[#D4AF37]">{s.shiftId}</td>
                      <td className="py-3 px-3 font-sans text-gray-300">{s.staffName}</td>
                      <td className="py-3 px-3 text-gray-400 font-sans">
                        {new Date(s.startTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-3 text-gray-400 font-sans">
                        {s.endTime ? new Date(s.endTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">₹{s.startingCash}</td>
                      <td className="py-3 px-3 text-right text-gray-300">₹{s.countedCash ?? '—'}</td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-bold">₹{s.totalSales ?? 0}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            disc === 0
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : disc > 0
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {disc === 0 ? '₹0 (Balanced)' : disc > 0 ? `+₹${disc} (Over)` : `-₹${Math.abs(disc)} (Short)`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
