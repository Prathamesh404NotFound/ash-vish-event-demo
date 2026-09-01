import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Printer,
  Ban,
  ArrowLeftRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Phone,
  Mail,
  Armchair,
  ShoppingBag,
  Clock,
  X,
  Filter,
  CreditCard,
  DollarSign,
  QrCode,
  Tag,
} from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetch } from '../../lib/api';
import { CounterOrdersSkeleton } from '../../components/counter/CounterSkeletons';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import { readPreferredStoredActiveShift } from '../../lib/counterSession';
import { SeatMap } from '../../components/SeatMap';

interface OrderItem {
  orderId: string;
  ticketId?: string;
  eventId: string;
  tierId: string;
  quantity?: number;
  amount: number;
  discount?: number;
  status: string; // confirmed, pending, cancelled, refunded, voided
  createdAt: string;
  channel?: string;
  paymentMethod?: string;
  customerDetails?: {
    name: string;
    email: string;
    phone: string;
  };
  seatIds?: string[];
  ticket?: {
    id: string;
    ticketNumber: string;
    seatNumber?: string;
    selectedSeats?: string[];
    status?: string;
  };
}

export const CounterOrders: React.FC = () => {
  const { events: contextEvents } = useBooking();
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
  const { user } = useAuth();

  // Pre-build event lookup map to avoid O(n*m) events.find inside orders.map
  const eventsMap = useMemo(() => {
    const map = new Map<string, any>();
    events.forEach((e) => map.set(e.id, e));
    return map;
  }, [events]);

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');

  // Action status messages
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  // Modals state
  // 1. Reprint Modal
  const [reprintOrder, setReprintOrder] = useState<OrderItem | null>(null);
  const [reprintReason, setReprintReason] = useState('Damaged or lost printout at counter');
  const [isReprinting, setIsReprinting] = useState(false);

  // 2. Void Modal
  const [voidOrder, setVoidOrder] = useState<OrderItem | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  // 3. Exchange Seat Modal
  const [exchangeOrder, setExchangeOrder] = useState<OrderItem | null>(null);
  const [selectedOldSeat, setSelectedOldSeat] = useState<string>('');
  const [selectedNewSeats, setSelectedNewSeats] = useState<string[]>([]);
  const [isExchanging, setIsExchanging] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setActionError('');
      const params = new URLSearchParams();
      const activeShift = readPreferredStoredActiveShift();
      if (activeShift?.shiftId) params.set('shiftId', String(activeShift.shiftId));
      if (activeShift?.counterId) params.set('counterId', String(activeShift.counterId));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedEventId !== 'all') params.set('eventId', selectedEventId);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (selectedChannel !== 'all') params.set('channel', selectedChannel);
      params.set('pageSize', '50');

      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; orders: OrderItem[]; total: number; error?: string }>(
        `/api/admin/orders?${params.toString()}`,
        { headers }
      );

      if (res.ok && res.data?.success) {
        setOrders(res.data.orders || []);
        setTotalCount(res.data.total || 0);
      } else {
        setActionError(res.data?.error || res.error || 'Failed to load orders.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error loading orders.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedEventId, selectedStatus, selectedChannel]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Execute Reprint
  const handleReprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reprintOrder) return;

    const ticketId = reprintOrder.ticketId || reprintOrder.ticket?.id || reprintOrder.orderId;
    if (!ticketId) {
      setActionError('Could not find ticket ID for this order.');
      return;
    }

    try {
      setIsReprinting(true);
      setActionError('');
      setActionSuccess('');
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; ticket?: any; error?: string }>(
        `/api/counter/tickets/${ticketId}/reprint`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: reprintReason.trim() }),
        }
      );

      if (res.ok && res.data?.success) {
        setActionSuccess(`Ticket #${res.data.ticket?.ticketNumber || ticketId} reprint logged and approved.`);
        setReprintOrder(null);
        setReprintReason('Damaged or lost printout at counter');
        window.print();
      } else {
        setActionError(res.data?.error || res.error || 'Could not reprint ticket.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error reprinting ticket.');
    } finally {
      setIsReprinting(false);
    }
  };

  // Execute Void
  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidOrder) return;

    try {
      setIsVoiding(true);
      setActionError('');
      setActionSuccess('');
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; message?: string; error?: string }>(
        `/api/counter/sales/${voidOrder.orderId}/void`,
        {
          method: 'POST',
          headers,
        }
      );

      if (res.ok && res.data?.success) {
        setActionSuccess(res.data.message || 'Sale voided successfully before finalization.');
        setVoidOrder(null);
        await fetchOrders();
      } else {
        setActionError(res.data?.error || res.error || 'Could not void sale.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error voiding sale.');
    } finally {
      setIsVoiding(false);
    }
  };

  // Open Exchange Modal
  const openExchangeModal = (order: OrderItem) => {
    setExchangeOrder(order);
    const existingSeats = order.seatIds || order.ticket?.selectedSeats || [];
    setSelectedOldSeat(existingSeats[0] || '');
    setSelectedNewSeats([]);
    setActionError('');
    setActionSuccess('');
  };

  // Execute Exchange
  const handleExchangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exchangeOrder || !selectedOldSeat || selectedNewSeats.length === 0) {
      setActionError('Please select both the old seat to release and the new replacement seat.');
      return;
    }

    try {
      setIsExchanging(true);
      setActionError('');
      setActionSuccess('');
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; ticket?: any; error?: string }>(
        `/api/counter/orders/${exchangeOrder.orderId}/exchange`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            oldSeatId: selectedOldSeat,
            newSeats: selectedNewSeats,
          }),
        }
      );

      if (res.ok && res.data?.success) {
        setActionSuccess(`Seat exchanged successfully! New seat: ${selectedNewSeats.join(', ')}`);
        setExchangeOrder(null);
        await fetchOrders();
      } else {
        setActionError(res.data?.error || res.error || 'Could not exchange seat.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Error exchanging seat.');
    } finally {
      setIsExchanging(false);
    }
  };

  const exchangeTargetEvent = exchangeOrder ? eventsMap.get(exchangeOrder.eventId) || null : null;
  const exchangeSeatsList = exchangeOrder ? (exchangeOrder.seatIds || exchangeOrder.ticket?.selectedSeats || []) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-xl text-white">Counter Orders & Ticketing Actions</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Look up sales, reprint physical gate passes, void in-flight bookings, or exchange assigned seats.
            </p>
          </div>
        </div>

        <button
          onClick={fetchOrders}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          <span>Refresh Orders</span>
        </button>
      </div>

      {/* Action Alerts */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="p-1 text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{actionError}</span>
          <button onClick={() => setActionError('')} className="p-1 text-red-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search name, phone, order ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-[#D4AF37] transition-all"
          />
        </div>

        {/* Event Selector */}
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
        >
          <option value="all">All Events ({events.length})</option>
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>
              {evt.title}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>

        {/* Channel Filter */}
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
        >
          <option value="all">All Channels</option>
          <option value="counter">Counter Walk-In</option>
          <option value="online">Online Booking</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-extrabold text-base text-white">Matching Orders</h2>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-gray-300 text-[10px] font-bold">
              {totalCount} Total
            </span>
          </div>
        </div>

        {isLoading ? (
          <CounterOrdersSkeleton />
        ) : orders.length === 0 ? (
          <div className="p-10 rounded-2xl bg-black/40 border border-white/5 text-center text-gray-500 text-xs">
            No orders match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Order Details</th>
                  <th className="py-3 px-3">Attendee</th>
                  <th className="py-3 px-3">Event & Seats</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((order) => {
                  const eventObj = eventsMap.get(order.eventId);
                  const seats = order.seatIds || order.ticket?.selectedSeats || [];
                  const isPending = order.status === 'pending';

                  return (
                    <tr key={order.orderId} className="hover:bg-white/[0.02] transition-colors">
                      {/* Order Details */}
                      <td className="py-3.5 px-3">
                        <p className="font-mono font-bold text-[#D4AF37] truncate max-w-[140px]">{order.orderId}</p>
                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                          {order.createdAt ? new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </p>
                        <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-white/5 text-[9px] text-gray-400 font-mono">
                          {order.channel || (order.paymentMethod?.startsWith('walkin') ? 'counter' : 'online')}
                        </span>
                      </td>

                      {/* Attendee */}
                      <td className="py-3.5 px-3 space-y-0.5">
                        <p className="font-bold text-white">{order.customerDetails?.name || 'Walk-In Guest'}</p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-gray-500" />
                          <span>{order.customerDetails?.phone || '—'}</span>
                        </p>
                      </td>

                      {/* Event & Seats */}
                      <td className="py-3.5 px-3 space-y-1">
                        <p className="font-semibold text-gray-200 truncate max-w-[200px]">{eventObj?.title || order.eventId}</p>
                        {seats.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D4AF37]/10 text-[#D4AF37] text-[10px] font-mono font-bold">
                            <Armchair className="w-3 h-3" />
                            <span>{seats.join(', ')}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500">General / GA ({order.quantity || 1} qty)</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-3 text-right">
                        <p className="font-mono font-bold text-white">₹{order.amount - (order.discount || 0)}</p>
                        <p className="text-[10px] text-gray-500 font-sans uppercase">
                          {order.paymentMethod?.replace('walkin_', '') || 'cash'}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            order.status === 'confirmed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : isPending
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Reprint */}
                          <button
                            onClick={() => setReprintOrder(order)}
                            title="Reprint Gate Pass"
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-all cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                          </button>

                          {/* Exchange Seat (only if event has seat map) */}
                          {seats.length > 0 && eventObj?.seatMap && (
                            <button
                              onClick={() => openExchangeModal(order)}
                              title="Exchange Seat"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-all cursor-pointer"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                            </button>
                          )}

                          {/* Void (for in-flight / pending sales) */}
                          {isPending && (
                            <button
                              onClick={() => setVoidOrder(order)}
                              title="Void In-Flight Sale"
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. REPRINT MODAL */}
      {/* ======================================================== */}
      {reprintOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-heading font-bold text-base text-white">Reprint Gate Pass</h3>
              </div>
              <button
                onClick={() => setReprintOrder(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 text-xs space-y-1">
              <p className="text-gray-400">Order ID: <span className="font-mono text-white">{reprintOrder.orderId}</span></p>
              <p className="text-gray-400">Attendee: <span className="text-white">{reprintOrder.customerDetails?.name}</span></p>
            </div>

            <form onSubmit={handleReprintSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Reprint Reason (Required for Audit Log) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Printer jam, damaged receipt, lost pass"
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReprintOrder(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReprinting || !reprintReason.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 hover:brightness-110 disabled:opacity-50"
                >
                  {isReprinting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  <span>Authorize & Print</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. VOID MODAL */}
      {/* ======================================================== */}
      {voidOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#141414] border border-red-500/30 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5 text-red-400">
                <Ban className="w-5 h-5" />
                <h3 className="font-heading font-bold text-base text-white">Void In-Flight Sale</h3>
              </div>
              <button
                onClick={() => setVoidOrder(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 space-y-2">
              <p className="font-semibold">Are you sure you want to void this pending sale?</p>
              <p className="text-[11px] opacity-80">
                Order <span className="font-mono font-bold text-white">{voidOrder.orderId}</span> will be cancelled immediately and any locked seats will be returned to inventory.
              </p>
            </div>

            <form onSubmit={handleVoidSubmit} className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setVoidOrder(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
              >
                Keep Order
              </button>
              <button
                type="submit"
                disabled={isVoiding}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isVoiding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                <span>Confirm Void</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. EXCHANGE SEAT MODAL */}
      {/* ======================================================== */}
      {exchangeOrder && exchangeTargetEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-4xl p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-6 shadow-2xl my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <ArrowLeftRight className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-heading font-bold text-base text-white">Seat Exchange Terminal</h3>
                  <p className="text-gray-400 text-xs">
                    Order: <span className="font-mono text-[#D4AF37]">{exchangeOrder.orderId}</span> • Event: {exchangeTargetEvent.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExchangeOrder(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Select which old seat to release */}
              <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2">
                <label className="block text-xs font-semibold text-gray-300">
                  Select Old Seat to Release from this Order:
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {exchangeSeatsList.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedOldSeat(s)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedOldSeat === s
                          ? 'bg-red-500/20 border border-red-500 text-red-300 shadow-md shadow-red-500/20'
                          : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      Release {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seat Map for picking new seat */}
              {exchangeTargetEvent.seatMap && (
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">Pick Available Replacement Seat:</span>
                    <span className="text-[#D4AF37] font-mono">
                      Selected New: {selectedNewSeats.join(', ') || 'None selected'}
                    </span>
                  </div>

                  <SeatMap
                    eventId={exchangeTargetEvent.id}
                    seatMapConfig={exchangeTargetEvent.seatMap}
                    requiredQuantity={1}
                    selectedSeatIds={selectedNewSeats}
                    onSeatsSelected={(seats) => setSelectedNewSeats(seats.slice(0, 1))}
                    ticketTiers={exchangeTargetEvent.ticketTiers}
                    currentUserId={user?.uid || 'counter_staff'}
                  />
                </div>
              )}
            </div>

            {/* Submit Exchange */}
            <div className="flex items-center justify-between border-t border-white/10 pt-4 shrink-0">
              <div className="text-xs text-gray-400">
                Swapping <span className="font-mono text-red-400 font-bold">{selectedOldSeat || '—'}</span> for <span className="font-mono text-emerald-400 font-bold">{selectedNewSeats[0] || '—'}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExchangeOrder(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExchangeSubmit}
                  disabled={isExchanging || !selectedOldSeat || selectedNewSeats.length === 0}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {isExchanging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                  <span>Execute Seat Swap</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
