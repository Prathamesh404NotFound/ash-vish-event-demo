import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, Calendar, Edit3, Trash2, Send, CheckCircle, XCircle, 
  Download, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, X 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBooking } from '../../contexts/BookingContext';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

interface Ticket {
  id: string;
  ticketNumber: string;
  eventId: string;
  eventTitle: string;
  tierName: string;
  price: number;
  quantity: number;
  totalPaid: number;
  seatNumber?: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  status: 'valid' | 'redeemed' | 'cancelled';
  purchasedAt: string;
  cancelledReason?: string;
}

interface Summary {
  count: number;
  amount: number;
}

export const MySalesPage: React.FC = () => {
  const { user, firebaseUser, isAuthenticated } = useAuth();
  const { events } = useBooking();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>({ count: 0, amount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  // Modals / Actions State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '' });
  const [voidingTicket, setVoidingTicket] = useState<Ticket | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isAuthenticated) throw new Error("Not authenticated. Please log in again.");

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        dateRange: selectedDateRange,
      });

      if (selectedEventId) params.append('eventId', selectedEventId);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/counter/my-sales?${params.toString()}`, {
        headers: await authenticatedApiHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setTickets(data.tickets || []);
        setTotal(data.total || 0);
        setSummary(data.summary || { count: 0, amount: 0 });
      } else {
        setError(data.error || "Failed to load sales data.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching sales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [selectedEventId, selectedStatus, selectedDateRange, page, searchQuery]);

  const handleToggleCheckIn = async (ticket: Ticket) => {
    setActionLoading(ticket.id);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/counter/tickets/${ticket.id}/toggle-checkin`, {
        method: 'POST',
        headers: await authenticatedApiHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Ticket check-in status updated successfully.`);
        fetchSales();
      } else {
        alert(data.error || "Failed to toggle check-in.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenEditModal = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setEditForm({
      name: ticket.attendeeName,
      phone: ticket.attendeePhone || '',
      email: ticket.attendeeEmail || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    if (!editForm.name.trim()) {
      alert("Attendee name is required.");
      return;
    }

    setActionLoading('edit');
    try {
      const res = await fetch(`/api/counter/tickets/${editingTicket.id}/edit-attendee`, {
        method: 'POST',
        headers: {
          ...(await authenticatedApiHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attendeeName: editForm.name,
          attendeePhone: editForm.phone,
          attendeeEmail: editForm.email
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Attendee details updated successfully.");
        setEditingTicket(null);
        fetchSales();
      } else {
        alert(data.error || "Failed to edit attendee.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingTicket) return;
    if (voidReason.trim().length < 5) {
      alert("Void reason must be at least 5 characters long.");
      return;
    }

    setActionLoading('void');
    try {
      const res = await fetch(`/api/counter/tickets/${voidingTicket.id}/void`, {
        method: 'POST',
        headers: {
          ...(await authenticatedApiHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: voidReason })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Ticket voided successfully. Associated seats have been released.");
        setVoidingTicket(null);
        setVoidReason('');
        fetchSales();
      } else {
        alert(data.error || "Failed to void ticket.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendWhatsApp = async (ticket: Ticket) => {
    setActionLoading(`wa-${ticket.id}`);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/counter/tickets/${ticket.id}/resend-whatsapp`, {
        method: 'POST',
        headers: await authenticatedApiHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("WhatsApp ticket pass resent successfully.");
      } else {
        alert(data.error || "Failed to resend WhatsApp pass.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCSV = () => {
    if (tickets.length === 0) {
      alert("No data available to export.");
      return;
    }

    // Standard CSV compiling
    const headers = ["Ticket Number", "Event", "Tier", "Seats", "Attendee", "Phone", "Email", "Total Paid", "Status", "Date"];
    const rows = tickets.map(t => [
      t.ticketNumber,
      t.eventTitle,
      t.tierName,
      t.seatNumber || 'General Admission',
      t.attendeeName,
      t.attendeePhone || '',
      t.attendeeEmail || '',
      `₹${t.totalPaid}`,
      t.status,
      new Date(t.purchasedAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MySales_Export_${selectedDateRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="my-sales-panel">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            My Ticket Sales Log
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Track and manage walk-in sales credited to your terminal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSales}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black text-xs font-bold transition-all shadow-md shadow-[#D4AF37]/10"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Strip (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tickets Issued</p>
            <h3 className="text-2xl font-black text-white mt-1.5">{summary.count}</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">In selected period</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#D4AF37]">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Sales Cash/UPI</p>
            <h3 className="text-2xl font-black text-[#D4AF37] mt-1.5">₹{summary.amount.toLocaleString()}</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">Terminal credit total</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
            <span className="font-bold text-sm">₹</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Operator</p>
            <h3 className="text-lg font-bold text-white truncate mt-1.5">{user?.name || user?.email || 'Counter Staff'}</h3>
            <span className="inline-flex items-center gap-1.5 text-[9px] text-[#D4AF37] uppercase tracking-wider font-semibold mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Logged In
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400/70 hover:text-emerald-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters Strip */}
      <div className="p-4 rounded-2xl bg-[#121212] border border-white/10 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search attendee, phone, ticket..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 outline-none transition-all"
            />
          </div>

          {/* Event Filter */}
          <div className="relative">
            <select
              value={selectedEventId}
              onChange={(e) => { setSelectedEventId(e.target.value); setPage(1); }}
              className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3 text-xs text-white outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="">All Events</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.title}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
              className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3 text-xs text-white outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="valid">Valid / Unused</option>
              <option value="redeemed">Redeemed / Checked In</option>
              <option value="cancelled">Void / Cancelled</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="relative">
            <select
              value={selectedDateRange}
              onChange={(e) => { setSelectedDateRange(e.target.value); setPage(1); }}
              className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3 text-xs text-white outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="today">Today's Sales</option>
              <option value="7-day">Last 7 Days</option>
              <option value="30-day">Last 30 Days</option>
              <option value="all-time">All-Time Sales</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid / Log Table */}
      <div className="bg-[#121212] border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
            <p className="text-xs">Fetching personal sales log...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-400 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-xs font-bold">{error}</p>
            <button 
              onClick={fetchSales}
              className="mt-3 px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold"
            >
              Try Again
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-gray-600" />
            <p className="text-xs font-bold">No sales records found</p>
            <p className="text-[10px] text-gray-600 max-w-sm">
              We couldn't find any walk-in ticket sales corresponding to your staff account for this filter set.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ticket / Date</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Event Details</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Attendee Info</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.01] transition-all">
                    <td className="p-4">
                      <p className="text-xs font-mono font-bold text-[#D4AF37]">{t.ticketNumber}</p>
                      <span className="text-[10px] text-gray-500 mt-1 block">
                        {new Date(t.purchasedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-bold text-white truncate max-w-[180px]">{t.eventTitle}</p>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        {t.tierName} {t.seatNumber ? `• Seat ${t.seatNumber}` : '• Gen Adm'}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-bold text-white">{t.attendeeName}</p>
                      <span className="text-[10px] text-gray-500 mt-0.5 block">{t.attendeePhone || 'No phone'}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-extrabold text-[#D4AF37]">₹{t.totalPaid}</span>
                    </td>
                    <td className="p-4">
                      {t.status === 'valid' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          Valid / Unused
                        </span>
                      )}
                      {t.status === 'redeemed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Checked In
                        </span>
                      )}
                      {t.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold" title={t.cancelledReason}>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Toggle Check In */}
                        {t.status !== 'cancelled' && (
                          <button
                            onClick={() => handleToggleCheckIn(t)}
                            disabled={actionLoading !== null}
                            className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all ${
                              t.status === 'redeemed' 
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' 
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
                            title={t.status === 'redeemed' ? "Undo check-in" : "Mark as checked in"}
                          >
                            {actionLoading === t.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : t.status === 'redeemed' ? (
                              <span>Undo In</span>
                            ) : (
                              <span>Check In</span>
                            )}
                          </button>
                        )}

                        {/* Edit details */}
                        {t.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOpenEditModal(t)}
                            disabled={actionLoading !== null}
                            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                            title="Edit Attendee Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* WhatsApp Resend */}
                        {t.status !== 'cancelled' && t.attendeePhone && (
                          <button
                            onClick={() => handleResendWhatsApp(t)}
                            disabled={actionLoading !== null}
                            className="p-1.5 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-all"
                            title="Resend Pass over WhatsApp"
                          >
                            {actionLoading === `wa-${t.id}` ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Void Ticket */}
                        {t.status !== 'cancelled' && (
                          <button
                            onClick={() => setVoidingTicket(t)}
                            disabled={actionLoading !== null}
                            className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                            title="Void Ticket"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {total > pageSize && (
          <div className="p-4 border-t border-white/10 flex items-center justify-between bg-white/[0.01]">
            <span className="text-[11px] text-gray-400">
              Showing <span className="font-bold text-white">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-white">{Math.min(page * pageSize, total)}</span> of{' '}
              <span className="font-bold text-white">{total}</span> records
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-white px-2">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * pageSize >= total}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingTicket && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h3 className="font-heading font-extrabold text-sm text-white">Edit Attendee Details</h3>
              <button onClick={() => setEditingTicket(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Attendee Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3.5 text-xs text-white outline-none transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3.5 text-xs text-white outline-none transition-all"
                  placeholder="919876543210"
                />
                <p className="text-[9px] text-gray-500">Must include country code (e.g. 91 for India) without '+' or spaces.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-[#1A1A1A] border border-white/10 focus:border-[#D4AF37]/50 rounded-xl py-2 px-3.5 text-xs text-white outline-none transition-all"
                  placeholder="john@example.com"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'edit'}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black text-xs font-bold shadow-md"
                >
                  {actionLoading === 'edit' ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID CONFIRMATION MODAL */}
      {voidingTicket && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#121212] border border-red-500/20 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-red-500/10 flex items-center justify-between bg-red-500/[0.02]">
              <h3 className="font-heading font-extrabold text-sm text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>Void Ticket {voidingTicket.ticketNumber}</span>
              </h3>
              <button onClick={() => setVoidingTicket(null)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleVoidTicket} className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/15 text-red-400 text-xs leading-relaxed">
                <strong>CRITICAL WARNING:</strong> Voiding this ticket will permanently invalidate the digital pass and fully refund/void the associated RTDB order record. If this was a seated ticket, the seat reservation will be released immediately.
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Reason for Voiding *</label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Enter reason (e.g. Counter reprint error, incorrect seat selected, cash dispute)"
                  className="w-full bg-[#1A1A1A] border border-white/10 focus:border-red-500/40 rounded-xl py-2 px-3.5 text-xs text-white outline-none transition-all placeholder-gray-600 resize-none"
                />
                <p className="text-[9px] text-gray-500">Minimum 5 characters required.</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidingTicket(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'void' || voidReason.trim().length < 5}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-red-600/10"
                >
                  {actionLoading === 'void' ? "Voiding..." : "Void Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
