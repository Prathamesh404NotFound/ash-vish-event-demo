import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  Mail,
  Ban,
  Filter,
  Plus,
  Edit,
  Undo2,
  X,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
} from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';

interface AdminOrder {
  id: string;
  orderId?: string;
  eventTitle?: string;
  eventName?: string;
  eventId?: string;
  customerName?: string;
  attendeeName?: string;
  customerEmail?: string;
  attendeeEmail?: string;
  customerPhone?: string;
  attendeePhone?: string;
  totalAmount?: number;
  amount?: number;
  amountPaid?: number;
  refundAmount?: number;
  quantity?: number;
  seatsCount?: number;
  seatIds?: string[];
  seatLabels?: string[];
  seatNumbers?: string[];
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentGateway?: string;
  channel?: string;
  channelLabel?: string;
  paymentMethodLabel?: string;
  ticketNumber?: string;
  counterName?: string;
  issuedBySubUserName?: string;
  issuedBy?: string;
  discountAmount?: number;
  discountLabel?: string;
  couponCode?: string;
  createdAt?: string;
  createdAtMs?: number;
  [key: string]: any;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  refunded: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
  pending: 'bg-gray-500/10 text-gray-300 border-gray-500/30',
};

const CHANNEL_LABEL: Record<string, string> = {
  online: 'Online booking',
  counter: 'Counter sale',
  manual: 'Manual sale',
  walkin_guest: 'Walk-In sale',
};

function formatOrderDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Minimal client-side tier normalizer (server-side version is authoritative). */
function normalizeTiers(ticketTiers: any): { id?: string | null; name?: string; price?: number }[] {
  if (!ticketTiers) return [];
  if (Array.isArray(ticketTiers)) {
    return ticketTiers.map((t: any) => ({ ...t, id: t.id || t.tierId || null }));
  }
  if (typeof ticketTiers === 'object') {
    return Object.values(ticketTiers as Record<string, any>).map((t: any) => ({
      ...t,
      id: t.id || null,
    }));
  }
  return [];
}

