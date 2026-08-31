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
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import { clearStoredActiveShift, readActiveCounterId, readStoredActiveShift, writeStoredActiveShift } from '../../lib/counterSession';
import { ShiftPageSkeleton } from '../../components/counter/CounterSkeletons';

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
  assignedStaffIds?: string[];
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
  autoReconciled?: boolean;
  status: 'open' | 'closed';
  closedBy?: string;
  liveTotals?: ShiftLiveTotals;
}

export const ShiftPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [shifts, setShifts] = useState<CounterShift[]>([]);
  const [activeShift, setActiveShift] = useState<CounterShift | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  // Start shift form
  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>(() => readActiveCounterId());
  const [selectedSubUserId, setSelectedSubUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');

  // End shift summary
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
        const all = counterRes.data.counters || [];
        const currentStaffId = user?.uid || user?.id || '';
        const visibleCounters = all.filter((counter) =>
          counter.assignedStaffIds?.includes(currentStaffId) || (user as any)?.rbacRole === 'super_admin'
        );
        // On a returning device, stay on the counter selected during sign-in
        // instead of exposing every counter assigned to the shared account.
        const scopedCounters = selectedCounterId
          ? visibleCounters.filter((counter) => counter.id === selectedCounterId)
          : visibleCounters;
        setCounters(scopedCounters);
        if (!selectedCounterId || scopedCounters.length === 0) {
          setSelectedCounterId(visibleCounters[0]?.id || '');
        }
      }

      if (shiftRes.ok && shiftRes.data?.success) {
        const list = shiftRes.data.shifts || [];
        // Sort newest first
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setShifts(list);

        const currentCounterId = selectedCounterId || '';
        const localShift = currentCounterId ? readStoredActiveShift(currentCounterId) : null;

        // A shared Firebase staff account may have several open sub-user shifts.
        // Only the shift stored on this device may become active here.
        const open = localShift?.shiftId
          ? list.find((shift) =>
              shift.status === 'open' &&
              shift.counterId === currentCounterId &&
              shift.shiftId === localShift.shiftId &&
              (!localShift.subUserId || shift.subUserId === localShift.subUserId)
            )
          : undefined;
        if (open) writeStoredActiveShift(open);
        else if (localShift) clearStoredActiveShift(localShift);

        // Auto-close shifts that have crossed midnight (new business day).
        if (open && open.startTime) {
          const shiftStart = new Date(open.startTime);
          const now = new Date();
          const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          if (shiftStart.getTime() < midnightToday.getTime()) {
            // Shift started before today's midnight — auto-close it.
            try {
              const endHeaders = await authenticatedApiHeaders();
              const endRes = await safeFetch<{ success: boolean; error?: string }>(
                `/api/counter/shifts/${open.shiftId}/end`,
                { method: 'POST', headers: endHeaders, body: JSON.stringify({}) }
              );
              if (endRes.ok && endRes.data?.success) {
                clearStoredActiveShift(open);
                setSuccessBanner('Previous shift was automatically closed at midnight. Please start a new shift for today.');
              } else {
                setErrorBanner(endRes.data?.error || 'Could not auto-close yesterday\'s shift. Please close it manually.');
              }
            } catch {
              setErrorBanner('Could not auto-close yesterday\'s shift. Please close it manually.');
            }
            setActiveShift(null);
            return;
          }
        }

        setActiveShift(open || null);
      } else {
        setErrorBanner(shiftRes.data?.error || shiftRes.error || 'Failed to load shifts.');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Error loading counter shifts.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCounterId, user?.uid]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Handle Start Shift
  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    if (!assignedCounter) {
      setErrorBanner('Select an assigned counter before signing in.');
      return;
    }
    setSuccessBanner('');

    try {
      setIsSubmitting(true);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; shift?: CounterShift; error?: string }>(
        '/api/counter/shifts/start',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            counterId: assignedCounter?.id, // Backend also auto-resolves when omitted.
            subUserId: selectedSubUserId,
            pin,
          }),
        }
      );

      if (res.ok && res.data?.success && res.data.shift) {
        setSuccessBanner('Signed in successfully! Ticket issuance is now ready.');
        // Persist shift to localStorage so other pages (My Sales, Walk-in) know the current sub-user session.
        writeStoredActiveShift(res.data.shift);
        setSelectedSubUserId('');
        setPin('');
        await loadShifts();
        navigate('/counter/walk-in');
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

    try {
      setIsSubmitting(true);
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; shift?: CounterShift; totals?: ShiftLiveTotals; error?: string }>(
        `/api/counter/shifts/${activeShift.shiftId}/end`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        }
      );

      if (res.ok && res.data?.success && res.data.shift) {
        setRecentEndedShift(res.data.shift);
        setSuccessBanner('Shift closed and reconciled successfully.');
        clearStoredActiveShift(activeShift);
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
  const assignedCounter = counters.find((counter) => counter.id === selectedCounterId) || null;
  const assignedCounters = counters;
  const assignedSubUsers: CounterSubUser[] = assignedCounter
    ? (Object.values(assignedCounter.subUsers || {}) as CounterSubUser[]).filter((subUser) => subUser.status !== 'inactive')
    : [];
  const selectedSubUser = assignedSubUsers.find((subUser) => subUser.id === selectedSubUserId);

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
              Select your assigned counter identity, sign in with your PIN, and let the system track every sale automatically.
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
        <ShiftPageSkeleton />
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
                  <span>System Start Balance</span>
                  <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <p className="font-heading font-extrabold text-2xl text-white">₹{activeShift.startingCash || 0}</p>
                <p className="text-[10px] text-gray-500">No manual float required</p>
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
                  <span>End Ticket-Counter Session</span>
                </h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  The system will close this session and calculate sales, payment-method totals, and reconciliation automatically. No cash count is required.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/10">
                  <span className="text-gray-500 block">Recorded Sales</span>
                  <strong className="text-emerald-400 text-lg">₹{liveTotals.totalSales}</strong>
                </div>
                <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/10">
                  <span className="text-gray-500 block">Cash Collected</span>
                  <strong className="text-white text-lg">₹{liveTotals.expectedCash}</strong>
                </div>
                <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/10">
                  <span className="text-gray-500 block">System Drawer Total</span>
                  <strong className="text-[#D4AF37] text-lg">₹{expectedTotalCashInDrawer}</strong>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-red-500/80 to-red-600 hover:brightness-110 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>End Session & Save Totals</span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* NO ACTIVE SHIFT — PIN SIGN-IN */
        <div className="p-6 md:p-8 rounded-3xl bg-[#141414] border border-white/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                Counter Sign-In Required
              </span>
              <h2 className="font-heading font-extrabold text-xl text-white mt-1">Who is operating this counter?</h2>
              <p className="text-gray-400 text-xs">
                Choose your name, enter your PIN, and start your own ticket session on this device.
              </p>
            </div>
          </div>

          {recentEndedShift && (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs space-y-1.5">
              <div className="flex items-center justify-between font-bold">
                <span>Previous session closed</span>
                <span>Sales: ₹{recentEndedShift.totalSales || 0}</span>
              </div>
              <p className="text-[11px] opacity-90">The system saved its payment totals and closed it without requiring a cash count.</p>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>{assignedCounter ? assignedCounter.name : (isLoading ? 'Detecting assigned counter…' : 'No counter assigned')}</span>
            </div>
            {!assignedCounter && !isLoading ? (
              <p className="text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Ask an administrator to assign your account to an active counter.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-400">Choose the physical counter first:</p>
                {assignedCounters.length > 0 && (
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assignedCounters.map((counter) => {
                      const isSelected = selectedCounterId === counter.id;
                      return (
                        <button
                          key={counter.id}
                          type="button"
                          onClick={() => {
                            setSelectedCounterId(counter.id);
                            setSelectedSubUserId('');
                            setPin('');
                            setErrorBanner('');
                          }}
                          className={`min-h-20 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/10'
                              : 'bg-[#1A1A1A] border-white/10 hover:border-[#D4AF37]/50'
                          }`}
                        >
                          <span className="block text-sm font-extrabold text-white">{counter.name}</span>
                          <span className="block text-[10px] mt-1 text-gray-400">Assigned counter</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {assignedCounter && <p className="text-xs text-gray-400">Choose one of the users assigned to <span className="text-[#D4AF37] font-semibold">{assignedCounter.name}</span>:</p>}
                {assignedSubUsers.length === 0 ? (
                  <p className="p-4 rounded-xl bg-[#1A1A1A] border border-amber-500/30 text-xs text-amber-300">
                    No active counter users are configured yet. Ask an administrator to add a counter user and PIN.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assignedSubUsers.map((subUser) => {
                      const isSelected = selectedSubUserId === subUser.id;
                      return (
                        <button
                          key={subUser.id}
                          type="button"
                          onClick={() => { setSelectedSubUserId(subUser.id); setPin(''); setErrorBanner(''); }}
                          className={`min-h-20 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37] shadow-lg shadow-[#D4AF37]/10'
                              : 'bg-[#1A1A1A] border-white/10 hover:border-[#D4AF37]/50'
                          }`}
                        >
                          <span className="block text-sm font-extrabold text-white">{subUser.name}</span>
                          <span className="block text-[10px] text-gray-400 mt-1">PIN-protected operator</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {selectedSubUser && (
            <form onSubmit={handleStartShift} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Enter PIN for <span className="text-[#D4AF37]">{selectedSubUser.name}</span> <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    autoFocus
                    placeholder="4-digit PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1A1A1A] border border-[#D4AF37]/30 text-white font-mono text-base tracking-[0.45em] focus:outline-none focus:border-[#D4AF37] transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || pin.length !== 4}
                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4 stroke-[2.5]" />}
                <span>Verify PIN & Start Ticket Issuance</span>
              </button>
            </form>
          )}
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
