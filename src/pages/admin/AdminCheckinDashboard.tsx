import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Users, CheckCircle2, Clock, TrendingUp, RefreshCw, 
  QrCode, BarChart3, Activity, Zap, Calendar
} from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

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
  const { events } = useBooking();
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [data, setData] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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
    </div>
  );
}
