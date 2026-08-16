import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserPlus, Ticket, CheckCircle2, DollarSign, Phone, User, Calendar, ArrowRight, Printer, Search, CreditCard, QrCode, Armchair, AlertCircle, WifiOff, Plus, Minus, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { Ticket as TicketType } from '../../types';
import { SeatMap } from '../../components/SeatMap';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';

type PaymentEntry = { method: 'cash' | 'card' | 'upi'; amount: number };
type ConnectionState = 'online' | 'lost' | 'retrying';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: DollarSign, color: '#D4AF37' },
  { key: 'card', label: 'Card Terminal', icon: CreditCard, color: '#38bdf8' },
  { key: 'upi', label: 'UPI', icon: QrCode, color: '#34d399' },
] as const;

export const WalkInPage: React.FC = () => {
  const { events, createWalkInBooking } = useBooking();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedTierId, setSelectedTierId] = useState(events[0]?.ticketTiers[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const [attendeeName, setAttendeeName] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<TicketType | null>(null);
  const [seatRefreshKey, setSeatRefreshKey] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>('online');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [seatSearch, setSeatSearch] = useState('');
  const [searchError, setSearchError] = useState('');

  // Manager-gated discount override state.
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [overrideApproved, setOverrideApproved] = useState<{ actorId: string; actorName: string; amount: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverrideLoading, setIsOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const isApprover = (user as any)?.rbacRole === 'super_admin' || (user as any)?.rbacRole === 'event_manager';

  // Active staff shift attribution.
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);

  const seatSearchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Counter staff only sell for live (published + not scheduled-hidden) events.
  const isEventVisible = (e: any) =>
    (e.status === 'published' || e.status === 'sold_out') &&
    e.isEventPublic !== false;

  const filteredEvents = events.filter((e) => isEventVisible(e) && (
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.city.toLowerCase().includes(searchQuery.toLowerCase())
  ));

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const selectedTier = selectedEvent?.ticketTiers.find((t) => t.id === selectedTierId) || selectedEvent?.ticketTiers[0];

  // --- Real-time seat map refresh (every 5 seconds while the event has a seat map) ---
  useEffect(() => {
    if (!selectedEvent?.seatMap) return;
    const interval = window.setInterval(() => {
      setSeatRefreshKey((k) => k + 1);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedEvent?.seatMap, selectedEvent?.id]);

  // --- Load any open shift for attribution ---
  useEffect(() => {
    let cancelled = false;
    const loadShifts = async () => {
      try {
        const res = await safeFetch<any>('/api/counter/shifts', { headers: await authenticatedApiHeaders() });
        if (cancelled || !res.ok) return;
        const openShift = (res.data?.shifts || []).find((s: any) => s.status === 'open' && (!s.staffId || s.staffId === user?.uid));
        setActiveShiftId(openShift ? openShift.shiftId : null);
      } catch {
        /* shift loading is best-effort — never blocks the sale flow */
      } finally {
        if (!cancelled) setShiftsLoaded(true);
      }
    };
    loadShifts();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const grossTotal = (selectedTier?.price || 0) * (selectedSeats.length > 0 ? selectedSeats.length : quantity);
  const paymentsSum = payments.reduce((acc, p) => acc + p.amount, 0);
  const netTotal = Math.max(0, grossTotal - discountAmount);
  const paymentsValid = payments.length > 0 && Math.abs(paymentsSum - netTotal) < 0.01 && payments.every((p) => p.amount > 0);

  const refreshSeats = useCallback(() => {
    setSeatRefreshKey((k) => k + 1);
  }, []);

  // --- Quick seat search: jump to a seat by label (e.g. "A-5") ---
  const handleSeatSearch = (value: string) => {
    setSeatSearch(value);
    setSearchError('');
    const match = /^([A-Za-z])-?(\d{1,2})$/i.exec(value.trim());
    if (!match || !selectedEvent?.seatMap) return;
    const row = match[1].toUpperCase().charCodeAt(0) - 64;
    const col = parseInt(match[2], 10);
    if (row < 1 || col < 1 || col > (selectedEvent.seatMap.cols || 8)) {
      setSearchError('That seat does not exist on this map.');
      return;
    }
    const seatId = `R${row}-C${col}`;
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) return prev;
      if (prev.length >= quantity) {
        setSearchError(`Already holding ${quantity} seat(s). Deselect one first or increase the quantity.`);
        return prev;
      }
      return [...prev, seatId];
    });
  };

  // --- Keyboard shortcuts for POS use ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        seatSearchInputRef.current?.focus();
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        confirmButtonRef.current?.click();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Split payment helpers ---
  const updatePayment = (index: number, patch: Partial<PaymentEntry>) => {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const addPaymentRow = () => {
    setPayments((prev) => [...prev, { method: 'cash', amount: 0 }]);
  };
  const removePaymentRow = (index: number) => {
    setPayments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ method: 'cash', amount: 0 }];
    });
  };
  const autofillRemaining = (index: number) => {
    const other = payments.reduce((acc, p, i) => (i === index ? acc : acc + p.amount), 0);
    updatePayment(index, { amount: Math.max(0, Math.round((netTotal - other) * 100) / 100) });
  };

  // --- Manager-gated discount override ---
  const handleRequestOverride = async () => {
    if (!selectedEvent || netTotal <= 0) return;
    setIsOverrideLoading(true);
    setOverrideError('');
    try {
      const res = await safeFetch<any>('/api/counter/discount-override', {
        method: 'POST',
        headers: await authenticatedApiHeaders(),
        body: JSON.stringify({
          eventId: selectedEvent.id,
          orderAmount: grossTotal,
          discountPercent: 0,
          discountAmount: Math.round(discountAmount),
          reason: overrideReason.trim() || 'Counter discount override',
        }),
      });
      if (!res.ok || !res.data?.success) {
        setOverrideError(res.data?.error || 'Manager approval failed. Ask an event manager to log in and approve.');
        setOverrideApproved(null);
        return;
      }
      setOverrideApproved({
        actorId: res.data.discountOverride.actorId,
        actorName: res.data.discountOverride.actorName,
        amount: res.data.discountOverride.discountAmount,
      });
    } catch {
      setOverrideError('Connection lost while requesting approval. Please retry.');
    } finally {
      setIsOverrideLoading(false);
    }
  };

  const handleIssueWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    if (!attendeeName.trim() || !attendeePhone.trim()) return;

    if (selectedEvent?.seatMap && selectedSeats.length === 0) {
      setErrorBanner('Please select seats on the seat map for this walk-in booking.');
      return;
    }
    if (!paymentsValid) {
      setErrorBanner(`Payment amounts must sum to the order total (₹${netTotal}). Currently ₹${paymentsSum}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const ticket = await createWalkInBooking(
        selectedEventId,
        selectedTierId,
        attendeeName,
        attendeePhone,
        user?.name || 'Counter Operator',
        selectedSeats.length > 0 ? selectedSeats : undefined,
        payments[0]?.method || 'cash',
        { payments, discountOverride: overrideApproved ? { overrideId: `${Date.now()}`, discountAmount: overrideApproved.amount, actorId: overrideApproved.actorId, reason: overrideReason.trim() } : undefined, shiftId: activeShiftId || undefined }
      );
      setIssuedTicket(ticket);
      setConnection('online');
    } catch (err: any) {
      console.error('Walk-in ticket issue error:', err);
      // Network or server failure after seats were locked: holds still expire per
      // the 10-minute TTL, and the UI must show a clear, specific error state.
      if (!navigator.onLine || /network|fetch/i.test(String(err?.message || ''))) {
        setConnection('lost');
        setErrorBanner('Connection lost — the seat was not sold. Your held seats will release automatically after 10 minutes. Please retry when you are back online.');
      } else {
        setErrorBanner(err?.message || 'The sale could not be completed. The seats were not sold — please retry.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIssuedTicket(null);
    setAttendeeName('');
    setAttendeePhone('');
    setSelectedSeats([]);
    setSeatSearch('');
    setPayments([{ method: 'cash', amount: 0 }]);
    setDiscountAmount(0);
    setOverrideApproved(null);
    setOverrideReason('');
    setOverrideError('');
    setErrorBanner('');
    refreshSeats();
    seatSearchInputRef.current?.focus();
  };

  // When online status changes, clear the connection-lost banner.
  useEffect(() => {
    const onOnline = () => { setConnection('online'); setErrorBanner(''); };
    const onOffline = () => setConnection('lost');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 rounded-3xl bg-[#141414] border border-white/10">
        <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
          <UserPlus className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-heading font-extrabold text-xl text-white">Counter Walk-In Ticket Issuance</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Issue physical passes & live seat reservations directly for walk-in guests with cash, card, or UPI.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${
            connection === 'online'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>
            <WifiOff className="w-3 h-3" />
            {connection === 'online' ? 'Connected' : 'Connection lost'}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            F: seat search • C: confirm • N: new sale
          </span>
        </div>
      </div>

      {issuedTicket ? (
        /* Success Issued Ticket Card */
        <div className="p-8 rounded-3xl bg-gradient-to-br from-[#1C1C1C] via-[#141414] to-[#0E0E0E] border border-emerald-500/40 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
              Walk-In Booking Confirmed & Locked
            </span>
            <h2 className="font-heading font-extrabold text-2xl text-white mt-3">
              Ticket #{issuedTicket.ticketNumber}
            </h2>
            <p className="text-gray-400 text-xs mt-1">
              Issued for <strong className="text-white">{issuedTicket.attendeeName}</strong> ({issuedTicket.attendeePhone})
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl bg-black/60 border border-white/10 text-left space-y-2 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Event:</span>
              <span className="font-semibold text-white">{issuedTicket.eventTitle}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Tier / Category:</span>
              <span className="font-bold text-[#D4AF37]">{issuedTicket.tierName}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Seats:</span>
              <span className="font-bold text-white">{issuedTicket.seatNumber}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Payment Received:</span>
              <span className="font-bold text-emerald-400">
                ₹{issuedTicket.totalPaid}{payments.length > 1 ? ` (split across ${payments.length} methods)` : ` (${payments[0]?.method.toUpperCase()})`}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Manager Discount:</span>
                <span className="font-bold text-emerald-400">− ₹{discountAmount}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-400 pt-2 border-t border-white/10">
              <span>QR Security Payload:</span>
              <span className="font-mono text-[10px] text-gray-300 truncate max-w-[180px]">{issuedTicket.qrCodeValue}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => window.print()}
              className="py-3 px-6 rounded-xl bg-[#222] hover:bg-[#333] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>Print Gate Receipt</span>
            </button>
            <button
              onClick={handleReset}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/25 cursor-pointer"
            >
              <span>Issue Next Walk-In Ticket</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      ) : (
        /* Booking Form */
        <form onSubmit={handleIssueWalkIn} className="p-6 md:p-8 rounded-3xl bg-[#141414] border border-white/10 space-y-6">
          {(errorBanner || connection === 'lost') && (
            <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
              connection === 'lost'
                ? 'bg-red-500/10 border-red-500/40 text-red-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
            }`}>
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                {connection === 'lost' ? (
                  <span><strong>Connection lost — seat was not sold.</strong> Please retry when you are back online. Held seats release automatically after 10 minutes.</span>
                ) : (
                  <span>{errorBanner}</span>
                )}
                {connection === 'lost' && (
                  <button
                    type="button"
                    onClick={() => { setConnection('retrying'); setErrorBanner(''); }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 font-bold hover:bg-red-500/30 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry connection
                  </button>
                )}
              </div>
            </div>
          )}

          {activeShiftId && (
            <div className="px-3 py-2 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/20 text-[11px] text-[#F3E5AB] flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              This sale is attributed to your open shift (cash reconciliation will include it).
            </div>
          )}

          {/* 1. Search & Select Event */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
              1. Select Event
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter events by title or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>

            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedSeats([]);
                setSeatSearch('');
                const evt = events.find((item) => item.id === e.target.value);
                if (evt && evt.ticketTiers[0]) {
                  setSelectedTierId(evt.ticketTiers[0].id);
                }
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white font-semibold text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
            >
              {filteredEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title} ({evt.city} • {evt.date})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Select Tier & Quantity */}
          {selectedEvent && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                2. Select Ticket Category
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {selectedEvent.ticketTiers.map((tier) => (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => {
                      setSelectedTierId(tier.id);
                      setSelectedSeats([]);
                      setSeatSearch('');
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedTierId === tier.id
                        ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-white shadow-lg'
                        : 'bg-[#1C1C1C] border-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <span className="block font-bold text-sm text-white">{tier.name}</span>
                    <span className="font-heading font-extrabold text-base text-[#D4AF37] mt-1 block">
                      ₹{tier.price}
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      {tier.remainingInventory} passes remaining
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Seat Map Selection (If Event has SeatMap) */}
          {selectedEvent?.seatMap ? (
            <div className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                  <Armchair className="w-4 h-4" />
                  <span>3. Interactive Counter Seat Map</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400">Quantity:</span>
                  <select
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(Number(e.target.value));
                      setSelectedSeats([]);
                      setSeatSearch('');
                    }}
                    className="bg-[#1C1C1C] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>{n} seat{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick seat search (barcode-scanner / keyboard friendly) */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    ref={seatSearchInputRef}
                    type="text"
                    placeholder='Quick seat lookup — type "A-5" and press Enter...'
                    value={seatSearch}
                    onChange={(e) => handleSeatSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={refreshSeats}
                  className="px-3.5 py-3 rounded-xl bg-[#222] border border-white/10 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-white transition-all flex items-center gap-1.5 shrink-0"
                  title="Refresh seat availability now"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>
              {searchError && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {searchError}
                </p>
              )}

              <SeatMap
                key={seatRefreshKey}
                eventId={selectedEvent.id}
                seatMapConfig={selectedEvent.seatMap}
                requiredQuantity={quantity}
                selectedSeatIds={selectedSeats}
                onSeatsSelected={(seatIds) => setSelectedSeats(seatIds)}
                currentUserId={`counter_${user?.uid || 'staff'}`}
                ticketTiers={selectedEvent.ticketTiers}
                eventDate={selectedEvent.date}
                eventTime={selectedEvent.time}
                onReservationError={(msg) => setErrorBanner(msg)}
              />
            </div>
          ) : (
            /* General Admission Quantity Selector */
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                3. Pass Quantity
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37]"
                >
                  -
                </button>
                <span className="text-white font-extrabold text-lg">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37]"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* 4. Attendee Contact Info */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
              4. Customer Details (Walk-In)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <input
                  type="text"
                  required
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="Guest Full Name *"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
                />
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>

              <div className="relative">
                <input
                  type="tel"
                  required
                  value={attendeePhone}
                  onChange={(e) => setAttendeePhone(e.target.value)}
                  placeholder="Guest Mobile Number *"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
                />
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* 5. Payment Method(s) with split-payment support */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                5. Payment Method Received
              </label>
              <span className="text-[10px] text-gray-500">Split across multiple methods if needed</span>
            </div>

            {payments.map((payment, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  {PAYMENT_METHODS.map((m) => (
                    <label
                      key={m.key}
                      className={`flex items-center justify-center gap-1.5 text-[11px] font-bold py-3 px-2 rounded-xl border cursor-pointer transition-all ${
                        payment.method === m.key
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-lg'
                          : 'bg-[#1C1C1C] border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`payment-${index}`}
                        checked={payment.method === m.key}
                        onChange={() => updatePayment(index, { method: m.key })}
                        className="hidden"
                      />
                      <m.icon className="w-3.5 h-3.5" style={{ color: m.color }} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-500 text-sm">₹</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payment.amount || ''}
                    onChange={(e) => updatePayment(index, { amount: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-24 px-3 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    onClick={() => autofillRemaining(index)}
                    className="px-2.5 py-3 rounded-xl bg-[#222] border border-white/10 text-gray-400 text-[10px] font-bold hover:border-[#D4AF37] hover:text-white transition-all"
                    title="Fill with remaining balance"
                  >
                    Fill
                  </button>
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePaymentRow(index)}
                      className="w-10 h-10 rounded-xl bg-[#1C1C1C] border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={addPaymentRow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#222] border border-white/10 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-white transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Add payment method
              </button>
              <div className={`text-xs font-bold flex items-center gap-2 ${
                paymentsValid ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                <span className="text-gray-500">Paid: ₹{paymentsSum.toFixed(2)}</span>
                <span>/</span>
                <span>Due: ₹{netTotal.toFixed(2)}</span>
                {paymentsValid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
            </div>
          </div>

          {/* 6. Manager-gated discount override (only for managers) */}
          {isApprover && (
            <div className="space-y-3 p-4 rounded-2xl bg-[#D4AF37]/5 border border-[#D4AF37]/25">
              <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                6. Manager Discount Override
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1">Discount Amount (₹)</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    disabled={!!overrideApproved}
                    value={discountAmount || ''}
                    onChange={(e) => {
                      setDiscountAmount(Number(e.target.value) || 0);
                      setOverrideApproved(null);
                    }}
                    placeholder="0"
                    className="w-full px-3 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1">Reason</span>
                  <input
                    type="text"
                    disabled={!!overrideApproved}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. VIP guest courtesy"
                    className="w-full px-3 py-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={isOverrideLoading || discountAmount <= 0 || grossTotal <= 0 || netTotal <= 0}
                    onClick={handleRequestOverride}
                    className="w-full py-3 rounded-xl bg-[#222] hover:bg-[#333] disabled:opacity-50 border border-[#D4AF37]/40 text-[#D4AF37] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isOverrideLoading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Approving...</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4" /> Approve Discount</>
                    )}
                  </button>
                </div>
              </div>
              {overrideError && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {overrideError}
                </p>
              )}
              {overrideApproved && (
                <p className="text-emerald-400 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approved by {overrideApproved.actorName} — ₹{overrideApproved.amount} off (audited).
                </p>
              )}
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs text-gray-400 block">Total Due{discountAmount > 0 ? ' (after discount)' : ''}:</span>
              <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                ₹{netTotal}
              </span>
              {grossTotal > netTotal && (
                <span className="text-[10px] text-emerald-400 block">₹{grossTotal} − ₹{discountAmount} discount</span>
              )}
            </div>

            <button
              ref={confirmButtonRef}
              type="submit"
              disabled={isSubmitting || !attendeeName || !attendeePhone || (selectedEvent?.seatMap && selectedSeats.length === 0) || !paymentsValid}
              className="py-3.5 px-8 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-sm shadow-lg shadow-[#D4AF37]/25 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Processing Booking...' : 'Confirm Walk-In Pass'}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
