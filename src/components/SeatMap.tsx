import React, { useState, useEffect } from 'react';
import { ref, onValue, runTransaction, onDisconnect } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { SeatMapConfig, SeatNode, TicketTier } from '../types';
import { formatINR } from '../utils/formatters';
import { Armchair, CheckCircle, AlertCircle, Sparkles, Clock, Ticket, ShieldCheck, Tag, Info } from 'lucide-react';

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
  const [selectedShowtime, setSelectedShowtime] = useState<string>(eventTime);
  const [holdTimeLeft, setHoldTimeLeft] = useState<number>(600);
  const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null);

  // States and refs for pinch-to-zoom and pan interactions
  const hasDraggedRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startPanRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartScale, setTouchStartScale] = useState<number>(1);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(2.5, prev + 0.15));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.15));
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only track left click / primary touch
    
    const target = e.target as HTMLElement;
    if (target.closest('.zoom-ctrl')) {
      return; // Do not drag on zooming controls
    }

    setIsDragging(true);
    hasDraggedRef.current = false;
    startPanRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };

    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const dx = e.clientX - startPanRef.current.x;
    const dy = e.clientY - startPanRef.current.y;

    const moveThreshold = 6;
    const initialDx = e.clientX - (startPanRef.current.x + position.x);
    const initialDy = e.clientY - (startPanRef.current.y + position.y);
    if (Math.hypot(initialDx, initialDy) > moveThreshold) {
      hasDraggedRef.current = true;
    }

    setPosition({ x: dx, y: dy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    if (containerRef.current) {
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Safe check
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      setIsDragging(false);
      hasDraggedRef.current = true;

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      setTouchStartDist(dist);
      setTouchStartScale(scale);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const newScale = Math.max(0.5, Math.min(2.5, (dist / touchStartDist) * touchStartScale));
      setScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartDist(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Zoom on scroll
    e.stopPropagation();
    const zoomFactor = 0.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    setScale((prev) => Math.max(0.5, Math.min(2.5, prev + direction * zoomFactor)));
  };

  // Sync external props with local state
  useEffect(() => {
    setLocalHeldSeats(selectedSeatIds);
  }, [selectedSeatIds]);

  // Hold Countdown timer for user's selected seats
  useEffect(() => {
    if (localHeldSeats.length === 0) return;

    const timer = setInterval(() => {
      setHoldTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          localHeldSeats.forEach((seatId) => {
            const seatRef = ref(rtdb, `seats/${eventId}/${seatId}`);
            runTransaction(seatRef, (seat) => {
              if (seat && seat.heldBy === currentUserId) {
                return { ...seat, status: 'available', heldBy: null, heldAt: null, holdExpiresAt: null };
              }
              return seat;
            }).catch(console.warn);
          });
          setLocalHeldSeats([]);
          onSeatsSelected([]);
          setErrorMsg('10-minute hold time expired. Please re-select your seats.');
          return 600;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [localHeldSeats, eventId, currentUserId]);

  // Realtime subscription to seat nodes for this event
  useEffect(() => {
    const seatsRef = ref(rtdb, `seats/${eventId}`);
    const unsubscribe = onValue(seatsRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as Record<string, SeatNode>;
        const now = Date.now();
        const cleaned: Record<string, SeatNode> = {};
        Object.entries(val).forEach(([seatId, node]) => {
          const expiresAt = node.holdExpiresAt || (node.heldAt ? node.heldAt + HOLD_EXPIRY_MS : 0);
          if (node.status === 'held' && expiresAt && now > expiresAt) {
            cleaned[seatId] = { ...node, status: 'available', heldBy: undefined, heldAt: undefined, holdExpiresAt: undefined };
          } else {
            cleaned[seatId] = node;
          }
        });
        setDbSeats(cleaned);
      } else {
        setDbSeats({});
      }
    });

    return () => unsubscribe();
  }, [eventId]);

  const getSeatStatus = (seatId: string): { status: 'available' | 'held' | 'booked'; isMine: boolean } => {
    const node = dbSeats[seatId];
    if (!node) {
      if (localHeldSeats.includes(seatId)) return { status: 'held', isMine: true };
      return { status: 'available', isMine: false };
    }

    if (node.status === 'held') {
      const now = Date.now();
      const expiresAt = node.holdExpiresAt || (node.heldAt ? node.heldAt + HOLD_EXPIRY_MS : 0);
      if (expiresAt && now > expiresAt) {
        return { status: 'available', isMine: false };
      }
      const isMine = node.heldBy === currentUserId || localHeldSeats.includes(seatId);
      return { status: 'held', isMine };
    }

    return { status: node.status, isMine: false };
  };

  const handleSeatClick = async (seatId: string) => {
    if (hasDraggedRef.current) {
      return;
    }
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

    if (isAlreadySelected) {
      // Release seat
      const updated = localHeldSeats.filter((id) => id !== seatId);
      setLocalHeldSeats(updated);
      onSeatsSelected(updated);

      // Release in RTDB via transaction
      try {
        const seatRef = ref(rtdb, `seats/${eventId}/${seatId}`);
        await runTransaction(seatRef, (seat) => {
          if (seat && seat.heldBy === currentUserId) {
            return { ...seat, status: 'available', heldBy: null, heldAt: null, holdExpiresAt: null };
          }
          return seat;
        });
      } catch (e) {
        console.warn('Seat release transaction note:', e);
      }
    } else {
      // Select new seat
      if (localHeldSeats.length >= requiredQuantity) {
        setErrorMsg(`You can select up to ${requiredQuantity} seat(s). Unselect a seat to pick another.`);
        return;
      }

      // Claim seat via RTDB Transaction
      const seatRef = ref(rtdb, `seats/${eventId}/${seatId}`);
      let claimedSuccess = false;

      try {
        const res = await runTransaction(seatRef, (seatData) => {
          const now = Date.now();
          const expiresAt = seatData?.holdExpiresAt || (seatData?.heldAt ? seatData.heldAt + HOLD_EXPIRY_MS : 0);
          const isExpired = expiresAt > 0 && now > expiresAt;

          if (!seatData || seatData.status === 'available' || (seatData.status === 'held' && isExpired)) {
            const rowNum = typeof seatData?.row === 'number' ? seatData.row : parseInt(seatId.split('-')[0].replace('R', ''), 10) || 1;
            const colNum = typeof seatData?.col === 'number' ? seatData.col : parseInt(seatId.split('-')[1].replace('C', ''), 10) || 1;
            return {
              ...seatData,
              id: seatId,
              seatId,
              row: rowNum,
              col: colNum,
              status: 'held',
              heldBy: currentUserId,
              heldAt: now,
              holdExpiresAt: now + HOLD_EXPIRY_MS,
            };
          }
          return undefined; // Abort transaction if seat already taken
        });

        if (res.committed) {
          claimedSuccess = true;

          // Add onDisconnect handler to release seat if connection breaks
          try {
            onDisconnect(seatRef).update({
              status: 'available',
              heldBy: null,
              heldAt: null,
              holdExpiresAt: null,
            });
          } catch (discErr) {
            // Ignore if offline
          }
        }
      } catch (e) {
        console.warn('Realtime database transaction fallback:', e);
        claimedSuccess = true;
      }

      if (claimedSuccess) {
        const updated = [...localHeldSeats, seatId];
        setLocalHeldSeats(updated);
        onSeatsSelected(updated);
        setHoldTimeLeft(600);
      } else {
        setErrorMsg('Seat was just claimed by another user! Please select a different seat.');
      }
    }
  };

  const getRowTierInfo = (rowIndex: number): { name: string; price?: number } => {
    let name = '';
    for (const [rowRange, tierName] of Object.entries(tierByRow)) {
      const parts = rowRange.split('-').map((p) => parseInt(p, 10));
      if (parts.length === 2 && rowIndex >= parts[0] && rowIndex <= parts[1]) {
        name = tierName as string;
        break;
      }
    }

    if (!name) return { name: 'STANDARD' };

    // Find price from ticketTiers matching name or id
    const foundTier = ticketTiers.find(
      (t) => t.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(t.name.toLowerCase())
    );

    return {
      name,
      price: foundTier?.price,
    };
  };

  // Compute calculated price for selected seats
  const calculateTotalPrice = (): number => {
    if (localHeldSeats.length === 0) return 0;
    let total = 0;
    localHeldSeats.forEach((seatId) => {
      const rowNum = parseInt(seatId.split('-')[0].replace('R', ''), 10) || 1;
      const tierInfo = getRowTierInfo(rowNum);
      if (tierInfo.price) {
        total += tierInfo.price;
      } else if (ticketTiers.length > 0) {
        total += ticketTiers[0].price;
      }
    });
    return total;
  };

  const totalPrice = calculateTotalPrice();

  // Showtimes pill choices
  const showtimes = [
    { time: eventTime || '07:30 PM', tag: 'PXL' },
    { time: '04:00 PM', tag: '4K HIGH DEFINITION' },
    { time: '09:30 PM', tag: 'IMAX 3D' },
  ];

  return (
    <div className="bg-[#121212] border border-[#D4AF37]/20 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in space-y-0">
      
      {/* Top Showtime Bar (Cinema BookMyShow Style) */}
      <div className="bg-[#1A1A1A] border-b border-[#D4AF37]/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-white text-sm sm:text-base tracking-wide">
                {eventDate}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#F3E5AB] text-[11px] font-bold border border-[#D4AF37]/30">
                {requiredQuantity} {requiredQuantity === 1 ? 'Ticket' : 'Tickets'}
              </span>
            </div>
            <p className="text-xs text-gray-400">Select seats for showtime below</p>
          </div>
        </div>

        {/* Showtime Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {showtimes.map((st, i) => {
            const isSelected = selectedShowtime === st.time;
            return (
              <button
                key={i}
                onClick={() => setSelectedShowtime(st.time)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all whitespace-nowrap flex flex-col items-center ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] border-[#D4AF37] text-black shadow-md shadow-[#D4AF37]/20'
                    : 'bg-[#121212] border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                }`}
              >
                <span>{st.time}</span>
                <span className={`text-[9px] font-mono uppercase ${isSelected ? 'text-black/80' : 'text-[#D4AF37]/80'}`}>
                  {st.tag}
                </span>
              </button>
            );
          })}
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
      <div className="mx-4 sm:mx-8 my-2 px-4 py-2.5 bg-[#161616] border border-[#D4AF37]/20 rounded-xl flex items-center justify-between min-h-[42px] text-xs shadow-inner">
        {hoveredSeatId ? (() => {
          const rNum = parseInt(hoveredSeatId.split('-')[0].replace('R', ''), 10);
          const cNum = parseInt(hoveredSeatId.split('-')[1].replace('C', ''), 10);
          const rLab = String.fromCharCode(64 + rNum);
          const tier = getRowTierInfo(rNum);
          const { status, isMine } = getSeatStatus(hoveredSeatId);
          const statusText = status === 'booked' ? 'Sold / Booked' : status === 'held' ? (isMine ? 'Selected by You' : 'Held by Another') : 'Available';
          const statusColor = status === 'booked' ? 'text-red-400' : status === 'held' ? (isMine ? 'text-yellow-300' : 'text-orange-400') : 'text-emerald-400';

          return (
            <div className="flex items-center justify-between w-full animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"></span>
                <span className="font-heading font-extrabold text-white text-xs sm:text-sm">Seat {rLab}-{cNum}</span>
                <span className="text-gray-500">|</span>
                <span className="text-[#F3E5AB] font-semibold">{tier.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-extrabold text-[#D4AF37] text-sm">{tier.price ? formatINR(tier.price) : 'Standard'}</span>
                <span className={`font-bold ${statusColor}`}>● {statusText}</span>
              </div>
            </div>
          );
        })() : (
          <div className="flex items-center gap-2 text-gray-400 w-full justify-center">
            <Info className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>Hover over any seat to inspect category, tier pricing, and real-time availability.</span>
          </div>
        )}
      </div>

      {/* Main Cinema Seating Grid with Pinch-to-Zoom & Pan Viewport */}
      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        className="relative h-[380px] sm:h-[480px] overflow-hidden bg-[#0A0A0A] border-y border-[#D4AF37]/15 touch-none cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
      >
        {/* Floating Zoom and Pan HUD Controls */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 zoom-ctrl">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-9 h-9 rounded-lg bg-[#161616]/95 border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/25 flex items-center justify-center font-bold text-lg shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-9 h-9 rounded-lg bg-[#161616]/95 border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/25 flex items-center justify-center font-bold text-lg shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer"
            title="Zoom Out"
          >
            −
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2 py-1.5 rounded-lg bg-[#161616]/95 border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/25 flex items-center justify-center font-extrabold text-[9px] tracking-wider uppercase shadow-lg backdrop-blur-md active:scale-95 transition-all cursor-pointer"
            title="Reset View"
          >
            1:1
          </button>
        </div>

        {/* Small Interaction Help Banner */}
        <div className="absolute bottom-3 left-4 z-20 pointer-events-none bg-black/60 px-3 py-1.5 rounded-full border border-[#D4AF37]/10 text-[10px] text-gray-400 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Pinch / Scroll to zoom • Drag to pan map</span>
        </div>

        {/* The Scalable/Pannable Seating Grid Board */}
        <div 
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          className="w-full flex flex-col items-center p-4 select-none"
        >
          <div className="min-w-[480px] max-w-3xl mx-auto flex flex-col items-center space-y-6">
            {Array.from({ length: rows }).map((_, rIdx) => {
              const rowNum = rIdx + 1;
              const rowLabel = String.fromCharCode(64 + rowNum); // A, B, C...
              const tierInfo = getRowTierInfo(rowNum);

              const isSectionStart =
                rIdx === 0 || getRowTierInfo(rIdx).name !== tierInfo.name;

              return (
                <div key={rowNum} className="w-full flex flex-col items-center">
                  {/* Section Pricing Header (e.g. Rs.570 RECLINER / Rs.350 PRIME) */}
                  {isSectionStart && (
                    <div className="w-full pt-4 pb-2 mb-2 border-b border-[#D4AF37]/15 flex items-center justify-start gap-2">
                      <span className="font-heading font-extrabold text-xs sm:text-sm tracking-wider text-[#F3E5AB] uppercase">
                        {tierInfo.price ? `Rs.${tierInfo.price}` : ''} {tierInfo.name}
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
                        }

                        return (
                          <React.Fragment key={seatId}>
                            <button
                              type="button"
                              onClick={() => handleSeatClick(seatId)}
                              onMouseEnter={() => setHoveredSeatId(seatId)}
                              onMouseLeave={() => setHoveredSeatId(null)}
                              disabled={status === 'booked' || (status === 'held' && !isMine)}
                              title={`Seat ${rowLabel}-${colNum} | ${tierInfo.name} | ${tierInfo.price ? formatINR(tierInfo.price) : 'Standard'} | ${status}`}
                              className={btnClasses}
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
