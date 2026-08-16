import React, { useEffect, useState } from 'react';
import { useBooking } from '../../contexts/BookingContext';
import {
  BarChart3, CalendarDays, Download, IndianRupee, TrendingUp, Users,
} from 'lucide-react';

interface ReportData {
  summary: { totalRevenue: number; totalRefunded: number; totalOrders: number; totalTickets: number };
  revenueByEvent: { eventId: string; title: string; revenue: number; netRevenue: number; orders: number; tickets: number }[];
  revenueByDate: { date: string; revenue: number; orders: number }[];
  attendanceVsCapacity: { eventId: string; title: string; capacity: number; sold: number; checkedIn: number }[];
  channels: Record<string, number>;
}

export const AdminReports: React.FC = () => {
  const { fetchReports } = useBooking();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchReports({ from: from || undefined, to: to || undefined });
      setReport(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    if (!report) return;
    const lines = [
      'event,title,revenue,netRevenue,orders,tickets,capacity,sold,checkedIn',
      ...report.revenueByEvent.map((e) => {
        const a = report.attendanceVsCapacity.find((x) => x.eventId === e.eventId);
        return [e.eventId, `"${e.title}"`, e.revenue, e.netRevenue, e.orders, e.tickets, a?.capacity ?? 0, a?.sold ?? 0, a?.checkedIn ?? 0].join(',');
      }),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const channelTotal = Object.values<number>(report?.channels || {}).reduce((s, n) => s + Number(n), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Revenue, attendance, and sales-channel breakdown across all events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              aria-label="From date"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              aria-label="To date"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={exportCsv}
            disabled={!report}
            className="px-4 py-2 rounded-lg border border-white/15 text-sm font-medium hover:bg-white/5 disabled:opacity-40 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {!report ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-gray-400">
          {loading ? 'Loading report…' : 'No report data available.'}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={<IndianRupee className="w-5 h-5 text-emerald-400" />}
              label="Gross Revenue"
              value={`₹${(report.summary.totalRevenue || 0).toLocaleString('en-IN')}`}
            />
            <SummaryCard
              icon={<TrendingUp className="w-5 h-5 text-rose-400" />}
              label="Refunded"
              value={`₹${(report.summary.totalRefunded || 0).toLocaleString('en-IN')}`}
            />
            <SummaryCard
              icon={<BarChart3 className="w-5 h-5 text-amber-400" />}
              label="Orders"
              value={String(report.summary.totalOrders || 0)}
            />
            <SummaryCard
              icon={<Users className="w-5 h-5 text-sky-400" />}
              label="Tickets Sold"
              value={String(report.summary.totalTickets || 0)}
            />
          </div>

          {/* Revenue by event */}
          <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 font-semibold">Revenue by Event</div>
            <div className="divide-y divide-white/5">
              {report.revenueByEvent.length === 0 && (
                <div className="px-5 py-6 text-sm text-gray-400">No confirmed orders in this range.</div>
              )}
              {report.revenueByEvent.map((e) => {
                const a = report.attendanceVsCapacity.find((x) => x.eventId === e.eventId);
                return (
                  <div key={e.eventId} className="px-5 py-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-center text-sm">
                    <div className="col-span-2 md:col-span-2 font-medium truncate">{e.title}</div>
                    <div>₹{(e.revenue || 0).toLocaleString('en-IN')}</div>
                    <div className="text-gray-400">{e.orders} orders · {e.tickets} tickets</div>
                    <div className="text-gray-400">
                      {a ? `${a.checkedIn}/${a.capacity} checked in` : '—'}
                    </div>
                    <div className="md:col-span-1">
                      {a && a.capacity > 0 ? (
                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden" title={`${Math.round((a.sold / a.capacity) * 100)}% sold`}>
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, Math.round((a.sold / a.capacity) * 100))}%` }} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Revenue by date */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 font-semibold">Revenue by Date</div>
              <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                {report.revenueByDate.length === 0 && (
                  <div className="px-5 py-6 text-sm text-gray-400">No orders in this range.</div>
                )}
                {report.revenueByDate.map((d) => (
                  <div key={d.date} className="px-5 py-3 flex items-center justify-between text-sm">
                    <span className="text-gray-300">{d.date}</span>
                    <span>₹{(d.revenue || 0).toLocaleString('en-IN')} · {d.orders} orders</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Channel split */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 font-semibold">Sales by Channel</div>
              <div className="px-5 py-4 space-y-3">
                {Object.keys(report.channels || {}).length === 0 && (
                  <div className="text-sm text-gray-400">No orders yet.</div>
                )}
                {Object.entries(report.channels || {}).map(([channel, count]) => {
                  const n = Number(count);
                  const pct = channelTotal > 0 ? Math.round((n / channelTotal) * 100) : 0;
                  return (
                    <div key={channel} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize text-gray-300">{channel.replace('_', ' ')}</span>
                        <span>{count} orders ({pct}%)</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Attendance vs capacity */}
          <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 font-semibold">Attendance vs Capacity</div>
            <div className="divide-y divide-white/5">
              {report.attendanceVsCapacity.length === 0 && (
                <div className="px-5 py-6 text-sm text-gray-400">No capacity data yet.</div>
              )}
              {report.attendanceVsCapacity.map((a) => {
                const soldPct = a.capacity > 0 ? Math.round((a.sold / a.capacity) * 100) : 0;
                return (
                  <div key={a.eventId} className="px-5 py-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate mr-3">{a.title}</span>
                      <span className="text-gray-400 shrink-0">
                        {a.sold} sold / {a.capacity} capacity · {a.checkedIn} checked in
                      </span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${soldPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">{icon}</div>
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  </div>
);
