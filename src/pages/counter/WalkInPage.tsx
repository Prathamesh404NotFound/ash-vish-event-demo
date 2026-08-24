import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus,
  CheckCircle2,
  DollarSign,
  Phone,
  User,
  ArrowRight,
  Printer,
  Search,
  CreditCard,
  QrCode,
  Armchair,
  AlertCircle,
  WifiOff,
  Plus,
  Minus,
  Layers,
  X,
  AlertTriangle,
  Clock,
  RefreshCw,
  ShieldCheck,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  Settings2,
  KeyRound,
  MessageSquareCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useBooking } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { Ticket as TicketType } from '../../types';
import { clearStoredActiveShift, readStoredActiveShift, writeStoredActiveShift } from '../../lib/counterSession';
import { SeatMap } from '../../components/SeatMap';
import { sendTicketToWhatsApp } from '../../utils/whatsapp';
import { passUrl } from '../../utils/passLink';
import { safeFetch } from '../../lib/api';
import { isSeatBasedEvent } from '../../lib/seatMap';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import {
  QueuedWalkInSale,
  enqueueOfflineSale,
  getQueuedSales,
  removeQueuedSale,
  syncOfflineWalkInQueue,
} from '../../lib/offlineQueue';
import {
  buildUpiPayUri,
  formatRupee,
  isValidVpa,
  validateUpiParam,
} from '../../lib/upiQr';

type PaymentEntry = { method: 'cash' | 'card' | 'upi'; amount: number };
type ConnectionState = 'online' | 'lost' | 'retrying';
type UpiFlowState = 'none' | 'awaiting' | 'received';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: DollarSign, color: '#D4AF37' },
  { key: 'card', label: 'Card', icon: CreditCard, color: '#38bdf8' },
  { key: 'upi', label: 'UPI', icon: QrCode, color: '#34d399' },
] as const;

const MEMORY_KEY = 'walkin_pos_last_selection';

interface PosMemory {
  eventId?: string;
  tierId?: string;
}

