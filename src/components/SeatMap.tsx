import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, runTransaction, onDisconnect } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { SeatMapConfig, SeatNode, TicketTier } from '../types';
import { formatINR } from '../utils/formatters';
import { Armchair, CheckCircle, AlertCircle, Sparkles, Clock, Ticket, ShieldCheck, Tag, Info } from 'lucide-react';
import { chooseSeatSelection, findContiguousSeatBlock } from '../lib/contiguousSeatSelection';

interface SeatMapProps {
  eventId: string;
  seatMapConfig: SeatMapConfig;
  requiredQuantity: number;
  selectedSeatIds: string[];
  onSeatsSelected: (seatIds: string[]) => void;
  currentUserId?: string;
  ticketTiers?: TicketTier[];
  eventDate?: string;
  eventTime?: string;
  onProceedToCheckout?: () => void;
  /** Live server+RTDB seat projection (display-only authority). */
  seatProjection?: Record<string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }>;
  /** Reservation error bubbles up to the page. */
  onReservationError?: (message: string) => void;
  /** Current reservation status ('active' when holds exist for this buyer). */
  reservationStatus?: string;
  /** Owner id of this buyer's live reservation (server-derived session identity). */
  reservationOwnerId?: string;
}

const HOLD_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes hold expiry

export const SeatMap: React.FC<SeatMapProps> = ({
  eventId,
  seatMapConfig,
  requiredQuantity,
  selectedSeatIds,
  onSeatsSelected,
  currentUserId = 'anon_user',
  ticketTiers = [],
  eventDate = 'Today',
  eventTime = '07:30 PM',
  onProceedToCheckout,
  seatProjection = {},
  onReservationError,
  reservationStatus,
  reservationOwnerId,
}) => {
  const activeConfig = seatMapConfig || {
    rows: 6,
    cols: 8,
    aisleAfterCols: [4],
    tierByRow: {
      '1-2': 'VIP Skybox Lounge',
      '3-6': 'General Admission'
    }
  };
  const { rows = 6, cols = 8, aisleAfterCols = [], tierByRow = {} } = activeConfig;

  const [dbSeats, setDbSeats] = useState<Record<string, SeatNode>>({});
  const [localHeldSeats, setLocalHeldSeats] = useState<string[]>(selectedSeatIds);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [holdTimeLeft, setHoldTimeLeft] = useState<number>(600);
  const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null);
  const claimingRef = React.useRef<string[]>([]);
  const releaseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external props with local state
  useEffect(() => {
    setLocalHeldSeats(selectedSeatIds);
  }, [selectedSeatIds]);
  // Realtime projection is the display authority: merge it with local selections.
  // When the wizard/other buyers change seats server-side, the projection refreshes
  // automatically — seats taken by others drop out of the buyer's local selection.
  useEffect(() => {
    if (!seatProjection || Object.keys(seatProjection).length === 0) return;
    const now = Date.now();
    // A hold belongs to this buyer when heldBy matches the auth user OR
    // (guest/session-based identity) matches this session's id.
    const sessionId = (window as any).__SESSION_ID as string | undefined;
    // Server-authoritative: holds owned by this buyer's live reservation are
    // 'mine' regardless of the client-side guess (guest id hashing happens server-side).
    const isMyHold = (heldBy: string) =>
      heldBy === currentUserId ||
      (typeof reservationOwnerId === 'string' && heldBy === reservationOwnerId) ||
      (typeof sessionId === 'string' && heldBy === sessionId);
    // Seats this buyer has selected locally are always theirs — even before the
    // server identity (reservationOwnerId) has synced into this component, the
    // server's heldBy can carry a guest hash that matches nothing client-side.
    // Only seats held by the server AND NOT locally owned by this buyer are
    // considered 'taken by another'.
    const projectionHeld = new Set(
      (Object.entries(seatProjection) as [string, { status: string; heldBy?: string; expiresAt?: number; bookedAt?: number }][])
        .filter(
          ([seatId, s]) =>
            s.status === 'held' && s.heldBy && !isMyHold(s.heldBy) &&
            !localHeldSeats.includes(seatId) &&
            (!s.expiresAt || s.expiresAt > now)
        )
        .map(([seatId]) => seatId)
    );
    setLocalHeldSeats((prev) => {
      const taken = prev.filter((id) => projectionHeld.has(id));
      if (taken.length > 0) {
        const labels = taken.join(', ');
        setErrorMsg(`Seat(s) ${labels} were just taken by another buyer.`);
        onReservationError?.(`Seat(s) ${labels} were just taken by another buyer. Please re-select.`);
        // A multi-ticket party must remain an unbroken block. If live updates
        // invalidate one of its seats, clear the group rather than retaining a
        // broken partial selection.
        const updated = requiredQuantity > 1 ? [] : prev.filter((id) => !projectionHeld.has(id));
        onSeatsSelected(updated);
        return updated;
      }
      return prev;
    });
    setDbSeats({}); // projection supersedes the legacy DB snapshot
  }, [seatProjection, currentUserId, onReservationError, onSeatsSelected, requiredQuantity]);

  const getSeatStatus = (seatId: string): { status: 'available' | 'held' | 'booked'; isMine: boolean } => {
    // Server projection is authoritative. A projection entry overrides dbSeats.
    const proj = seatProjection?.[seatId];
    const now = Date.now();
    if (proj) {
      const expired = proj.status === 'held' && proj.expiresAt && now > proj.expiresAt;
      if (proj.status === 'booked' || proj.status === 'sold') return { status: 'booked', isMine: false };
      if (proj.status === 'held' && !expired) {
        const sessionId = (window as any).__SESSION_ID as string | undefined;
        // Locally selected seats are always ours — the server identity may lag
        // a render behind, and the heldBy guest hash would match nothing.
        const isMine =
          localHeldSeats.includes(seatId) ||
          (proj.heldBy || '') === currentUserId ||
          (typeof reservationOwnerId === 'string' && (proj.heldBy || '') === reservationOwnerId) ||
          (typeof sessionId === 'string' && (proj.heldBy || '') === sessionId);
        return { status: 'held', isMine };
      }
      if (localHeldSeats.includes(seatId)) return { status: 'held', isMine: true };
      return { status: 'available', isMine: false };
    }
    const node = dbSeats[seatId];
    if (!node) {
      if (localHeldSeats.includes(seatId)) return { status: 'held', isMine: true };
      return { status: 'available', isMine: false };
    }
    if (node.status === 'held') {
      const expiresAt = node.holdExpiresAt || (node.heldAt ? node.heldAt + HOLD_EXPIRY_MS : 0);
      if (expiresAt && now > expiresAt) {
        return { status: 'available', isMine: false };
      }
      const sessionId = (window as any).__SESSION_ID as string | undefined;
      const isMine =
        localHeldSeats.includes(seatId) ||
        node.heldBy === currentUserId ||
        (typeof reservationOwnerId === 'string' && node.heldBy === reservationOwnerId) ||
        (typeof sessionId === 'string' && node.heldBy === sessionId);
      return { status: 'held', isMine };
    }
    return { status: node.status, isMine: false };
  };

  // When a buyer is replacing an unfinished group, their own temporary seats
  // remain eligible for the next candidate block. Other buyers' seats never do.
  const isSeatAvailableForBlock = (seatId: string) => {
    const status = getSeatStatus(seatId);
    return status.status === 'available' || (status.status === 'held' && status.isMine);
  };

  const validGroupAnchors = useMemo(() => {
    const valid = new Set<string>();
    if (requiredQuantity <= 1) return valid;
    for (let row = 1; row <= rows; row += 1) {
      for (let column = 1; column <= cols; column += 1) {
        const seatId = `R${row}-C${column}`;
        if (findContiguousSeatBlock({
          row,
          anchorColumn: column,
          quantity: requiredQuantity,
          columns: cols,
          aisleAfterCols,
          isSeatAvailable: isSeatAvailableForBlock,
        })) valid.add(seatId);
      }
    }
    return valid;
    // getSeatStatus intentionally reads the live projection and current local
    // selection so anchors update immediately when either changes.
  }, [rows, cols, aisleAfterCols, requiredQuantity, seatProjection, dbSeats, localHeldSeats, currentUserId, reservationOwnerId]);

  const handleSeatClick = async (seatId: string) => {
    setErrorMsg('');
    const current = getSeatStatus(seatId);

    if (current.status === 'booked') {
      setErrorMsg('This seat is already sold/booked.');
      return;
    }

    if (current.status === 'held' && !current.isMine) {
      setErrorMsg('This seat is currently held by another buyer.');
      return;
    }

    const isAlreadySelected = localHeldSeats.includes(seatId);
    if (requiredQuantity > 1) {
      const selection = chooseSeatSelection({
        anchorSeatId: seatId,
        currentSeatIds: localHeldSeats,
        row: 0,
        anchorColumn: 0,
        quantity: requiredQuantity,
        columns: cols,
        aisleAfterCols,
        isSeatAvailable: isSeatAvailableForBlock,
      });
      if (selection.error) {
        setErrorMsg(selection.error);
        return;
      }
      if (claimingRef.current.length > 0) {
        setErrorMsg('Another seat selection is being updated, please wait a moment.');
        return;
      }
      claimingRef.current = selection.seatIds;
      try {
        setLocalHeldSeats(selection.seatIds);
        onSeatsSelected(selection.seatIds);
        setHoldTimeLeft(600);
      } finally {
        claimingRef.current = [];
      }
      return;
    }

    if (isAlreadySelected) {
      // Deselect locally — the wizard persists (or releases) the reservation
      // when the buyer confirms or leaves the flow. Nothing is written to RTDB
      // directly to avoid double-ownership conflicts.
      const updated = localHeldSeats.filter((id) => id !== seatId);
      setLocalHeldSeats(updated);
      onSeatsSelected(updated);
    } else {
      // Select new seat (UI-only). Server persistence is delegated to the
      // checkout wizard through onSeatsSelected, which routes through the
      // atomic reservation API (BookingContext.createReservation). Doing the
      // hold here would bypass the shared reservation state and could create
      // orphaned or duplicate reservations.
      if (localHeldSeats.length >= requiredQuantity) {
        setErrorMsg(`You can select up to ${requiredQuantity} seat(s). Unselect a seat to pick another.`);
        return;
      }
      if (claimingRef.current.length > 0) {
        setErrorMsg('Another seat is being reserved, please wait a moment.');
        return;
      }
      claimingRef.current = [seatId];
      try {
        const updated = [...localHeldSeats, seatId];
        setLocalHeldSeats(updated);
        onSeatsSelected(updated);
        setHoldTimeLeft(600);
      } finally {
        claimingRef.current = [];
      }
    }
  };

  // Flat pricing: every seat costs the first tier's price (all seats same price).
  const flatPrice = ticketTiers[0]?.price;
  const totalPrice = (localHeldSeats.length * (flatPrice || 0));

  const getSeatCategory = (rowIndex: number): string => {
    for (const [rowRange, tierName] of Object.entries(tierByRow)) {
      const parts = rowRange.split('-').map((p) => parseInt(p, 10));
      if (parts.length === 2 && rowIndex >= parts[0] && rowIndex <= parts[1]) {
        return String(tierName).toUpperCase();
      }
    }
    return 'STANDARD';
  };


  return (
    <div className="bg-[#121212] border border-[#D4AF37]/20 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in space-y-0">
      
      {/* Top Event Info Bar */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37]/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-extrabold text-white text-sm sm:text-base tracking-wide">
                {eventDate}
              </span>
              {eventTime && (
                <span className="font-mono text-[#D4AF37] text-sm font-bold">• {eventTime}</span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#F3E5AB] text-[11px] font-bold border border-[#D4AF37]/30">
                {requiredQuantity} {requiredQuantity === 1 ? 'Ticket' : 'Tickets'}
              </span>
            </div>
            <p className="text-xs text-gray-400">Single showtime event — select your seats below</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Screen / Stage Arc Header */}
      <div className="px-4 sm:px-8 pt-6 pb-2">
        <div className="relative w-full max-w-xl mx-auto text-center space-y-1">
          <div className="h-3 w-full border-t-2 border-[#D4AF37]/50 rounded-[100%] shadow-[0_-8px_25px_rgba(212,175,55,0.4)] bg-gradient-to-b from-[#D4AF37]/15 to-transparent" />
          <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-[#D4AF37]/80 pt-1 font-heading">
            SCREEN / STAGE THIS WAY
          </p>
        </div>
      </div>

      {/* Hovered Seat Tooltip Preview Bar */}
      <div className="mx-4 sm:mx-8 my-2 px-3 sm:px-4 py-2.5 bg-[#161616] border border-[#D4AF37]/20 rounded-xl flex items-center justify-between min-h-[42px] text-xs shadow-inner overflow-hidden">
        {hoveredSeatId ? (() => {
          const rNum = parseInt(hoveredSeatId.split('-')[0].replace('R', ''), 10);
          const cNum = parseInt(hoveredSeatId.split('-')[1].replace('C', ''), 10);
          const rLab = String.fromCharCode(64 + rNum);
          const category = getSeatCategory(rNum);
          const { status, isMine } = getSeatStatus(hoveredSeatId);
          const statusText = status === 'booked' ? 'Sold / Booked' : status === 'held' ? (isMine ? 'Selected by You' : 'Held by Another') : 'Available';
          const statusColor = status === 'booked' ? 'text-red-400' : status === 'held' ? (isMine ? 'text-yellow-300' : 'text-orange-400') : 'text-emerald-400';

          return (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 w-full animate-in fade-in duration-150">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"></span>
                <span className="font-heading font-extrabold text-white text-xs sm:text-sm">Seat {rLab}-{cNum}</span>
                <span className="text-gray-500">|</span>
                <span className="text-[#F3E5AB] font-semibold">{category}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-extrabold text-[#D4AF37] text-sm">{flatPrice ? formatINR(flatPrice) : 'Standard'}</span>
                <span className={`font-bold ${statusColor}`}>● {statusText}</span>
              </div>
            </div>
          );
        })() : (
          <div className="flex items-center gap-2 text-gray-400 w-full justify-center text-center">
            <Info className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>Hover over any seat to inspect category, tier pricing, and real-time availability.</span>
          </div>
        )}
      </div>

      {/* Main Cinema Seating Grid */}
      <div className="seat-map-viewport relative h-[360px] sm:h-[480px] bg-[#0A0A0A] border-y border-[#D4AF37]/15 select-none">
        {/* The Seating Grid Board */}
        <div className="min-w-max w-full flex flex-col items-center p-3 sm:p-4 select-none">
          <div className="min-w-[480px] max-w-3xl mx-auto flex flex-col items-center space-y-4 sm:space-y-6">
            {Array.from({ length: rows }).map((_, rIdx) => {
              const rowNum = rIdx + 1;
              const rowLabel = String.fromCharCode(64 + rowNum); // A, B, C...
              return (
                <div key={rowNum} className="w-full flex flex-col items-center">
                  {/* Section Header (only once, at the very top) */}
                  {rIdx === 0 && (
                    <div className="w-full pt-4 pb-2 mb-2 border-b border-[#D4AF37]/15 flex items-center justify-start gap-2">
                      <span className="font-heading font-extrabold text-xs sm:text-sm tracking-wider text-[#F3E5AB] uppercase">
                        {flatPrice ? `Rs.${flatPrice}` : ''} ALL SEATS SAME PRICE
                      </span>
                    </div>
                  )}

                  {/* Seat Row */}
                  <div className="flex items-center justify-center gap-3 w-full py-1">
                    {/* Left Row Letter */}
                    <span className="w-6 text-center text-xs font-bold text-gray-400 font-mono">
                      {rowLabel}
                    </span>

                    {/* Seat Boxes */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {Array.from({ length: cols }).map((_, cIdx) => {
                        const colNum = cIdx + 1;
                        const seatId = `R${rowNum}-C${colNum}`;
                        const { status, isMine } = getSeatStatus(seatId);
                        const isAisle = aisleAfterCols.includes(colNum);
                        const isInvalidGroupAnchor = requiredQuantity > 1 && status === 'available' && !validGroupAnchors.has(seatId);

                        // Cinema Seat Box Styling based on state:
                        // Available: Gold border with number
                        // Selected: Solid gold gradient box with dark text
                        // Sold: Light grey filled box
                        let btnClasses =
                          'w-7 h-7 sm:w-8 sm:h-8 rounded-md border border-[#D4AF37]/45 bg-[#121212] text-[#D4AF37] text-xs font-bold hover:bg-gradient-to-r hover:from-[#F3E5AB] hover:to-[#D4AF37] hover:text-black hover:border-[#D4AF37] hover:shadow-[0_0_10px_rgba(212,175,55,0.3)] transition-all duration-150 flex items-center justify-center';

                        if (status === 'booked') {
                          btnClasses =
                            'w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[#1A1A1A] border border-[#2A2A2A] text-gray-700 text-xs font-medium cursor-not-allowed flex items-center justify-center';
                        } else if (status === 'held') {
                          if (isMine) {
                            btnClasses =
                              'w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-gradient-to-br from-[#FFF6D6] to-[#D4AF37] border-2 border-[#F3E5AB] text-black font-black text-xs shadow-lg shadow-[#D4AF37]/40 scale-105 flex items-center justify-center';
                          } else {
                            btnClasses =
                              'w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-yellow-950/20 border border-yellow-900/30 text-yellow-700 text-xs cursor-not-allowed flex items-center justify-center';
                          }
                        } else if (isInvalidGroupAnchor) {
                          btnClasses =
                            'w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[#141414] border border-[#2A2A2A] text-gray-600 text-xs cursor-not-allowed opacity-70 flex items-center justify-center';
                        }

                        return (
                          <React.Fragment key={seatId}>
                            <button
                              type="button"
                              className={`seat-btn ${btnClasses}`}
                              onClick={() => handleSeatClick(seatId)}
                              onMouseEnter={() => setHoveredSeatId(seatId)}
                              onMouseLeave={() => setHoveredSeatId(null)}
                              disabled={status === 'booked' || (status === 'held' && !isMine) || isInvalidGroupAnchor}
                              title={isInvalidGroupAnchor
                                ? `Seat ${rowLabel}-${colNum} cannot fit ${requiredQuantity} seats together`
                                : `Seat ${rowLabel}-${colNum} | ${getSeatCategory(rowNum)} | ${flatPrice ? formatINR(flatPrice) : 'Standard'} | ${status}`}
                            >
                              <span>{colNum}</span>
                            </button>
                            {/* Center Aisle Gap */}
                            {isAisle && <div className="w-5 sm:w-8" />}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Right Row Letter */}
                    <span className="w-6 text-center text-xs font-bold text-gray-400 font-mono">
                      {rowLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend Bar (Available, Selected, Sold) */}
      <div className="bg-[#161616] border-t border-[#D4AF37]/10 px-4 py-3 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md border-2 border-[#D4AF37] bg-[#D4AF37]/10" />
          <span className="font-medium text-gray-300">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] flex items-center justify-center text-black font-extrabold text-[10px]">
            ✓
          </div>
          <span className="font-medium text-gray-300">Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#1A1A1A] border border-[#2A2A2A]" />
          <span className="font-medium text-gray-500">Sold</span>
        </div>
      </div>

      {/* Special Offer Banner */}
      <div className="bg-[#1A1A1A] border-t border-[#D4AF37]/10 px-4 py-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center shrink-0">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <span className="text-gray-300 font-medium line-clamp-1">
            <strong className="text-white font-bold">YES Private Debit Card Offer:</strong> Get 10% instant discount on 2+ tickets
          </span>
        </div>
        <span className="text-[10px] font-mono text-gray-500 uppercase shrink-0">1/3 Offers</span>
      </div>

      {/* Bottom Sticky Action / Price Bar */}
      {onProceedToCheckout && (
        <div className="bg-[#121212] border-t border-[#D4AF37]/15 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left space-y-0.5">
            <span className="text-[11px] text-gray-400 block font-medium">
              {localHeldSeats.length > 0
                ? `Selected Seats: ${localHeldSeats
                    .map((s) => {
                      const parts = s.split('-');
                      const r = String.fromCharCode(64 + parseInt(parts[0].replace('R', ''), 10));
                      const c = parts[1].replace('C', '');
                      return `${r}-${c}`;
                    })
                    .join(', ')}`
                : `Please pick ${requiredQuantity} seat(s)`}
            </span>
            <div className="flex items-baseline gap-2 justify-center sm:justify-start">
              <span className="text-xs text-gray-400">Total Price:</span>
              <span className="font-heading font-extrabold text-2xl text-[#D4AF37]">
                {formatINR(totalPrice || ticketTiers[0]?.price * requiredQuantity || 0)}
              </span>
            </div>
          </div>

          <button
            onClick={onProceedToCheckout}
            disabled={localHeldSeats.length < requiredQuantity}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl transition-all ${
              localHeldSeats.length >= requiredQuantity
                ? 'bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] hover:brightness-110 text-black shadow-[#D4AF37]/20 border border-[#F3E5AB]/30 cursor-pointer scale-100 hover:scale-[1.02]'
                : 'bg-[#1A1A1A] border border-[#2A2A2A] text-gray-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Ticket className="w-5 h-5 stroke-[2.5]" />
            <span>Pay {formatINR(totalPrice || ticketTiers[0]?.price * requiredQuantity || 0)}</span>
          </button>
        </div>
      )}

    </div>
  );
};