export const AdminBookings: React.FC = () => {
  const {
    events,
    fetchOrders,
    createManualOrder,
    editOrder,
    refundOrder,
    bulkOrdersAction,
    resendTicketWhatsApp,
    allTickets,
  } = useBooking();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalDiscount: 0, totalTickets: 0, totalOrders: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [filterEventId, setFilterEventId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterCounter, setFilterCounter] = useState('');
  const [filterIssuer, setFilterIssuer] = useState('');
  const [discountStatus, setDiscountStatus] = useState<'all' | 'applied' | 'none'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editOrderTarget, setEditOrderTarget] = useState<AdminOrder | null>(null);
  const [refundOrderTarget, setRefundOrderTarget] = useState<AdminOrder | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<AdminOrder | null>(null);
  const [resendingTicketId, setResendingTicketId] = useState<string | null>(null);

  // Feedback
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4500);
  };

  const loadOrders = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const result = await fetchOrders({
        eventId: filterEventId || undefined,
        status: filterStatus || undefined,
        channel: filterChannel || undefined,
        counterName: filterCounter || undefined,
        issuer: filterIssuer || undefined,
        discountStatus: discountStatus === 'all' ? undefined : discountStatus,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        page,
        pageSize,
      });
      if (result.orders) {
        setOrders(result.orders as AdminOrder[]);
      }
      if (result.summary) setSummary(result.summary);
      if (typeof result.total === 'number') setTotalCount(result.total);
      else if (Array.isArray(result.data)) {
        setOrders(result.data as AdminOrder[]);
        setTotalCount(result.data.length);
      }
      setLastSyncedAt(new Date());
    } catch {
      if (!silent) showBanner('error', 'Could not load orders.');
    } finally {
      if (silent) setIsRefreshing(false);
      else setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEventId, filterStatus, filterChannel, dateFrom, dateTo, page, pageSize]);

  // Keep local orders in sync with search input typing (server-side search still applies on submit)
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      loadOrders();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadOrders(true);
    };
    const interval = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEventId, filterStatus, filterChannel, filterCounter, filterIssuer, discountStatus, dateFrom, dateTo, search, page, pageSize]);

  // Fallback view when the orders API is unreachable: render tickets from RTDB
  const fallbackOrders = useMemo<AdminOrder[]>(
    () =>
      allTickets.map((t) => ({
        id: t.id,
        orderId: t.orderId || t.id,
        eventTitle: t.eventTitle,
        eventName: t.eventTitle,
        customerName: t.attendeeName,
        customerEmail: t.attendeeEmail || '',
        customerPhone: t.attendeePhone,
        totalAmount: t.totalPaid,
        amountPaid: t.totalPaid,
        quantity: 1,
        seatsCount: 1,
        status: t.status,
        channel: t.isWalkIn ? 'counter' : 'online',
          createdAt: t.purchasedAt,
          ticketNumber: t.ticketNumber,
          counterName: t.counterName,
          issuedBySubUserName: t.issuedBySubUserName,
          issuedBy: t.createdByStaffId || t.scannedByStaffId,
          discountAmount: Number(t.discount || 0),
          discountLabel: Number(t.discount || 0) > 0 ? 'Discount applied' : 'No discount',
          paymentMethodLabel: t.paymentMethod,
        })),
    [allTickets]
  );
  const viewOrders = orders.length > 0 ? orders : fallbackOrders;

  const handleExportFilteredCSV = async () => {
    try {
      await bulkOrdersAction('export', {
        eventId: filterEventId || undefined,
        status: filterStatus || undefined,
        channel: filterChannel || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
      });
      showBanner('success', 'Filtered export downloaded.');
    } catch {
      showBanner('error', 'Filtered export failed; falling back to CSV of current table.');
      const headers =
        'Order ID,Event,Customer,Email,Phone,Amount,Status,Channel,Created\n';
      const rows = viewOrders
        .map((o) =>
          [
            o.orderId || o.id,
            o.eventTitle || o.eventName || '',
            o.customerName || o.attendeeName || '',
            o.customerEmail || o.attendeeEmail || '',
            o.customerPhone || o.attendeePhone || '',
            `₹${o.totalAmount ?? o.amount ?? o.amountPaid ?? 0}`,
            o.status || '',
            o.channel || '',
            o.createdAt || '',
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ash_vish_orders_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleBulkAction = async (action: 'cancel' | 'email' | 'export', payload?: any) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      action === 'cancel' &&
      !confirm(
        `You are about to cancel ${ids.length} order(s). "This will cancel the selected orders and their tickets. This action is irreversible." Confirm?`
      )
    )
      return;
    if (action === 'email' && !payload?.subject?.trim()) {
      showBanner('error', 'Email subject cannot be empty.');
      return;
    }
    try {
      const res = await bulkOrdersAction(action, { orderIds: ids, ...payload });
      if (res.ok) {
        showBanner('success', `${action === 'cancel' ? 'Cancelled' : action === 'email' ? 'Emails queued for' : 'Exported'} ${ids.length} order(s).`);
        setSelectedIds(new Set());
        setSelectAll(false);
        await loadOrders();
      } else {
        showBanner('error', res.error || 'Bulk action failed.');
      }
    } catch {
      showBanner('error', 'Bulk action failed.');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(viewOrders.map((o) => o.id)));
    }
    setSelectAll(!selectAll);
  };

  const displayStatus = (o: AdminOrder) => {
    if (o.refundAmount && Number(o.refundAmount) > 0) return 'refunded';
    if (o.paymentStatus) return o.paymentStatus;
    return o.status || 'confirmed';
  };

  const handleResendWhatsApp = async (order: AdminOrder) => {
    const ticketId = order.ticketId;
    const phone = order.customerPhone || order.attendeePhone;
    if (!ticketId) {
      showBanner('error', 'This sale has no linked ticket record.');
      return;
    }
    if (!phone) {
      showBanner('error', 'This ticket has no customer phone number.');
      return;
    }
    if (!window.confirm(`Resend the WhatsApp ticket message to ${order.customerName || 'this customer'}?`)) return;

    setResendingTicketId(ticketId);
    try {
      const response = await resendTicketWhatsApp(ticketId);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'WhatsApp resend failed.');
      }
      showBanner('success', 'WhatsApp ticket message sent successfully.');
      setDetailsOrder(null);
      await loadOrders(true);
    } catch (error: any) {
      showBanner('error', error?.message || 'WhatsApp resend failed.');
    } finally {
      setResendingTicketId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // ---------------- Create Order form state ----------------
  const [coEventId, setCoEventId] = useState('');
  const [coQuantity, setCoQuantity] = useState<number>(1);
  const [coName, setCoName] = useState('');
  const [coEmail, setCoEmail] = useState('');
  const [coPhone, setCoPhone] = useState('');
  const [coPaymentMethod, setCoPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [coErrorMessage, setCoErrorMessage] = useState('');
  const [coSubmitting, setCoSubmitting] = useState(false);

  const openCreateModal = () => {
    setCoEventId('');
    setCoQuantity(1);
    setCoName('');
    setCoEmail('');
    setCoPhone('');
    setCoPaymentMethod('cash');
    setCoErrorMessage('');
    setCreateModalOpen(true);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coEventId) return setCoErrorMessage('Please select an event.');
    if (!coName.trim()) return setCoErrorMessage('Customer name is required.');
    if (coEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coEmail))
      return setCoErrorMessage('Email is invalid.');
    setCoSubmitting(true);
    setCoErrorMessage('');
    try {
      const event = events.find((e) => e.id === coEventId);
      const tierId = normalizeTiers(event?.ticketTiers)[0]?.id;
      if (!tierId) {
        setCoErrorMessage('This event has no configured ticket tiers yet. Add tiers in the seat map / pricing settings.');
        setCoSubmitting(false);
        return;
      }
      const res = await createManualOrder({
        eventId: coEventId,
        tierId,
        attendeeName: coName.trim(),
        attendeeEmail: coEmail.trim() || undefined,
        attendeePhone: coPhone.trim() || undefined,
        quantity: Math.max(1, Number(coQuantity) || 1),
        paymentMethod: coPaymentMethod,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoErrorMessage(json.error || 'Creating the order failed.');
        setCoSubmitting(false);
        return;
      }
      showBanner('success', `Manual order created for "${coName.trim()}".`);
      setCreateModalOpen(false);
      await loadOrders();
    } catch {
      setCoErrorMessage('Creating the order failed. Please try again.');
    } finally {
      setCoSubmitting(false);
    }
  };

  // ---------------- Edit Order form state ----------------
  const [edName, setEdName] = useState('');
  const [edEmail, setEdEmail] = useState('');
  const [edPhone, setEdPhone] = useState('');
  const [edEventId, setEdEventId] = useState('');
  const [edTierId, setEdTierId] = useState('');
  const [edQuantity, setEdQuantity] = useState(1);
  const [edSeats, setEdSeats] = useState('');
  const [edDiscount, setEdDiscount] = useState(0);
  const [edCouponCode, setEdCouponCode] = useState('');
  const [edPaymentMethod, setEdPaymentMethod] = useState('');
  const [edCounterName, setEdCounterName] = useState('');
  const [edIssuer, setEdIssuer] = useState('');
  const [edErrorMessage, setEdErrorMessage] = useState('');
  const [edSubmitting, setEdSubmitting] = useState(false);

  const openEditModal = (o: AdminOrder) => {
    setEditOrderTarget(o);
    setEdName(o.customerName || o.attendeeName || '');
    setEdEmail(o.customerEmail || o.attendeeEmail || '');
    setEdPhone(o.customerPhone || o.attendeePhone || '');
    setEdEventId(o.eventId || '');
    setEdTierId(o.tierId || '');
    setEdQuantity(Number(o.quantity || 1));
    setEdSeats((o.seatLabels || o.seatNumbers || o.seatIds || []).join(', '));
    setEdDiscount(Number(o.discountAmount ?? o.discount ?? 0));
    setEdCouponCode(o.couponCode || '');
    setEdPaymentMethod(o.paymentMethod || o.paymentMethodLabel || '');
    setEdCounterName(o.counterName || '');
    setEdIssuer(o.issuedBySubUserName || o.issuedBy || '');
    setEdErrorMessage('');
  };

  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrderTarget) return;
    if (edEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edEmail))
      return setEdErrorMessage('Email is invalid.');
    setEdSubmitting(true);
    setEdErrorMessage('');
    try {
      const res = await editOrder(editOrderTarget.id, {
        customerDetails: {
          name: edName.trim(),
          email: edEmail.trim(),
          phone: edPhone.trim(),
        },
        eventId: edEventId || undefined,
        tierId: edTierId || undefined,
        quantity: Math.max(1, Number(edQuantity) || 1),
        selectedSeats: edSeats.trim() ? edSeats.split(',').map((seat) => seat.trim()).filter(Boolean) : [],
        discount: Math.max(0, Number(edDiscount) || 0),
        couponCode: edCouponCode.trim(),
        paymentMethod: edPaymentMethod.trim(),
        counterName: edCounterName.trim(),
        issuedBySubUserName: edIssuer.trim(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEdErrorMessage(json.error || 'Updating the order failed.');
        setEdSubmitting(false);
        return;
      }
      showBanner('success', 'Order updated.');
      setEditOrderTarget(null);
      await loadOrders();
    } catch {
      setEdErrorMessage('Updating the order failed. Please try again.');
    } finally {
      setEdSubmitting(false);
    }
  };

  // ---------------- Refund form state ----------------
  const [rfFull, setRfFull] = useState(true);
  const [rfAmount, setRfAmount] = useState<number>(0);
  const [rfReason, setRfReason] = useState('');
  const [rfErrorMessage, setRfErrorMessage] = useState('');
  const [rfSubmitting, setRfSubmitting] = useState(false);

  const openRefundModal = (o: AdminOrder) => {
    setRefundOrderTarget(o);
    const payable = Number(o.amountPaid ?? o.totalAmount ?? o.amount ?? 0);
    setRfAmount(payable);
    setRfFull(true);
    setRfReason('');
    setRfErrorMessage('');
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrderTarget) return;
    if (rfReason.trim().length < 5)
      return setRfErrorMessage('Refund reason must be at least 5 characters.');
    const amount = rfFull ? undefined : Math.max(0, Math.floor(Number(rfAmount)));
    setRfSubmitting(true);
    setRfErrorMessage('');
    try {
      const res = await refundOrder(refundOrderTarget.id, {
        refundType: rfFull ? 'full' : 'partial',
        amount,
        reason: rfReason.trim(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRfErrorMessage(json.error || 'Refund failed.');
        setRfSubmitting(false);
        return;
      }
      showBanner('success', `Refund of ${rfFull ? 'full amount' : `₹${amount}`} processed.`);
      setRefundOrderTarget(null);
      await loadOrders();
    } catch {
      setRfErrorMessage('Refund failed. Please try again.');
    } finally {
      setRfSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div>
          <h1 className="font-heading font-extrabold text-xl text-white">Orders & Bookings Dashboard</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Manage confirmed, refunded, and cancelled orders across all sales channels.
          </p>
          <div className="flex items-center gap-2 mt-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400">Live database view</span>
            <span className="text-gray-500 normal-case tracking-normal font-normal">
              {isRefreshing ? 'Refreshing…' : lastSyncedAt ? `Updated ${formatOrderDate(lastSyncedAt.toISOString())}` : 'Connecting…'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <button
            onClick={openCreateModal}
            className="py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Order</span>
          </button>

          <button
            onClick={handleExportFilteredCSV}
            className="py-2.5 px-4 rounded-2xl bg-[#222] hover:bg-[#333] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all flex-shrink-0"
          >
            <Download className="w-4 h-4 text-[#D4AF37]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Live Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-3xl bg-[#141414] border border-white/10">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total revenue</p>
          <p className="text-2xl font-heading font-extrabold text-white mt-2">₹{Number(summary.totalRevenue || 0).toLocaleString('en-IN')}</p>
          <p className="text-emerald-400 text-[10px] mt-1">From current filtered tickets</p>
        </div>
        <div className="p-5 rounded-3xl bg-[#141414] border border-white/10">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total discount</p>
          <p className="text-2xl font-heading font-extrabold text-white mt-2">₹{Number(summary.totalDiscount || 0).toLocaleString('en-IN')}</p>
          <p className="text-sky-400 text-[10px] mt-1">Savings given to customers</p>
        </div>
        <div className="p-5 rounded-3xl bg-[#141414] border border-white/10">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Current tickets</p>
          <p className="text-2xl font-heading font-extrabold text-white mt-2">{Number(summary.totalTickets || 0).toLocaleString('en-IN')}</p>
          <p className="text-gray-400 text-[10px] mt-1">{Number(summary.totalOrders || 0).toLocaleString('en-IN')} sales records</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-5 rounded-3xl bg-[#141414] border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-gray-400 text-[10px] font-black uppercase tracking-widest">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters &amp; Search</span>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket, customer, counter, issuer..."
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <select
            value={filterEventId}
            onChange={(e) => {
              setFilterEventId(e.target.value);
              setPage(1);
            }}
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="">All Events</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.title}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={filterChannel}
            onChange={(e) => {
              setFilterChannel(e.target.value);
              setPage(1);
            }}
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="">All Channels</option>
            <option value="online">Online</option>
            <option value="counter">Counter / Walk-In</option>
            <option value="manual">Manual (Admin)</option>
          </select>

          <input
            type="text"
            value={filterCounter}
            onChange={(e) => {
              setFilterCounter(e.target.value);
              setPage(1);
            }}
            placeholder="Counter name"
            aria-label="Filter by counter"
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          />

          <input
            type="text"
            value={filterIssuer}
            onChange={(e) => {
              setFilterIssuer(e.target.value);
              setPage(1);
            }}
            placeholder="Issued by"
            aria-label="Filter by issuer"
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          />

          <select
            value={discountStatus}
            onChange={(e) => {
              setDiscountStatus(e.target.value as 'all' | 'applied' | 'none');
              setPage(1);
            }}
            aria-label="Filter by discount status"
            className="bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="all">All discounts</option>
            <option value="applied">Discount applied</option>
            <option value="none">No discount</option>
          </select>

          <div className="flex gap-2 xl:col-span-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              placeholder="From"
              title="From date"
              className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              placeholder="To"
              title="To date"
              className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30">
            <span className="text-xs text-[#D4AF37] font-extrabold">
              {selectedIds.size} order(s) selected
            </span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleBulkAction('export')}
                className="py-2 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export Selected
              </button>
              <button
                onClick={() => {
                  const subject = prompt('Email subject:');
                  const message = prompt('Email message:');
                  if (subject === null || message === null) return;
                  handleBulkAction('email', { subject: subject.trim(), message: message.trim() });
                }}
                className="py-2 px-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center gap-1.5 border border-sky-500/30 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" /> Email Selected
              </button>
              <button
                onClick={() => handleBulkAction('cancel')}
                className="py-2 px-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center gap-1.5 border border-red-500/30 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" /> Cancel Selected
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectAll(false);
                }}
                className="py-2 px-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-xs cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="responsive-table-scroll bg-[#141414] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-[#1C1C1C] text-gray-400 uppercase font-bold text-[10px]">
            <tr>
              <th className="p-4 w-10">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="accent-[#D4AF37]"
                />
              </th>
              <th className="p-4">Sale</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Event</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Payment</th>
              <th className="p-4">Status</th>
              <th className="p-4">Created</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="p-10 text-center text-gray-500">
                  Loading orders...
                </td>
              </tr>
            ) : viewOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-gray-500">
                  No orders match the current filters.
                </td>
              </tr>
            ) : (
              viewOrders.map((o) => {
                const st = displayStatus(o);
                const payable = Number(o.amountPaid ?? o.totalAmount ?? o.amount ?? 0);
                const ref = Number(o.refundAmount ?? 0);
                const discount = Number(o.discountAmount ?? o.discount ?? 0);
                const issuer = o.issuedBySubUserName || o.issuedBy || (o.channel === 'online' ? 'Customer checkout' : 'Main counter staff');
                const counter = o.counterName || (o.channel === 'online' ? 'Online booking' : 'Counter not recorded');
                return (
                  <tr key={o.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="accent-[#D4AF37]"
                      />
                    </td>
                    <td className="p-4 min-w-[170px]">
                      <span className="font-bold text-white block">
                        {o.channelLabel || CHANNEL_LABEL[o.channel || 'online'] || 'Sale'}
                      </span>
                      <span className="text-gray-400 text-[10px] block">
                        {o.ticketNumber ? `Ticket ${o.ticketNumber}` : 'Ticket reference unavailable'}
                      </span>
                      <span className="text-gray-500 text-[10px] block mt-1">
                        Issued by: <span className="text-gray-300">{issuer}</span>
                      </span>
                      <span className="text-gray-500 text-[10px] block">
                        Counter: <span className="text-gray-300">{counter}</span>
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-white block">
                        {o.customerName || o.attendeeName || 'Customer name unavailable'}
                      </span>
                      <span className="text-gray-400 text-[10px] block">
                        {[o.customerPhone || o.attendeePhone, o.customerEmail || o.attendeeEmail]
                          .filter(Boolean)
                          .join(' · ') || 'Contact details unavailable'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-white block">
                        {o.eventTitle || o.eventName || 'Event name unavailable'}
                      </span>
                      <span className="text-gray-400 text-[10px] block">
                        {o.quantity || 1} ticket{(o.quantity || 1) === 1 ? '' : 's'}
                        {o.tierName ? ` · ${o.tierName}` : ''}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="block text-white font-bold">
                        {ref > 0 ? <s className="text-gray-500 text-[11px]">₹{payable.toLocaleString('en-IN')}</s> : `₹${payable.toLocaleString('en-IN')}`}
                        {ref > 0 && ` (-₹${ref.toLocaleString('en-IN')})`}
                      </span>
                      {o.amountDue && Number(o.amountDue) > 0 ? (
                        <span className="text-amber-400 text-[10px]">₹{Number(o.amountDue).toLocaleString('en-IN')} due</span>
                      ) : (
                        <span className="text-emerald-400 text-[10px]">Paid in full</span>
                      )}
                      <span className={`text-[10px] block mt-1 ${discount > 0 ? 'text-sky-400' : 'text-gray-500'}`}>
                        {discount > 0 ? `Discount: ₹${discount.toLocaleString('en-IN')} off` : 'No discount'}
                      </span>
                      {o.couponCode && <span className="text-gray-500 text-[10px] block">Coupon: {o.couponCode}</span>}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-gray-300 border border-white/10">
                        {o.paymentMethodLabel || 'Payment recorded'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          STATUS_STYLES[st] || STATUS_STYLES.pending
                        }`}
                      >
                        {st}
                      </span>
                    </td>
                    <td className="p-4 text-[11px] text-gray-400 whitespace-nowrap">
                      {formatOrderDate(o.createdAt)}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(o)}
                          className="p-2 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all cursor-pointer"
                          title="Edit Order"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDetailsOrder(o)}
                          className="p-2 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 transition-all cursor-pointer"
                          title="More details"
                          aria-label={`More details for ${o.ticketNumber || o.orderId || 'sale'}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openRefundModal(o)}
                          disabled={st === 'cancelled' || st === 'refunded'}
                          className="p-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Refund Order"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-white/10 text-xs text-gray-400">
            <span>
              Page {page} of {totalPages} · {totalCount} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Order Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#D4AF37]" />
                <span>Create Manual Order</span>
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {coErrorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{coErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
              <p className="text-gray-400 leading-relaxed">
                Creates an admin-assisted order with seat-locking protection. Available seat inventory is
                checked server-side; a coupon may also be attached at the counter.
              </p>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Event *</label>
                <select
                  required
                  value={coEventId}
                  onChange={(e) => setCoEventId(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="">Select an event...</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={coName}
                  onChange={(e) => setCoName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={coEmail}
                  onChange={(e) => setCoEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Phone (optional)</label>
                  <input
                    type="tel"
                    value={coPhone}
                    onChange={(e) => setCoPhone(e.target.value)}
                    placeholder="+91 ..."
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={coQuantity}
                    onChange={(e) => setCoQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Payment Method</label>
                <select
                  value={coPaymentMethod}
                  onChange={(e) => setCoPaymentMethod(e.target.value as any)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="cash">Cash at Counter</option>
                  <option value="card">Card at Counter</option>
                  <option value="upi">UPI at Counter</option>
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={coSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {coSubmitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#D4AF37]" />
                <span>Edit Order {editOrderTarget.orderId || editOrderTarget.id}</span>
              </h3>
              <button
                onClick={() => setEditOrderTarget(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {edErrorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{edErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleEditOrder} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/20 text-gray-300">
                <span className="font-bold text-white">Protected ticket:</span> {editOrderTarget.ticketNumber || 'Ticket reference unavailable'}
                <span className="block text-[10px] text-gray-500 mt-1">Ticket number, QR code, pass link, payment status, and audit history cannot be changed here.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Customer Name</label>
                  <input type="text" value={edName} onChange={(e) => setEdName(e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Phone</label>
                  <input type="tel" value={edPhone} onChange={(e) => setEdPhone(e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Email</label>
                <input type="email" value={edEmail} onChange={(e) => setEdEmail(e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Event</label>
                  <select value={edEventId} disabled className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-gray-400 focus:outline-none">
                    {events.filter((evt) => evt.id === edEventId).map((evt) => <option key={evt.id} value={evt.id}>{evt.title}</option>)}
                  </select>
                  <p className="text-[9px] text-gray-500 mt-1">Event changes require a replacement order.</p>
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Ticket Tier</label>
                  <select value={edTierId} onChange={(e) => setEdTierId(e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]">
                    {normalizeTiers(events.find((evt) => evt.id === edEventId)?.ticketTiers).map((tier, index) => <option key={tier.id || index} value={tier.id || ''}>{tier.name || `Tier ${index + 1}`} · ₹{Number(tier.price || 0).toLocaleString('en-IN')}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Quantity</label>
                  <input type="number" min={1} max={100} value={edQuantity} onChange={(e) => setEdQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Seat / Access</label>
                  <input type="text" value={edSeats} onChange={(e) => setEdSeats(e.target.value)} placeholder="Seat IDs separated by commas" className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Discount (₹)</label>
                  <input type="number" min={0} value={edDiscount} onChange={(e) => setEdDiscount(Math.max(0, Number(e.target.value) || 0))} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Coupon Code</label>
                  <input type="text" value={edCouponCode} onChange={(e) => setEdCouponCode(e.target.value)} placeholder="Optional" className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Payment Method</label>
                  <select value={edPaymentMethod} onChange={(e) => setEdPaymentMethod(e.target.value)} className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]">
                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Counter</label>
                  <input type="text" value={edCounterName} onChange={(e) => setEdCounterName(e.target.value)} placeholder="Counter name" className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Issued By</label>
                  <input type="text" value={edIssuer} onChange={(e) => setEdIssuer(e.target.value)} placeholder="Staff or sub-user" className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]" />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditOrderTarget(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={edSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {edSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {detailsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">Sale details</p>
                <h3 className="font-heading font-bold text-lg text-white mt-1">
                  {detailsOrder.customerName || detailsOrder.attendeeName || 'Customer'}
                </h3>
              </div>
              <button
                onClick={() => setDetailsOrder(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
                aria-label="Close sale details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Ticket</p>
                <p className="text-white font-bold">{detailsOrder.ticketNumber || 'Not linked'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Event</p>
                <p className="text-white font-bold">{detailsOrder.eventTitle || detailsOrder.eventName || 'Not available'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Issued by</p>
                <p className="text-white font-bold">{detailsOrder.issuedBySubUserName || detailsOrder.issuedBy || 'Main staff'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Counter</p>
                <p className="text-white font-bold">{detailsOrder.counterName || (detailsOrder.channel === 'online' ? 'Online booking' : 'Not recorded')}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Payment</p>
                <p className="text-white font-bold">{detailsOrder.paymentMethodLabel || 'Payment recorded'}</p>
                <p className="text-emerald-400 mt-1">{detailsOrder.paymentStatus || detailsOrder.status || 'Confirmed'}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-500 mb-1">Discount</p>
                <p className={Number(detailsOrder.discountAmount ?? detailsOrder.discount ?? 0) > 0 ? 'text-sky-400 font-bold' : 'text-gray-300 font-bold'}>
                  {Number(detailsOrder.discountAmount ?? detailsOrder.discount ?? 0) > 0
                    ? `₹${Number(detailsOrder.discountAmount ?? detailsOrder.discount).toLocaleString('en-IN')} off`
                    : 'No discount added'}
                </p>
                {detailsOrder.couponCode && <p className="text-gray-500 mt-1">Coupon: {detailsOrder.couponCode}</p>}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/20 text-xs space-y-2">
              <p className="text-gray-400"><span className="text-white font-bold">Quantity:</span> {detailsOrder.quantity || 1} ticket{(detailsOrder.quantity || 1) === 1 ? '' : 's'}</p>
              <p className="text-gray-400"><span className="text-white font-bold">Access:</span> {detailsOrder.tierName || 'General entry'}{detailsOrder.seatLabels?.length ? ` · ${detailsOrder.seatLabels.join(', ')}` : ''}</p>
              <p className="text-gray-400"><span className="text-white font-bold">Created:</span> {formatOrderDate(detailsOrder.createdAt)}</p>
            </div>

            <button
              type="button"
              onClick={() => void handleResendWhatsApp(detailsOrder)}
              disabled={resendingTicketId === detailsOrder.ticketId}
              className="w-full px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {resendingTicketId === detailsOrder.ticketId ? 'Sending WhatsApp message…' : 'Resend WhatsApp message'}
            </button>

            <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-gray-400">
              <summary className="cursor-pointer text-gray-300 font-bold">System references</summary>
              <div className="mt-3 space-y-1 font-mono text-[10px] break-all">
                <p>Order: {detailsOrder.orderId || detailsOrder.id || '—'}</p>
                <p>Booking: {detailsOrder.bookingId || '—'}</p>
                <p>Ticket record: {detailsOrder.ticketId || '—'}</p>
                <p>Shift: {detailsOrder.shiftId || '—'}</p>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-amber-400" />
                <span>Refund Order</span>
              </h3>
              <button
                onClick={() => setRefundOrderTarget(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {rfErrorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rfErrorMessage}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300 space-y-1">
              <p>
                <span className="font-bold text-white">Order:</span>{' '}
                {refundOrderTarget.orderId || refundOrderTarget.id}
              </p>
              <p>
                <span className="font-bold text-white">Customer:</span>{' '}
                {refundOrderTarget.customerName || refundOrderTarget.attendeeName}
              </p>
              <p>
                <span className="font-bold text-white">Paid:</span> ₹
                {Number(refundOrderTarget.amountPaid ?? refundOrderTarget.totalAmount ?? refundOrderTarget.amount ?? 0)}
              </p>
              <p className="text-amber-400 font-bold">
                Refunding releases the reserved seats back to sale.
              </p>
            </div>

            <form onSubmit={handleRefund} className="space-y-4 text-xs">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-gray-300">
                  <input
                    type="radio"
                    checked={rfFull}
                    onChange={() => setRfFull(true)}
                    className="accent-[#D4AF37]"
                  />
                  Full Refund
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-gray-300">
                  <input
                    type="radio"
                    checked={!rfFull}
                    onChange={() => setRfFull(false)}
                    className="accent-[#D4AF37]"
                  />
                  Partial Refund
                </label>
              </div>

              {!rfFull && (
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Refund Amount (₹)</label>
                  <input
                    type="number"
                    min={1}
                    max={Number(refundOrderTarget.amountPaid ?? refundOrderTarget.totalAmount ?? refundOrderTarget.amount ?? 0)}
                    value={rfAmount}
                    onChange={(e) => setRfAmount(Number(e.target.value))}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-gray-300 block mb-1">Refund Reason *</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={rfReason}
                  onChange={(e) => setRfReason(e.target.value)}
                  placeholder="Reason for the refund (min 5 characters)"
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3.5 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setRefundOrderTarget(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rfSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-200 to-amber-500 text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {rfSubmitting ? 'Processing...' : 'Process Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
