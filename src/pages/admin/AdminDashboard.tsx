import React, { useEffect, useState } from 'react';
import { TrendingUp, Ticket, Sparkles, ShieldCheck, Users, Calendar, ArrowRight, IndianRupee, AlertCircle, RefreshCw } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useNavigate } from 'react-router-dom';

interface ReportData {
  summary: { totalRevenue: number; totalRefunded: number; totalOrders: number; totalTickets: number };
  revenueByEvent: { eventId: string; title: string; revenue: number; netRevenue: number; orders: number; tickets: number }[];
  revenueByDate: { date: string; revenue: number; orders: number }[];
  attendanceVsCapacity: { eventId: string; title: string; capacity: number; sold: number; checkedIn: number }[];
  channels: Record<string, number>;
  bySubUser?: Record<string, { tickets: number; amount: number }>;
}

export const AdminDashboard: React.FC = () => {
  const { events, allTickets, fetchReports } = useBooking();
  const navigate = useNavigate();

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReports({});
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to load real-time reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Live KPI Calculations
  const totalRevenue = report?.summary?.totalRevenue ?? allTickets.reduce((sum, t) => sum + (t.totalPaid || 0), 0);
  const ticketsSold = report?.summary?.totalTickets ?? allTickets.reduce((sum, t) => sum + (t.quantity || 1), 0);
  
  // Checked-In calculation: sum of checkedIn across all events in report, or count of redeemed/used tickets
  const checkedInCount = report?.attendanceVsCapacity?.reduce((sum, item) => sum + (item.checkedIn || 0), 0) ?? 
    allTickets.filter(t => t.status === 'redeemed' || t.status === 'used').length;

  // Pending Collection calculation: sum of amountDue for pending reservation passes
  const pendingCollection = allTickets
    .filter(t => t.paymentStatus === 'pending' || t.passType === 'reservation')
    .reduce((sum, t) => sum + (Number(t.amountDue) || 0), 0);

  // 12-Day Sales Velocity Chart Data Generation
  // Generate the last 12 dates as an array of YYYY-MM-DD
  const getVelocityChartData = () => {
    const dataPoints: { dateLabel: string; displayLabel: string; revenue: number; orders: number }[] = [];
    const revenueMap = new Map<string, { revenue: number; orders: number }>();

    if (report?.revenueByDate) {
      report.revenueByDate.forEach((item) => {
        // Date might be YYYY-MM-DD or standard ISO, normalise to YYYY-MM-DD
        const formattedDate = new Date(item.date).toISOString().split('T')[0];
        revenueMap.set(formattedDate, { revenue: item.revenue, orders: item.orders });
      });
    }

    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const match = revenueMap.get(dateStr);
      
      const dayLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      dataPoints.push({
        dateLabel: dateStr,
        displayLabel: dayLabel,
        revenue: match ? match.revenue : 0,
        orders: match ? match.orders : 0
      });
    }

    return dataPoints;
  };

  const chartData = getVelocityChartData();
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1000); // Guard against zero to avoid divide-by-zero

  return (
    <div className="space-y-8 max-w-6xl mx-auto" id="admin-executive-dashboard">
      {/* Header Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-[#1C1C1C] via-[#141414] to-[#0D0D0D] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-2xl">
        <div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
            SYSTEM OVERVIEW
          </span>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mt-1 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
            <span>Admin Executive Dashboard</span>
          </h1>
          <p className="text-gray-400 text-xs md:text-sm mt-1">
            Realtime revenue analytics, active shows, gate throughput, and system metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/admin/events')}
            className="py-3 px-5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all"
          >
            <span>Manage Events ({events.length})</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Total Gross Revenue */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2 relative overflow-hidden">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Gross Revenue</span>
          <span className="font-heading font-extrabold text-3xl text-white block">
            {loading ? "..." : `₹${totalRevenue.toLocaleString()}`}
          </span>
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" /> Real-time aggregate
          </span>
        </div>

        {/* Card 2: Tickets Sold */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2 relative overflow-hidden">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Tickets Sold</span>
          <span className="font-heading font-extrabold text-3xl text-[#D4AF37] block">
            {loading ? "..." : ticketsSold}
          </span>
          <span className="text-xs text-gray-400 block">passes issued across shows</span>
        </div>

        {/* Card 3: Checked-In */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2 relative overflow-hidden">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Checked-In</span>
          <span className="font-heading font-extrabold text-3xl text-white block">
            {loading ? "..." : checkedInCount}
          </span>
          <span className="text-xs text-purple-400 font-semibold block">
            {ticketsSold > 0 ? `${((checkedInCount / ticketsSold) * 100).toFixed(1)}% attendance rate` : "No tickets sold"}
          </span>
        </div>

        {/* Card 4: Pending Collection */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2 relative overflow-hidden">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Pending Collection</span>
          <span className="font-heading font-extrabold text-3xl text-amber-500 block">
            {loading ? "..." : `₹${pendingCollection.toLocaleString()}`}
          </span>
          <span className="text-xs text-gray-400 block">outstanding reservation balances</span>
        </div>
      </div>

      {/* Sales Velocity Chart */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
            <span>12-Day Ticket Sales Velocity</span>
          </h3>
          <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
            Daily Revenue Track
          </span>
        </div>

        {loading ? (
          <div className="h-48 w-full bg-[#1C1C1C] rounded-2xl border border-white/5 flex items-center justify-center text-xs text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin text-[#D4AF37]" />
            <span className="ml-2">Recalculating sales speed...</span>
          </div>
        ) : (
          <div className="h-48 w-full bg-[#1C1C1C] rounded-2xl p-6 flex items-end justify-between gap-3 border border-white/5">
            {chartData.map((day, idx) => {
              const percentage = (day.revenue / maxRevenue) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 bg-[#090909] border border-white/15 px-2.5 py-1.5 rounded-lg text-[9px] font-mono text-[#D4AF37] pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 shadow-xl whitespace-nowrap z-10">
                    <p className="font-bold text-white mb-0.5">{day.displayLabel}</p>
                    <p>Rev: ₹{day.revenue.toLocaleString()}</p>
                    <p className="text-gray-400">Orders: {day.orders}</p>
                  </div>

                  <div
                    className="w-full bg-gradient-to-t from-[#F3E5AB] to-[#D4AF37] rounded-t-lg transition-all duration-300 hover:brightness-125 hover:shadow-lg hover:shadow-[#D4AF37]/10"
                    style={{ height: `${percentage > 0 ? Math.max(percentage, 4) : 2}%` }}
                  />
                  <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap">{day.displayLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sub-User Breakdown */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="font-heading font-extrabold text-lg text-white">Counter Operator Performance</h2>
              <p className="text-[10px] text-gray-500">Calculated from attendee ticket records, not shift totals.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-all flex items-center gap-2 text-xs font-bold"
            title="Refresh operator performance"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {report?.bySubUser && Object.keys(report.bySubUser).length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(report.bySubUser).map(([name, metrics]) => (
              <div key={name} className="p-4 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{name}</p>
                <p className="text-xl font-black text-[#D4AF37]">{metrics.tickets} ticket{metrics.tickets === 1 ? '' : 's'}</p>
                <p className="text-xs text-gray-300">Sales: ₹{metrics.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-6">No counter-issued attendee tickets found.</p>
        )}
      </div>

      {/* Quick Event Summary Table */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-extrabold text-lg text-white">Live Event Portfolio</h2>
          <button
            onClick={() => navigate('/admin/events')}
            className="text-xs font-bold text-[#D4AF37] hover:underline"
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {events.slice(0, 3).map((e) => (
            <div key={e.id} className="p-4 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-2 hover:border-[#D4AF37]/30 transition-all">
              <img src={e.posterUrl} alt={e.title} className="w-full h-28 rounded-xl object-cover" />
              <h3 className="font-bold text-sm text-white truncate">{e.title}</h3>
              <p className="text-xs text-gray-400">{e.city} • {e.date}</p>
              <div className="pt-2 border-t border-white/5 flex justify-between text-xs">
                <span className="text-gray-400">Starting Price:</span>
                <span className="font-bold text-[#D4AF37]">₹{e.startingPrice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
