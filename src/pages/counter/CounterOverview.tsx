import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, QrCode, UserPlus, CheckCircle2, Clock, Users, ShieldCheck, RefreshCw } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import { normalizeTiers } from '../../types';
import { CounterOverviewSkeleton } from '../../components/counter/CounterSkeletons';

export const CounterOverview: React.FC = () => {
  const navigate = useNavigate();
  const { events: contextEvents, allTickets } = useBooking();
  const [serverEvents, setServerEvents] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authenticatedApiHeaders();
        const res = await safeFetch<{ success: boolean; events: any[] }>(
          '/api/counter/events', { headers }
        );
        if (!cancelled && res.ok && res.data?.success && res.data.events?.length) {
          setServerEvents(res.data.events);
        }
      } catch { /* fall back to context events */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const events = serverEvents.length > 0 ? serverEvents : contextEvents;

  // Memoize all ticket statistics to avoid recalculating on every render
  const stats = useMemo(() => {
    const total = allTickets.length;
    const scanned = allTickets.filter((t) => t.status === 'redeemed' || t.status === 'used').length;
    const walkIn = allTickets.filter((t) => t.isWalkIn).length;
    const valid = allTickets.filter((t) => t.status === 'valid').length;
    const progress = total > 0 ? Math.round((scanned / total) * 100) : 0;
    return { total, scanned, walkIn, valid, progress };
  }, [allTickets]);

  // Memoize per-event stats — only show active (published/sold_out) events
  const eventStats = useMemo(() => {
    return events
      .filter((evt) => evt.status !== 'draft' && evt.status !== 'cancelled' && evt.status !== 'completed')
      .map((evt) => {
        const tiers = normalizeTiers(evt.ticketTiers);
        const eventTickets = allTickets.filter((t) => t.eventId === evt.id);
        const eventScanned = eventTickets.filter((t) => t.status === 'redeemed' || t.status === 'used').length;
        const remaining = tiers.reduce((sum, t) => sum + (t.remainingInventory ?? (t.totalInventory || 0)), 0);
        return { ...evt, eventTickets, eventScanned, remaining, tierCount: tiers.length };
      });
  }, [events, allTickets]);

  // Loading state: show skeleton while context is populating
  if (!events && allTickets.length === 0) {
    return <CounterOverviewSkeleton />;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in-up">
      {/* Top Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-[#1C1C1C] via-[#141414] to-[#0D0D0D] border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-xs font-bold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-3.5 h-3.5" /> Gate Operations Console
          </div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white">
            Ticket Counter Terminal
          </h1>
          <p className="text-gray-400 text-xs md:text-sm mt-1 max-w-xl">
            Real-time venue check-in progress, ticket QR validation, and instant walk-in pass issuance.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => navigate('/counter/scan')}
            className="flex-1 md:flex-initial py-3 px-5 rounded-2xl bg-[#D4AF37] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all active:scale-[0.98]"
          >
            <QrCode className="w-4 h-4 stroke-[2.5]" />
            <span>Scan QR Pass</span>
          </button>
          <button
            onClick={() => navigate('/counter/walk-in')}
            className="flex-1 md:flex-initial py-3 px-5 rounded-2xl bg-[#222] hover:bg-[#333] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all border border-white/10 active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            <span>Issue Walk-In</span>
          </button>
        </div>
      </div>

      {/* Counter Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#141414] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-gray-400 text-xs font-semibold">
            <span>Total Issued Passes</span>
            <Ticket className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <p className="font-heading font-extrabold text-2xl text-white">{stats.total}</p>
          <p className="text-[11px] text-gray-500">Across all online & counter sales</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#141414] border border-emerald-500/20 space-y-2">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Scanned at Gate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="font-heading font-extrabold text-2xl text-white">{stats.scanned}</p>
          <p className="text-[11px] text-emerald-400/80 font-medium">{stats.progress}% venue check-in rate</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#141414] border border-amber-500/20 space-y-2">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Awaiting Entry</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="font-heading font-extrabold text-2xl text-white">{stats.valid}</p>
          <p className="text-[11px] text-gray-500">Valid passes ready to enter</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#141414] border border-blue-500/20 space-y-2">
          <div className="flex items-center justify-between text-blue-400 text-xs font-semibold">
            <span>Counter Walk-Ins</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="font-heading font-extrabold text-2xl text-white">{stats.walkIn}</p>
          <p className="text-[11px] text-gray-500">Manual counter cash sales</p>
        </div>
      </div>

      {/* Check-In Progress Bar */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-white">
          <span>Overall Venue Gate Turnstile Progress</span>
          <span className="text-[#D4AF37]">{stats.scanned} / {stats.total} Guests Admitted</span>
        </div>
        <div className="w-full h-3 rounded-full bg-[#222] overflow-hidden">
          <div
            className="h-full bg-[#D4AF37] rounded-full transition-all duration-500"
            style={{ width: `${stats.progress}%` }}
          />
        </div>
      </div>

      {/* Today's Active Events for Check-in */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <h2 className="font-heading font-extrabold text-lg text-white flex items-center gap-2">
          <span>Active Events Schedule</span>
          <span className="text-xs font-normal text-gray-400">({eventStats.length} listed)</span>
        </h2>

        {eventStats.length === 0 ? (
          <div className="text-center py-8">
            <Ticket className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No active events found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventStats.map((evt) => (
              <div
                key={evt.id}
                className="p-4 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-3 hover:border-white/20 transition-all"
              >
                <div className="flex gap-3">
                  {evt.posterUrl ? (
                    <img
                      src={evt.posterUrl}
                      alt={evt.title}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#262626] border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Ticket className="w-6 h-6 text-white/30" />
                    </div>
                  )}
                  <div className="overflow-hidden min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-[#D4AF37] font-bold">
                      {evt.city} • {evt.venue}
                    </span>
                    <h3 className="font-heading font-bold text-sm text-white truncate">{evt.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{evt.date} @ {evt.time}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Check-In Status:</span>
                    <span className="font-bold text-white">
                      <span className="text-emerald-400">{evt.eventScanned}</span> / {evt.eventTickets.length} Passes Scanned
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Availability:</span>
                    <span className={`font-bold ${evt.remaining > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {evt.remaining} Tickets Left
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
