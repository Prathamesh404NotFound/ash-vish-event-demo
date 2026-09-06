import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, CheckCircle2, Clock, TrendingUp, RefreshCw, 
  QrCode, BarChart3, Activity, Zap, UserPlus, X, Search
} from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import { Ticket } from '../../types';

interface CheckinData {
  eventId: string;
  eventTitle: string;
  totalTickets: number;
  totalQuantity: number;
  checkedIn: number;
  checkedInQuantity: number;
  remaining: number;
  checkInRate: number;
  lastScanAt: string | null;
  recentScans: { ticketNumber: string; attendeeName: string; scannedAt: string; tierName: string }[];
  byTier: { tierName: string; total: number; checkedIn: number }[];
}

export function AdminCheckinDashboard() {
  const { events, allTickets, scanTicketQR } = useBooking();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [data, setData] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Manual check-in modal state
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkInLoading, setCheckInLoading] = useState<string | null>(null);
  const [checkInResult, setCheckInResult] = useState<{ ticketId: string; success: boolean; message: string } | null>(null);

  const fetchCheckinData = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; data: CheckinData }>(
        `/api/admin/checkin-dashboard?eventId=${selectedEventId}`,
        { headers }
      );
      if (res.ok && res.data?.success && res.data.data) {
        setData(res.data.data);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch check-in data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedEventId) fetchCheckinData();
  }, [selectedEventId, fetchCheckinData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!selectedEventId) return;
    const interval = setInterval(fetchCheckinData, 30000);
    return () => clearInterval(interval);
  }, [selectedEventId, fetchCheckinData]);

  const publishedEvents = useMemo(
    () => events.filter((e) => e.status === 'published' || e.status === 'completed'),
    [events]
  );

  const ratePercent = data ? Math.round(data.checkInRate * 100) : 0;

  // Filter tickets for the selected event and search query
  const searchResults = useMemo(() => {
    if (!checkInModalOpen || !selectedEventId || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allTickets
      .filter((t) => t.eventId === selectedEventId)
      .filter((t) => {
        const name = (t.attendeeName || '').toLowerCase();
        const phone = (t.attendeePhone || '').toLowerCase();
        const ticketNum = (t.ticketNumber || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || ticketNum.includes(q);
      })
      .slice(0, 20);
  }, [checkInModalOpen, selectedEventId, searchQuery, allTickets]);

  const handleManualCheckIn = async (ticket: Ticket) => {
    if (!ticket.passSlug?.id || !ticket.passSlug?.sig) {
      setCheckInResult({ ticketId: ticket.id, success: false, message: 'This ticket has no valid pass link. Cannot check in.' });
      return;
    }
    setCheckInLoading(ticket.id);
    setCheckInResult(null);
    try {
      const signedToken = `${ticket.passSlug.id}/${ticket.passSlug.sig}`;
      const result = await scanTicketQR(signedToken, user?.name || 'Admin');
      setCheckInResult({
        ticketId: ticket.id,
        success: result.success,
        message: result.success ? `${ticket.attendeeName || 'Guest'} checked in successfully!` : result.message,
      });
      if (result.success) {
        // Refresh dashboard data after successful check-in
        fetchCheckinData();
      }
    } catch (err) {
      setCheckInResult({ ticketId: ticket.id, success: false, message: 'Check-in failed. Please try again.' });
    } finally {
      setCheckInLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl text-white">Live Check-in Dashboard</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Real-time gate scan counts versus tickets sold during events.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchCheckinData}
            disabled={!selectedEventId || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold border border-white/10 transition-all cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && selectedEventId && (
            <button
              onClick={() => { setCheckInModalOpen(true); setSearchQuery(''); setCheckInResult(null); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] text-xs font-semibold border border-[#D4AF37]/30 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Manual Check-In
            </button>
          )}
        </div>
      </div>

      {/* Event Selector */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-white/10">
        <label className="text-xs font-bold text-gray-300 block mb-2">Select Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full sm:w-auto bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
        >
          <option value="">Choose an event...</option>
          {publishedEvents.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-[#141414] border border-white/10"
          >
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Total Tickets</span>
            </div>
            <p className="font-heading font-extrabold text-3xl text-white">{data.totalQuantity}</p>
            <p className="text-[10px] text-gray-500 mt-1">{data.totalTickets} ticket records</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-5 rounded-2xl bg-[#141414] border border-emerald-500/20"
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Checked In</span>
            </div>
            <p className="font-heading font-extrabold text-3xl text-emerald-400">{data.checkedInQuantity}</p>
            <p className="text-[10px] text-gray-500 mt-1">{data.checkedIn} tickets scanned</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-5 rounded-2xl bg-[#141414] border border-white/10"
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Remaining</span>
            </div>
            <p className="font-heading font-extrabold text-3xl text-white">{data.remaining}</p>
            <p className="text-[10px] text-gray-500 mt-1">Not yet checked in</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-5 rounded-2xl bg-[#141414] border border-white/10"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Check-in Rate</span>
            </div>
            <p className="font-heading font-extrabold text-3xl text-[#D4AF37]">{ratePercent}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                style={{ width: `${ratePercent}%` }}
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* Tier Breakdown */}
      {data && data.byTier.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#141414] border border-white/10">
          <h3 className="font-heading font-bold text-sm text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#D4AF37]" />
            Tier Breakdown
          </h3>
          <div className="space-y-3">
            {data.byTier.map((tier) => {
              const tierRate = tier.total > 0 ? Math.round((tier.checkedIn / tier.total) * 100) : 0;
              return (
                <div key={tier.tierName} className="flex items-center gap-4">
                  <span className="text-xs text-gray-300 w-32 truncate font-bold">{tier.tierName}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                      style={{ width: `${tierRate}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-20 text-right">
                    {tier.checkedIn}/{tier.total} ({tierRate}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Scans */}
      {data && data.recentScans.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#141414] border border-white/10">
          <h3 className="font-heading font-bold text-sm text-white mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            Recent Scans
          </h3>
          <div className="space-y-2">
            {data.recentScans.slice(0, 20).map((scan, i) => (
              <div
                key={`${scan.ticketNumber}-${i}`}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs text-white font-bold">{scan.attendeeName || 'Walk-in'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{scan.ticketNumber}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#D4AF37] font-bold">{scan.tierName}</span>
                  <p className="text-[10px] text-gray-600">{new Date(scan.scannedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!selectedEventId && (
        <div className="text-center py-16 space-y-4">
          <QrCode className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">Select an event to view real-time check-in metrics.</p>
        </div>
      )}

      {/* Manual Check-In Modal */}
      <AnimatePresence>
        {checkInModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setCheckInModalOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-[#141414] border border-white/10 rounded-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#D4AF37]" />
                  <h2 className="font-heading font-bold text-white text-sm">Manual Check-In</h2>
                </div>
                <button
                  onClick={() => setCheckInModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Input */}
              <div className="p-4 border-b border-white/5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCheckInResult(null); }}
                    placeholder="Search by name, phone, or ticket number..."
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#D4AF37]"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search Results */}
              <div className="max-h-80 overflow-y-auto p-2">
                {searchQuery.trim() && searchResults.length === 0 && (
                  <p className="text-center text-gray-500 text-xs py-8">No tickets found for this search.</p>
                )}
                {!searchQuery.trim() && (
                  <p className="text-center text-gray-500 text-xs py-8">Type a name, phone number, or ticket number to search.</p>
                )}
                {searchResults.map((ticket) => {
                  const isCheckedIn = ticket.status === 'redeemed';
                  return (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-bold truncate">{ticket.attendeeName || 'Guest'}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{ticket.ticketNumber || ticket.id}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#D4AF37]">{ticket.tierName || 'Standard'}</span>
                          {ticket.attendeePhone && (
                            <span className="text-[10px] text-gray-600">{ticket.attendeePhone}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            Checked In
                          </span>
                        ) : (
                          <button
                            onClick={() => handleManualCheckIn(ticket)}
                            disabled={checkInLoading === ticket.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#D4AF37]/80 text-black text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            {checkInLoading === ticket.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                            Check In
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Result Feedback */}
              <AnimatePresence>
                {checkInResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`mx-4 mb-4 p-3 rounded-xl text-xs font-bold ${
                      checkInResult.success
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}
                  >
                    {checkInResult.success ? '✓ ' : '✕ '}{checkInResult.message}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