const readMemory = (): PosMemory => {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const WalkInPage: React.FC = () => {
  const { events, createWalkInBooking } = useBooking();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ---------- Selection ----------
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(() => {
    const memory = readMemory();
    return memory.eventId || events[0]?.id || '';
  });
  const [selectedTierId, setSelectedTierId] = useState(() => {
    const memory = readMemory();
    return memory.tierId || events[0]?.ticketTiers?.[0]?.id || '';
  });
  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  // ---------- Customer ----------
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');

  // ---------- Payment ----------
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [showSplit, setShowSplit] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: 0 }]);
  const [verifiedUpiRows, setVerifiedUpiRows] = useState<Record<number, boolean>>({});
  const [upiFlow, setUpiFlow] = useState<UpiFlowState>('none');
  const [upiConfig, setUpiConfig] = useState<{ vpa: string; name: string } | null>(null);
  const [upiError, setUpiError] = useState('');

  // ---------- Ticket counter station picker ----------
  const COUNTER_MEMORY_KEY = 'walkin_pos_last_counter';
  interface WalkInCounter {
    id: string;
    name: string;
    venue: string;
    status: 'active' | 'inactive';
    merchantUpi: { vpa: string; name: string };
    assignedStaffIds: string[];
  }
  const [counters, setCounters] = useState<WalkInCounter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>(() => {
    try {
      return localStorage.getItem(COUNTER_MEMORY_KEY) || '';
    } catch {
      return '';
    }
  });

  // ---------- General ----------
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<TicketType | null>(null);
  const [seatRefreshKey, setSeatRefreshKey] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>('online');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [seatSearch, setSeatSearch] = useState('');
  const [searchError, setSearchError] = useState('');
  const [formError, setFormError] = useState('');
  const [showUpiSettings, setShowUpiSettings] = useState(false);
  const [newVpa, setNewVpa] = useState('');
  const [newName, setNewName] = useState('');
  const [isSavingVpa, setIsSavingVpa] = useState(false);

  // Client-side idempotency key generated once per sale attempt
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  // Offline queue state
  const [queuedSales, setQueuedSales] = useState<QueuedWalkInSale[]>([]);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [offlineToast, setOfflineToast] = useState<string>('');

  // Stale snapshot tracking for offline seat map
  const [lastLiveRefresh, setLastLiveRefresh] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  // Manager-gated discount override state.
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [overrideApproved, setOverrideApproved] = useState<{ actorId: string; actorName: string; amount: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverrideLoading, setIsOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  // The frontend user profile exposes the legacy Firebase role
  // ('admin' / 'ticket_counter' / 'organizer' / 'customer'); the RBAC
  // hierarchy (super_admin, event_manager, ...) is enforced server-side via
  // requireRole, so gating UI here to the legacy 'admin' role keeps the
  // settings visible for every staff member who manages the counter.
  const userRole: string = (user as any)?.role || '';
  const userRbac: string = (user as any)?.rbacRole || '';
  const isApprover = userRole === 'admin' || ['super_admin', 'event_manager'].includes(userRbac);

  // Active staff shift attribution.
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [activeSubUser, setActiveSubUser] = useState<{ id: string; name: string } | null>(null);

  const seatSearchInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Counter staff only sell for live (published + not scheduled-hidden) events.
  const isEventVisible = (e: any) =>
    (e.status === 'published' || e.status === 'sold_out') &&
    e.isEventPublic !== false;

  const filteredEvents = events.filter((e) => isEventVisible(e) && (
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.city.toLowerCase().includes(searchQuery.toLowerCase())
  ));

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const selectedEventTiers = selectedEvent?.ticketTiers || [];
  const selectedTier = selectedEventTiers.find((t) => t.id === selectedTierId) || selectedEventTiers[0];

  // Remember the last event + tier for fast repeat issuance.
  useEffect(() => {
    if (selectedEvent && selectedTier) {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ eventId: selectedEvent.id, tierId: selectedTier.id }));
    }
  }, [selectedEvent?.id, selectedTier?.id]);

  // ---------- Quantity helpers ----------
  const maxQuantity = 10;
  const remainingForTier = Math.max(0, selectedTier?.remainingInventory || 0);

  const clampQuantity = useCallback((q: number): number => {
    const clamped = Math.min(maxQuantity, remainingForTier);
    return Math.max(1, Math.min(Number.isFinite(q) ? Math.floor(q) : 1, clamped));
  }, [remainingForTier]);

  // Auto-correct quantity when event/tier changes or inventory drops below it.
  useEffect(() => {
    setQuantity((q) => clampQuantity(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampQuantity]);

  // ---------- Merchant UPI config ----------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await safeFetch<any>('/api/merchant-upi', { headers: await authenticatedApiHeaders() });
        if (!cancelled && res.ok && res.data?.success) {
          setUpiConfig({ vpa: res.data.vpa || '', name: res.data.name || '' });
        }
      } catch {
        /* best-effort */
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ---------- Counter stations (for staff operating a named counter) ----------
  // Extracted so it can be re-run on a recurring interval and on visibility
  // restore; counter names change server-side when admins rename them and the
  // terminal stays open all shift, so a stale snapshot must be refreshed.
  const loadCounters = useCallback(async () => {
    try {
      const res = await safeFetch<any>('/api/admin/counters', { headers: await authenticatedApiHeaders() });
      if (res.ok && res.data?.success) {
        const all: WalkInCounter[] = res.data.counters || [];
        // Counter staff see only the counters they are assigned to and that
        // are active; platform admins/super-admins see every active counter.
        const visible = all.filter((c: WalkInCounter) => {
          if (c.status !== 'active') return false;
          if (isApprover) return true;
          return c.assignedStaffIds.includes(user?.uid || '');
        });
        setCounters(visible);
        // If the persisted choice is no longer available, stay on whatever is
        // first rather than silently resetting mid-session.
        setSelectedCounterId((prev) => {
          if (prev && visible.some((c: WalkInCounter) => c.id === prev)) return prev;
          if (visible.length > 0) return visible[0].id;
          return '';
        });
      }
    } catch {
      /* best-effort; walk-in sales still work without a counter */
    }
  }, [isApprover, user?.uid]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadCounters();
    };
    load();
    // Cheap 60s polling while the terminal page stays open, matching the
    // long-lived POS pattern already used for seat-map refresh on this page.
    const interval = window.setInterval(() => {
      if (!cancelled && navigator.onLine) {
        void loadCounters();
      }
    }, 60000);
    // Refresh instantly when the tab is brought back into view (the admin may
    // have renamed the counter while the terminal was backgrounded).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void loadCounters();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the chosen counter for fast repeat issuance on this device.
  useEffect(() => {
    try {
      if (selectedCounterId) localStorage.setItem(COUNTER_MEMORY_KEY, selectedCounterId);
      else localStorage.removeItem(COUNTER_MEMORY_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [selectedCounterId]);

  // Effective UPI: per-counter override when the selected counter carries its
  // own merchant VPA, otherwise the global merchant UPI config.
  const selectedCounter = counters.find((c) => c.id === selectedCounterId) || null;
  const counterHasUpi = Boolean(selectedCounter?.merchantUpi?.vpa);
  const effectiveUpi = counterHasUpi ? selectedCounter!.merchantUpi : upiConfig;
  const upiSource = counterHasUpi ? 'counter' : 'global';

  // ---------- Real-time seat map refresh ----------
  useEffect(() => {
    if (!isSeatBasedEvent(selectedEvent)) return;
    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        setSeatRefreshKey((k) => k + 1);
        setLastLiveRefresh(Date.now());
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isSeatBasedEvent(selectedEvent), selectedEvent?.id]);

  // Track stale seconds elapsed
  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastLiveRefresh) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [lastLiveRefresh]);

  // ---------- Offline queue listeners ----------
  const refreshQueue = useCallback(async () => {
    const q = await getQueuedSales();
    setQueuedSales(q);
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    const res = await syncOfflineWalkInQueue((confirmedTicket, queueItem) => {
      setOfflineToast(`Offline sale for ${queueItem.payload.attendeeName} confirmed! Ticket #${confirmedTicket.ticketNumber}`);
    });
    if (res.synced > 0 || res.conflicts > 0) {
      refreshQueue();
    }
  }, [refreshQueue]);

  useEffect(() => {
    refreshQueue();

    const onOnline = () => {
      setConnection('online');
      setErrorBanner('');
      triggerSync();
    };
    const onOffline = () => setConnection('lost');

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const syncInterval = window.setInterval(() => {
      triggerSync();
    }, 30000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(syncInterval);
    };
  }, [refreshQueue, triggerSync]);

  // ---------- Open shift attribution ----------
  useEffect(() => {
    let cancelled = false;
    const loadShifts = async () => {
      try {
        const res = await safeFetch<any>('/api/counter/shifts', { headers: await authenticatedApiHeaders() });
        if (cancelled || !res.ok) return;
        
                const currentCounterId = selectedCounterId || '';
        const localShift = currentCounterId ? readStoredActiveShift(currentCounterId) : null;
        const openShifts = (res.data?.shifts || []).filter((s: any) =>
          s.status === 'open' && (!currentCounterId || s.counterId === currentCounterId)
        );
        let openShift = openShifts.find((s: any) => s.shiftId === localShift?.shiftId);
        if (!openShift && currentCounterId) {
          openShift = openShifts.find((s: any) => !s.staffId || s.staffId === user?.uid);
        }
        if (openShift) writeStoredActiveShift(openShift);
        else if (currentCounterId) clearStoredActiveShift(currentCounterId);


        setActiveShiftId(openShift ? openShift.shiftId : null);
        if (openShift && openShift.subUserId) {
          setActiveSubUser({ id: openShift.subUserId, name: openShift.subUserName || '' });
        } else {
          setActiveSubUser(null);
        }
      } catch {
        /* shift loading is best-effort */
      }
    };
    loadShifts();
    return () => { cancelled = true; };
    }, [user?.uid, selectedCounterId]);
  // ---------- Totals ----------

  const seatCount = selectedSeats.length;
  const unitCount = isSeatBasedEvent(selectedEvent) ? seatCount : quantity;
  const grossTotal = (selectedTier?.price || 0) * unitCount;
  const paymentsSum = payments.reduce((acc, p) => acc + p.amount, 0);
  const netTotal = Math.max(0, grossTotal - discountAmount);
  const paymentsValid = payments.length > 0 && Math.abs(paymentsSum - netTotal) < 0.01 && payments.every((p) => p.amount > 0);
  const splitUpiRowsAllVerified = !showSplit || payments.every((p, idx) => p.method !== 'upi' || verifiedUpiRows[idx]);
  const upiUri = paymentMethod === 'upi' && validateUpiParam({
    vpa: effectiveUpi?.vpa || '',
    name: effectiveUpi?.name,
    amount: netTotal,
    note: selectedEvent ? `Walk-in pass: ${selectedEvent.title}` : undefined,
  }).valid
    ? buildUpiPayUri({
        vpa: effectiveUpi!.vpa,
        name: effectiveUpi?.name,
        amount: netTotal,
        note: selectedEvent ? `Walk-in pass: ${selectedEvent.title}` : undefined,
      })
    : '';

  // Whenever the order totals or payment method change, reset the UPI flow so
  // the operator re-confirms payment against the updated amount.
  useEffect(() => {
    setUpiFlow('none');
    setUpiError('');
  }, [paymentMethod, netTotal, effectiveUpi?.vpa]);

  // Auto-sync payments when not in split mode so confirm button is always enabled with correct total
  useEffect(() => {
    if (!showSplit) {
      setPayments([{ method: paymentMethod, amount: netTotal }]);
    }
  }, [showSplit, paymentMethod, netTotal]);

  const refreshSeats = useCallback(() => {
    setSeatRefreshKey((k) => k + 1);
    setLastLiveRefresh(Date.now());
  }, []);

  // ---------- Quick seat search ----------
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

  // ---------- Keyboard shortcuts ----------
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

  // ---------- Split payment helpers ----------
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
    // Use Number.EPSILON to handle floating point precision issues
    const remaining = Math.max(0, netTotal - other);
    updatePayment(index, { amount: Math.round((remaining + Number.EPSILON) * 100) / 100 });
  };

  // ---------- Manager-gated discount override ----------
  const handleRequestOverride = async () => {
    if (!selectedEvent || grossTotal <= 0 || discountAmount <= 0) return;
    setIsOverrideLoading(true);
    setOverrideError('');
    try {
      const res = await safeFetch<any>('/api/counter/discount-override', {
        method: 'POST',
        headers: await authenticatedApiHeaders(),
        body: JSON.stringify({
          eventId: selectedEvent.id,
          orderAmount: grossTotal,
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

  // ---------- Merchant UPI save ----------
  const handleSaveVpa = async () => {
    setIsSavingVpa(true);
    setUpiError('');
    try {
      const res = await safeFetch<any>('/api/merchant-upi', {
        method: 'PUT',
        headers: await authenticatedApiHeaders(),
        body: JSON.stringify({ vpa: newVpa.trim(), name: newName.trim() }),
      });
      if (!res.ok || !res.data?.success) {
        setUpiError(res.data?.error || 'Could not save the UPI ID.');
        return;
      }
      setUpiConfig({ vpa: res.data.vpa || '', name: res.data.name || '' });
      setNewVpa('');
      setNewName('');
      setShowUpiSettings(false);
    } catch {
      setUpiError('Network error while saving. Please try again.');
    } finally {
      setIsSavingVpa(false);
    }
  };

  const maskedVpa = (vpa: string): string => {
    const [local, domain] = vpa.split('@');
    if (!domain || local.length < 4) return vpa;
    return `${local.slice(0, 2)}${'•'.repeat(Math.max(0, local.length - 4))}${local.slice(-2)}@${domain}`;
  };

  // ---------- Submission ----------
  const handleIssueWalkIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorBanner('');
    setFormError('');

    if (!activeShiftId) {
      setFormError('Sign in with an assigned counter user PIN before issuing tickets.');
      navigate('/counter/shift');
      return;
    }

    const trimmedName = attendeeName.trim();
    const trimmedPhone = attendeePhone.trim();
    if (!trimmedName) {
      setFormError('Enter the guest\u2019s full name to continue.');
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedPhone) {
      setFormError('WhatsApp Mobile Number is mandatory for sending QR ticket pass.');
      return;
    }
    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setFormError('The WhatsApp mobile number must be a valid 10-digit number (e.g. 9820012345).');
      return;
    }
    if (selectedEvent && isSeatBasedEvent(selectedEvent) && selectedSeats.length === 0) {
      setFormError('Select seats on the map for this walk-in booking.');
      return;
    }
    if (!showSplit && paymentMethod === 'upi' && upiFlow !== 'received') {
      setFormError('Show the QR code, confirm payment was received, then tap Confirm.');
      return;
    }
    if (showSplit && !splitUpiRowsAllVerified) {
      setFormError('Please manually verify all split UPI rows by clicking "Verify UPI Received".');
      return;
    }
    if (!paymentsValid) {
      setFormError(`Payment amounts must sum to the order total (${formatRupee(netTotal)}). Currently ${formatRupee(paymentsSum)}.`);
      return;
    }

    let currentOverride = overrideApproved;
    if (discountAmount > 0) {
      if (!currentOverride || currentOverride.amount !== Math.round(discountAmount)) {
        if (isApprover) {
          try {
            const res = await safeFetch<any>('/api/counter/discount-override', {
              method: 'POST',
              headers: await authenticatedApiHeaders(),
              body: JSON.stringify({
                eventId: selectedEventId,
                orderAmount: grossTotal,
                discountAmount: Math.round(discountAmount),
                reason: overrideReason.trim() || 'Counter discount override',
              }),
            });
            if (res.ok && res.data?.success && res.data.discountOverride) {
              currentOverride = {
                actorId: res.data.discountOverride.actorId,
                actorName: res.data.discountOverride.actorName,
                amount: res.data.discountOverride.discountAmount,
              };
              setOverrideApproved(currentOverride);
            } else {
              setFormError(res.data?.error || 'Manager approval failed for this discount. Please click "Approve Discount" and retry.');
              return;
            }
          } catch {
            setFormError('Failed to verify manager discount approval. Please retry.');
            return;
          }
        } else {
          setFormError('Manager approval is required for the discount before issuing tickets.');
          return;
        }
      }
    }

    setIsSubmitting(true);

    const salePayload = {
      eventId: selectedEventId,
      tierId: selectedTierId,
      attendeeName: trimmedName,
      attendeePhone: trimmedPhone,
      scannedByStaffId: user?.name || 'Counter Operator',
      selectedSeats: selectedSeats.length > 0 ? selectedSeats : undefined,
      quantity: isSeatBasedEvent(selectedEvent) ? undefined : quantity,
      paymentMethod,
      payments,
      discountOverride: currentOverride
        ? {
            overrideId: `${Date.now()}`,
            discountAmount: currentOverride.amount,
            actorId: currentOverride.actorId,
            reason: overrideReason.trim(),
          }
        : undefined,
      shiftId: activeShiftId || undefined,
      counterId: selectedCounterId || undefined,
      subUserId: activeSubUser?.id || undefined,
      subUserName: activeSubUser?.name || undefined,
      idempotencyKey,
    };

    const submitBooking = async (): Promise<void> => {
      try {
        const ticket = await createWalkInBooking(
          selectedEventId,
          selectedTierId,
          trimmedName,
          trimmedPhone,
          user?.name || 'Counter Operator',
          selectedSeats.length > 0 ? selectedSeats : undefined,
          paymentMethod,
          {
            quantity: isSeatBasedEvent(selectedEvent) ? undefined : quantity,
            payments,
            discountOverride: currentOverride
              ? {
                  overrideId: `${Date.now()}`,
                  discountAmount: currentOverride.amount,
                  actorId: currentOverride.actorId,
                  reason: overrideReason.trim(),
                }
              : undefined,
            shiftId: activeShiftId || undefined,
            idempotencyKey,
            counterId: selectedCounterId || undefined,
            subUserId: activeSubUser?.id || undefined,
            subUserName: activeSubUser?.name || undefined,
          }
        );
        setIssuedTicket(ticket);
        setConnection('online');
      } catch (err: any) {
        console.error('Walk-in ticket issue error:', err);
        const isNetworkDrop = !navigator.onLine || /network|fetch|failed to fetch/i.test(String(err?.message || ''));
        if (isNetworkDrop) {
          try {
            await enqueueOfflineSale({
              idempotencyKey,
              payload: salePayload,
              eventTitle: selectedEvent?.title,
              tierName: selectedTier?.name,
              totalAmount: netTotal,
            });
            setConnection('lost');
            setErrorBanner('Saved offline — will complete automatically when connection returns.');
          } catch (qErr: any) {
            setErrorBanner('Connection lost and could not save offline: ' + qErr.message);
          }
        } else {
          setErrorBanner(err?.message || 'The sale could not be completed. The seats were not sold — please retry.');
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    // If browser is explicitly offline, enqueue directly without network call
    if (!navigator.onLine) {
      try {
        await enqueueOfflineSale({
          idempotencyKey,
          payload: salePayload,
          eventTitle: selectedEvent?.title,
          tierName: selectedTier?.name,
          totalAmount: netTotal,
        });
        setConnection('lost');
        setErrorBanner('Saved offline — will complete automatically when connection returns.');
        await refreshQueue();
      } catch (err: any) {
        setErrorBanner('Failed to save sale offline: ' + err.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    await submitBooking();
  };

  const handleReset = () => {
    setIssuedTicket(null);
    setAttendeeName('');
    setAttendeePhone('');
    setSelectedSeats([]);
    setSeatSearch('');
    setQuantity(clampQuantity(1));
    setPaymentMethod('cash');
    setShowSplit(false);
    setPayments([{ method: 'cash', amount: 0 }]);
    setVerifiedUpiRows({});
    setUpiFlow('none');
    setDiscountAmount(0);
    setOverrideApproved(null);
    setOverrideReason('');
    setOverrideError('');
    setErrorBanner('');
    setFormError('');
    // Fresh idempotencyKey for the new transaction
    setIdempotencyKey(`idemp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    refreshSeats();
    // Keep the event/tier memory; focus the name field for the next guest.
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const pendingCount = queuedSales.filter((s) => s.status === 'pending' || s.status === 'syncing').length;
  const conflictCount = queuedSales.filter((s) => s.status === 'conflict').length;

  const confirmDisabled =
    isSubmitting ||
    !attendeeName.trim() ||
    !attendeePhone.trim() ||
    !activeShiftId ||
    !selectedEvent ||
    !selectedTier ||
    (isSeatBasedEvent(selectedEvent) && selectedSeats.length === 0) ||
    (!showSplit && paymentMethod === 'upi' && upiFlow !== 'received') ||
    (showSplit && !splitUpiRowsAllVerified) ||
    !paymentsValid;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#141414] border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="font-heading font-extrabold text-xl text-white">Walk-In Issuance</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Fast counter pass issuance — cash, card terminal, or UPI.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {queuedSales.length > 0 && (
            <button
              onClick={() => setShowQueueModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                conflictCount > 0
                  ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                {pendingCount > 0 ? `${pendingCount} Queued` : ''}
                {conflictCount > 0 ? ` • ${conflictCount} Need Attention` : ''}
              </span>
            </button>
          )}

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${
            connection === 'online'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>
            <WifiOff className="w-3.5 h-3.5" />
            {connection === 'online' ? 'Connected' : 'Offline Mode'}
          </span>
        </div>
      </div>

      {/* Offline Toast Notification */}
      {offlineToast && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{offlineToast}</span>
          </div>
          <button onClick={() => setOfflineToast('')} className="p-1 text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
              Issued for <strong className="text-white">{issuedTicket.attendeeName}</strong>
              {issuedTicket.attendeePhone ? ` (${issuedTicket.attendeePhone})` : ' (no contact recorded)'}
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
              <span>{isSeatBasedEvent(selectedEvent) ? 'Seats' : 'Passes'}:</span>
              <span className="font-bold text-white">{issuedTicket.seatNumber}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Payment Received:</span>
              <span className="font-bold text-emerald-400">
                ₹{issuedTicket.totalPaid}{payments.length > 1 ? ` (split across ${payments.length} methods)` : ` (${paymentMethod.toUpperCase()})`}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Manager Discount:</span>
                <span className="font-bold text-emerald-400">− ₹{discountAmount}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-gray-400 pt-2 border-t border-white/10">
              <span>Secure Pass Link:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[#D4AF37] truncate max-w-[150px]">
                  {issuedTicket.passSlug ? passUrl(issuedTicket.passSlug.id, issuedTicket.passSlug.sig) : 'Generating...'}
                </span>
                {issuedTicket.passSlug && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(passUrl(issuedTicket.passSlug.id, issuedTicket.passSlug.sig));
                      alert('Secure pass link copied to clipboard!');
                    }}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                    title="Copy Link"
                  >
                    Copy
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Manual WhatsApp share button hidden in production to prefer automated enotify dispatch */}
            {false && (
              <button
                onClick={() => sendTicketToWhatsApp(issuedTicket)}
                className="py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <MessageSquareCode className="w-4 h-4 stroke-[2.5]" />
                <span>Send QR Pass to WhatsApp</span>
              </button>
            )}
            {issuedTicket.passSlug && (
              <a
                href={passUrl(issuedTicket.passSlug.id, issuedTicket.passSlug.sig)}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-5 rounded-xl bg-[#222] hover:bg-[#333] text-[#D4AF37] font-bold text-xs flex items-center gap-2 border border-[#D4AF37]/30 transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Digital Pass</span>
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="py-3 px-4 rounded-xl bg-[#222] hover:bg-[#333] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>Print Receipt</span>
            </button>
            <button
              onClick={handleReset}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#D4AF37]/25 cursor-pointer"
            >
              <span>Issue Next Walk-In</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      ) : (
        /* POS Checkout Form */
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
          {!activeShiftId && (
            <div className="lg:col-span-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
              <span>Counter sign-in is required before tickets can be issued.</span>
              <button
                type="button"
                onClick={() => navigate('/counter/shift')}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-300 text-black font-bold hover:bg-amber-200"
              >
                Sign In
              </button>
            </div>
          )}
          {/* ================= LEFT: selection column ================= */}
          <div className="space-y-4">
            {/* 1. Event selector */}
            <div className="p-4 rounded-3xl bg-[#141414] border border-white/10 space-y-2.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Event</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              </div>
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  setSelectedSeats([]);
                  setSeatSearch('');
                  const evt = events.find((item) => item.id === e.target.value);
                  if (evt?.ticketTiers?.[0]) {
                    setSelectedTierId(evt.ticketTiers?.[0]?.id || '');
                  } else {
                    setSelectedTierId('');
                  }
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-semibold text-sm focus:outline-none focus:border-[#D4AF37] transition-colors cursor-pointer"
              >
                {filteredEvents.length === 0 ? (
                  <option value="">No events match the filter</option>
                ) : (
                  filteredEvents.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({evt.city} • {evt.date})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. Ticket category cards */}
            {selectedEvent && (
              <div className="p-4 rounded-3xl bg-[#141414] border border-white/10 space-y-2.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {selectedEventTiers.map((tier) => (
                    <button
                      type="button"
                      key={tier.id}
                      onClick={() => {
                        setSelectedTierId(tier.id);
                        setSelectedSeats([]);
                        setSeatSearch('');
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        selectedTierId === tier.id
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/10'
                          : 'bg-[#1C1C1C] border-white/5 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <span className="block font-bold text-sm text-white">{tier.name}</span>
                      <span className="font-heading font-extrabold text-base text-[#D4AF37] mt-0.5 block">
                        ₹{tier.price}
                      </span>
                      <span className={`text-[10px] block mt-0.5 ${tier.remainingInventory > 0 ? 'text-gray-400' : 'text-red-400'}`}>
                        {tier.remainingInventory > 0 ? `${tier.remainingInventory} passes left` : 'Sold out'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Quantity / seats */}
            {selectedEvent && isSeatBasedEvent(selectedEvent) ? (
              <div className="space-y-2.5 p-4 rounded-3xl bg-[#141414] border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest flex items-center gap-1.5">
                    <Armchair className="w-3.5 h-3.5" />
                    <span>Seat Map</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Seats:</span>
                    <select
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(Number(e.target.value));
                        setSelectedSeats([]);
                        setSeatSearch('');
                      }}
                      className="bg-[#1C1C1C] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs font-bold cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                        <option key={n} value={n}>{n} seat{n > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {connection === 'lost' && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>
                      Offline seat map — showing snapshot as of <strong>{secondsAgo}s ago</strong> (may be stale).
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      ref={seatSearchInputRef}
                      type="text"
                      placeholder='Quick lookup — type "A-5" and press Enter...'
                      value={seatSearch}
                      onChange={(e) => handleSeatSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37]"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  </div>
                  <button
                    type="button"
                    onClick={refreshSeats}
                    className="px-3 py-2.5 rounded-xl bg-[#222] border border-white/10 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-white transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    title="Refresh seat availability now"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
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
                  ticketTiers={selectedEventTiers}
                  eventDate={selectedEvent.date}
                  eventTime={selectedEvent.time}
                  onReservationError={(msg) => setErrorBanner(msg)}
                />
              </div>
            ) : (
              /* GA quantity stepper */
              <div className="p-4 rounded-3xl bg-[#141414] border border-white/10">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Passes</label>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                      disabled={quantity <= 1}
                      className="w-9 h-9 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      value={quantity}
                      onChange={(e) => setQuantity(clampQuantity(Number(e.target.value) || 1))}
                      className="w-14 h-9 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-center text-base font-extrabold focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => clampQuantity(q + 1))}
                      disabled={quantity >= maxQuantity || quantity >= remainingForTier}
                      className="w-9 h-9 rounded-xl bg-[#1C1C1C] border border-white/10 text-white font-bold text-lg hover:border-[#D4AF37] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  {quantity >= remainingForTier && remainingForTier > 0 && (
                    <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wide">
                      Max remaining reached
                    </span>
                  )}
                </div>
                {remainingForTier === 0 && selectedTier && (
                  <p className="text-red-400 text-xs mt-2">
                    This category is sold out — pick another to continue.
                  </p>
                )}
              </div>
            )}

            {/* 4. Customer */}
            <div className="p-4 rounded-3xl bg-[#141414] border border-white/10 space-y-2.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Guest</label>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={attendeeName}
                  onChange={(e) => {
                    setAttendeeName(e.target.value);
                    if (formError.startsWith('Enter the guest')) setFormError('');
                  }}
                  placeholder="Guest full name *"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              </div>
              <div className="relative">
                <input
                  type="tel"
                  required
                  value={attendeePhone}
                  onChange={(e) => {
                    setAttendeePhone(e.target.value);
                    if (formError.includes('WhatsApp')) setFormError('');
                  }}
                  placeholder="WhatsApp Mobile Number (Mandatory) *"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-colors"
                />
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* Manager discount override (approvers only) */}
            {isApprover && (
              <div className="p-4 rounded-3xl bg-[#D4AF37]/5 border border-[#D4AF37]/25 space-y-2.5">
                <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Manager Discount Override
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Amount (₹)</span>
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
                      className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
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
                      className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={isOverrideLoading || discountAmount <= 0 || grossTotal <= 0 || discountAmount > grossTotal}
                      onClick={handleRequestOverride}
                      className="w-full py-2.5 rounded-xl bg-[#222] hover:bg-[#333] disabled:opacity-50 border border-[#D4AF37]/40 text-[#D4AF37] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isOverrideLoading ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Approving...</>
                      ) : (
                        <><ShieldCheck className="w-3.5 h-3.5" /> Approve Discount</>
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
          </div>

          {/* ================= RIGHT: payment column ================= */}
          <div className="lg:sticky lg:top-28 space-y-4">
            {/* Total card */}
            <div className="p-5 rounded-3xl bg-[#141414] border border-white/10">
              {counters.length > 0 && (
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Ticket Counter
                  </label>
                  <select
                    value={selectedCounterId}
                    onChange={(e) => setSelectedCounterId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37] cursor-pointer appearance-none"
                  >
                    <option value="" disabled>
                      Select a counter station&hellip;
                    </option>
                    {counters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.venue ? ` — ${c.venue}` : ''}
                        {c.merchantUpi?.vpa ? ' • Counter UPI' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedCounter && (
                    <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1">
                      <Armchair className="w-3 h-3 text-[#D4AF37]" />
                      Collecting into{' '}
                      {counterHasUpi ? (
                        <span className="text-[#F3E5AB]">{selectedCounter.name}&rsquo;s merchant UPI</span>
                      ) : (
                        <span className="text-gray-400">global merchant UPI</span>
                      )}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {discountAmount > 0 ? 'Total Due (after discount)' : 'Total Due'}
                </span>
                {activeShiftId && (
                  <span className="text-[10px] text-[#F3E5AB]/70 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> On shift
                  </span>
                )}
              </div>
              <div className="font-heading font-extrabold text-4xl text-[#D4AF37] mt-2">
                {formatRupee(netTotal)}
              </div>
              {grossTotal > netTotal && (
                <div className="text-[10px] text-gray-400 mt-1">
                  {formatRupee(grossTotal)} − {formatRupee(discountAmount)} discount
                  {isSeatBasedEvent(selectedEvent) ? ` • ${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'}` : ` • ${quantity} pass${quantity === 1 ? '' : 'es'} × ${formatRupee(selectedTier?.price || 0)}`}
                </div>
              )}

              {/* Method selector */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPaymentMethod(m.key)}
                    className={`py-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === m.key
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/10'
                        : 'bg-[#1C1C1C] border-white/10 text-gray-400 hover:border-white/25'
                    }`}
                  >
                    <m.icon className="w-4 h-4" style={{ color: m.color }} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Split payment (advanced) */}
              <div className="mt-3 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSplit((v) => !v)}
                  className={`text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${showSplit ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {showSplit ? 'Hide split payments' : 'Split across multiple methods'}
                </button>
                {showSplit && (
                  <div className="mt-3 space-y-4">
                    {payments.map((payment, index) => {
                      const isUpi = payment.method === 'upi';
                      const rowUpiUri = isUpi && payment.amount > 0 && validateUpiParam({
                        vpa: effectiveUpi?.vpa || '',
                        name: effectiveUpi?.name,
                        amount: payment.amount,
                        note: selectedEvent ? `Pass: ${selectedEvent.title}` : undefined,
                      }).valid ? buildUpiPayUri({
                        vpa: effectiveUpi!.vpa,
                        name: effectiveUpi?.name,
                        amount: payment.amount,
                        note: selectedEvent ? `Pass: ${selectedEvent.title}` : undefined,
                      }) : '';

                      return (
                        <div key={index} className="p-3.5 rounded-2xl bg-[#1C1C1C] border border-white/5 space-y-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                            <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-[180px]">
                              {PAYMENT_METHODS.map((m) => (
                                <label
                                  key={m.key}
                                  className={`flex items-center justify-center gap-1 text-[10px] font-bold py-2 px-1 rounded-lg border cursor-pointer transition-all ${
                                    payment.method === m.key
                                      ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white'
                                      : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/15'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`payment-${index}`}
                                    checked={payment.method === m.key}
                                    onChange={() => {
                                      updatePayment(index, { method: m.key });
                                      setVerifiedUpiRows(prev => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }}
                                    className="hidden"
                                  />
                                  <m.icon className="w-3 h-3" style={{ color: m.color }} />
                                  <span>{m.label}</span>
                                </label>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 text-xs">₹</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={payment.amount || ''}
                                onChange={(e) => {
                                  updatePayment(index, { amount: Number(e.target.value) || 0 });
                                  setVerifiedUpiRows(prev => {
                                    const next = { ...prev };
                                    delete next[index];
                                    return next;
                                  });
                                }}
                                placeholder="0.00"
                                className="w-20 px-2 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#D4AF37]"
                              />
                              <button
                                type="button"
                                onClick={() => autofillRemaining(index)}
                                className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] font-bold hover:border-[#D4AF37] hover:text-white transition-all cursor-pointer"
                                title="Fill with remaining balance"
                              >
                                Fill
                              </button>
                              {payments.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePaymentRow(index)}
                                  className="w-8 h-8 rounded-lg bg-black/40 border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row-level UPI QR box */}
                          {isUpi && payment.amount > 0 && (
                            <div className="p-3 rounded-xl bg-black/20 border border-[#D4AF37]/15 flex flex-col sm:flex-row items-center gap-4 animate-in slide-in-from-top-2 duration-200">
                              {rowUpiUri ? (
                                <div className="p-2 rounded-lg bg-white shrink-0">
                                  <QRCodeSVG
                                    value={rowUpiUri}
                                    size={85}
                                    level="M"
                                    bgColor="#FFFFFF"
                                    fgColor="#000000"
                                  />
                                </div>
                              ) : (
                                <div className="text-amber-400 text-[10px] bg-amber-500/10 p-2 rounded-lg">UPI config missing</div>
                              )}
                              <div className="flex-1 space-y-1.5 text-center sm:text-left w-full">
                                <div className="text-[11px] text-gray-400">
                                  Scan QR for Row #{index + 1} amount:{' '}
                                  <strong className="text-[#D4AF37] font-mono">{formatRupee(payment.amount)}</strong>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setVerifiedUpiRows(prev => ({ ...prev, [index]: !prev[index] }))}
                                  className={`w-full py-1.5 px-3 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                    verifiedUpiRows[index]
                                      ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-400'
                                      : 'bg-amber-500/10 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {verifiedUpiRows[index] ? 'UPI Received (Manual Verified)' : 'Verify UPI Received'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addPaymentRow}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#222] border border-white/10 text-gray-300 text-[10px] font-bold hover:border-[#D4AF37] hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add method
                    </button>
                    <div className={`text-[11px] font-bold flex flex-wrap items-center gap-x-4 gap-y-1 p-2 rounded-xl ${
                      paymentsValid ? 'bg-emerald-500/5 text-emerald-400' : 'bg-amber-500/5 text-amber-400'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 font-medium uppercase tracking-wider text-[9px]">Net Due:</span>
                        <span className="text-white">{formatRupee(netTotal)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 font-medium uppercase tracking-wider text-[9px]">Total Allocated:</span>
                        <span className={paymentsValid ? 'text-emerald-400' : 'text-amber-400'}>{formatRupee(paymentsSum)}</span>
                      </div>
                      {Math.abs(netTotal - paymentsSum) > 0.01 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500 font-medium uppercase tracking-wider text-[9px]">Remaining:</span>
                          <span className="text-amber-400 underline decoration-dotted">{formatRupee(netTotal - paymentsSum)}</span>
                        </div>
                      )}
                      {paymentsValid && <div className="flex items-center gap-1 text-emerald-400 ml-auto">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[9px] uppercase tracking-widest">Balanced</span>
                      </div>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* UPI payment panel */}
            {paymentMethod === 'upi' && (
              <div className="p-5 rounded-3xl bg-[#141414] border border-[#D4AF37]/30">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5" />
                    Pay by UPI
                  </label>
                  {isApprover && (
                    <button
                      type="button"
                      onClick={() => setShowUpiSettings((v) => !v)}
                      className="text-gray-500 hover:text-[#D4AF37] transition-colors cursor-pointer"
                      title="Configure merchant UPI ID"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {showUpiSettings && isApprover && (
                  <div className="mt-3 p-3 rounded-2xl bg-[#1C1C1C] border border-[#D4AF37]/30 space-y-2.5">
                    <input
                      type="text"
                      value={newVpa}
                      onChange={(e) => setNewVpa(e.target.value)}
                      placeholder="Merchant UPI ID (e.g. store@upi)"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0E0E0E] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#D4AF37]"
                    />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Display name (shown in payer app, max 25 chars)"
                      maxLength={25}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0E0E0E] border border-white/10 text-white text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveVpa}
                      disabled={isSavingVpa || !newVpa.trim()}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSavingVpa ? 'Saving...' : 'Save Merchant UPI ID'}
                    </button>
                  </div>
                )}

                {validateUpiParam({
                  vpa: effectiveUpi?.vpa || '',
                  name: effectiveUpi?.name,
                  amount: netTotal,
                }).valid ? (
                  <div className="mt-4 flex flex-col items-center">
                    <div className="p-4 rounded-2xl bg-white">
                      <QRCodeSVG
                        value={upiUri}
                        size={220}
                        level="M"
                        includeMargin={false}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                      />
                    </div>
                    <div className="text-center mt-3 space-y-1">
                      <p className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                        {formatRupee(netTotal)}
                      </p>
                      <p className="text-gray-400 text-xs">
                        Exact-amount request • {effectiveUpi?.name || 'merchant'}
                      </p>
                      <p className="text-gray-500 text-xs font-mono">
                        {maskedVpa(effectiveUpi!.vpa)}
                      </p>
                      {counterHasUpi && (
                        <p className="text-[10px] text-[#F3E5AB]/70 flex items-center justify-center gap-1">
                          <KeyRound className="w-3 h-3" /> Managed in Admin → Counters • {selectedCounter?.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-4 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(effectiveUpi!.vpa).then(
                            () => setOfflineToast('UPI ID copied'),
                            () => {}
                          );
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-[#222] border border-white/10 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy UPI ID
                      </button>
                      <a
                        href={upiUri}
                        className="flex-1 py-2.5 rounded-xl bg-[#222] border border-white/10 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-white transition-all flex items-center justify-center gap-1.5 no-underline cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open UPI App
                      </a>
                    </div>
                    <div className="mt-4 w-full space-y-2">
                      {upiFlow !== 'received' && (
                        <button
                          type="button"
                          onClick={() => setUpiFlow('received')}
                          className={`w-full py-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            upiFlow === 'awaiting'
                              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                              : 'bg-[#222] border border-white/10 text-gray-300 hover:border-emerald-500/40 hover:text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {upiFlow === 'awaiting'
                            ? 'Payment Received — Tap to Lock It In'
                            : 'Payment Received — Issue Ticket'}
                        </button>
                      )}
                      {upiFlow === 'received' && (
                        <p className="text-emerald-400 text-[11px] text-center font-bold flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Payment confirmed — ready to issue ticket.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      UPI is not configured yet
                    </p>
                    <p className="text-amber-300/80">
                      Ask a super admin to save the merchant UPI ID (Settings icon above), or pick Cash / Card for now.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Form error banner */}
            {formError && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {(errorBanner || connection === 'lost') && (
              <div className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                errorBanner.includes('Saved offline')
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                  : connection === 'lost'
                  ? 'bg-red-500/10 border-red-500/40 text-red-300'
                  : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
              }`}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{errorBanner || 'Connection offline — sales are queued locally and auto-synced on reconnect.'}</span>
                  {connection === 'lost' && (
                    <button
                      type="button"
                      onClick={() => {
                        setConnection('retrying');
                        triggerSync();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry & Sync
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Confirm */}
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={() => handleIssueWalkIn()}
              disabled={confirmDisabled}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 disabled:opacity-50 disabled:brightness-100 text-black font-extrabold text-sm shadow-lg shadow-[#D4AF37]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <>
                  <span>
                    Confirm {paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'card' ? 'Card' : 'UPI'} Payment — {formatRupee(netTotal)}
                  </span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>

            <p className="text-center text-[10px] text-gray-500 -mt-2">
              Enter = issue • F = seat lookup • C = confirm • N = next ticket
            </p>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* OFFLINE QUEUE & CONFLICT RESOLUTION MODAL */}
      {/* ======================================================== */}
      {showQueueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-5 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-[#D4AF37]" />
                <div>
                  <h3 className="font-heading font-bold text-base text-white">Offline Walk-In Sync Queue</h3>
                  <p className="text-gray-400 text-xs">
                    {queuedSales.length} total local transactions pending or requiring resolution.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQueueModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {queuedSales.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                  Offline queue is empty. All sales are synced!
                </div>
              ) : (
                queuedSales.map((item) => {
                  const isConflict = item.status === 'conflict';
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border text-xs space-y-2 ${
                        isConflict
                          ? 'bg-red-500/10 border-red-500/30 text-red-200'
                          : 'bg-black/40 border-white/10 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-sans text-sm">
                          {item.payload.attendeeName}{item.payload.attendeePhone ? ` (${item.payload.attendeePhone})` : ''}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isConflict
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        <p>Event: <strong className="text-white">{item.eventTitle || item.payload.eventId}</strong></p>
                        <p>Amount: <strong className="text-[#D4AF37]">₹{item.totalAmount ?? '—'}</strong></p>
                        {item.payload.selectedSeats && item.payload.selectedSeats.length > 0 && (
                          <p>Seats: <strong className="text-white font-mono">{item.payload.selectedSeats.join(', ')}</strong></p>
                        )}
                        <p>Queued: {new Date(item.timestamp).toLocaleTimeString()}</p>
                      </div>

                      {isConflict && (
                        <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/30 text-red-300 text-[11px] space-y-1">
                          <p className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            <span>Conflict Reason:</span>
                          </p>
                          <p>{item.conflictReason || 'Seat is no longer available.'}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={async () => {
                            await removeQueuedSale(item.id);
                            await refreshQueue();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-300 text-[11px] font-semibold transition-all cursor-pointer"
                        >
                          Discard / Refund
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4 shrink-0">
              <button
                onClick={triggerSync}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 hover:brightness-110 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Now</span>
              </button>

              <button
                onClick={() => setShowQueueModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
