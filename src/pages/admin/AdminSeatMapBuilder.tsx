import React, { useState, useEffect } from 'react';
import {
  Armchair,
  Plus,
  Trash2,
  Save,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Layers,
  DollarSign,
  Grid,
  RefreshCw,
  Eye,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { ref, get } from 'firebase/database';
import { rtdb, auth } from '../../lib/firebase';
import { useBooking } from '../../contexts/BookingContext';
import { EventItem, SeatMapConfig, SeatNode, SeatSection } from '../../types';
import { formatINR } from '../../utils/formatters';
import { safeFetch } from '../../lib/api';

interface SectionInput {
  id: string;
  name: string;
  price: number;
  rowsCount: number;
  seatsPerRow: number;
  color: string;
}

export const AdminSeatMapBuilder: React.FC = () => {
  const { events, updateEvent } = useBooking();

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];

  // Config State
  const [sections, setSections] = useState<SectionInput[]>([
    {
      id: 'sec_vip',
      name: 'VIP Recliner Zone',
      price: 3999,
      rowsCount: 2,
      seatsPerRow: 8,
      color: '#D4AF37', // Gold
    },
    {
      id: 'sec_gen',
      name: 'General Floor',
      price: 1499,
      rowsCount: 4,
      seatsPerRow: 10,
      color: '#3B82F6', // Blue
    },
  ]);

  const [aisleAfterCol, setAisleAfterCol] = useState<number>(5);
  const [blockedSeats, setBlockedSeats] = useState<string[]>([]);
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // Statuses
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize selected event ID
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Load existing seatmap config if event changes
  useEffect(() => {
    if (!selectedEvent) return;

    if (selectedEvent.seatMap?.sections && selectedEvent.seatMap.sections.length > 0) {
      setSections(
        selectedEvent.seatMap.sections.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          rowsCount: s.rowsCount,
          seatsPerRow: s.seatsPerRow,
          color: s.color || '#D4AF37',
        }))
      );
    }

    // Load RTDB seat nodes if present
    const loadSeatsFromDb = async () => {
      try {
        const seatsRef = ref(rtdb, `seats/${selectedEvent.id}`);
        const snapshot = await get(seatsRef);
        if (snapshot.exists()) {
          const val = snapshot.val() as Record<string, SeatNode>;
          const blocked: string[] = [];
          const prices: Record<string, number> = {};
          Object.entries(val).forEach(([sId, node]) => {
            if (node.status === 'booked') {
              blocked.push(sId);
            }
            if (node.price) {
              prices[sId] = node.price;
            }
          });
          setBlockedSeats(blocked);
          setCustomPrices(prices);
        }
      } catch (err) {
        console.warn('Load seatmap error:', err);
      }
    };

    loadSeatsFromDb();
  }, [selectedEventId]);

  // Section manipulators
  const handleAddSection = () => {
    const newId = 'sec_' + Date.now();
    const colors = ['#10B981', '#8B5CF6', '#EC4899', '#F59E0B', '#6366F1'];
    const randomColor = colors[sections.length % colors.length];

    setSections((prev) => [
      ...prev,
      {
        id: newId,
        name: `Section ${String.fromCharCode(65 + prev.length)}`,
        price: 1999,
        rowsCount: 3,
        seatsPerRow: 8,
        color: randomColor,
      },
    ]);
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length <= 1) {
      alert('At least one seat section is required.');
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSection = (id: string, field: keyof SectionInput, val: any) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  // Preset Layout Generators
  const applyPresetLayout = (preset: 'cinema' | 'stadium' | 'intimate') => {
    if (preset === 'cinema') {
      setSections([
        {
          id: 'sec_recliner',
          name: 'VIP Recliner',
          price: 2499,
          rowsCount: 2,
          seatsPerRow: 8,
          color: '#D4AF37',
        },
        {
          id: 'sec_prime',
          name: 'Prime Seats',
          price: 1299,
          rowsCount: 4,
          seatsPerRow: 10,
          color: '#10B981',
        },
        {
          id: 'sec_classic',
          name: 'Classic Ground',
          price: 799,
          rowsCount: 3,
          seatsPerRow: 10,
          color: '#3B82F6',
        },
      ]);
      setAisleAfterCol(5);
    } else if (preset === 'stadium') {
      setSections([
        {
          id: 'sec_platinum',
          name: 'Platinum Pavilion',
          price: 4999,
          rowsCount: 3,
          seatsPerRow: 12,
          color: '#8B5CF6',
        },
        {
          id: 'sec_gold',
          name: 'Gold Tier',
          price: 2999,
          rowsCount: 5,
          seatsPerRow: 12,
          color: '#F59E0B',
        },
        {
          id: 'sec_silver',
          name: 'Silver Gallery',
          price: 1499,
          rowsCount: 6,
          seatsPerRow: 12,
          color: '#64748B',
        },
      ]);
      setAisleAfterCol(6);
    } else {
      setSections([
        {
          id: 'sec_front',
          name: 'Front Row Experience',
          price: 1999,
          rowsCount: 2,
          seatsPerRow: 6,
          color: '#EC4899',
        },
        {
          id: 'sec_main',
          name: 'Main Auditorium',
          price: 999,
          rowsCount: 4,
          seatsPerRow: 8,
          color: '#3B82F6',
        },
      ]);
      setAisleAfterCol(4);
    }
  };

  // Toggle single seat status (blocked/available)
  const handleToggleSeatBlock = (seatId: string) => {
    setBlockedSeats((prev) =>
      prev.includes(seatId) ? prev.filter((s) => s !== seatId) : [...prev, seatId]
    );
  };

  // Compute total layout metrics
  const calculateMetrics = () => {
    let totalSeats = 0;
    let totalRevenue = 0;

    sections.forEach((sec) => {
      const seatsInSec = sec.rowsCount * sec.seatsPerRow;
      totalSeats += seatsInSec;
      totalRevenue += seatsInSec * sec.price;
    });

    const blockedCount = blockedSeats.length;
    const availableCount = Math.max(0, totalSeats - blockedCount);

    return { totalSeats, availableCount, blockedCount, totalRevenue };
  };

  const metrics = calculateMetrics();

  // Save & Deploy Seat Map to Realtime Database
  const handleDeploySeatMap = async () => {
    if (!selectedEvent) return;

    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      // 1. Construct seat map configuration for the event
      let totalRows = 0;
      let maxCols = 0;
      const tierByRow: Record<string, string> = {};
      const seatNodesObject: Record<string, SeatNode> = {};

      let currentRowIndex = 1;

      const formattedSections: SeatSection[] = sections.map((sec) => {
        const startRow = currentRowIndex;
        const endRow = currentRowIndex + sec.rowsCount - 1;

        tierByRow[`${startRow}-${endRow}`] = sec.name;

        if (sec.seatsPerRow > maxCols) {
          maxCols = sec.seatsPerRow;
        }

        // Generate individual seat nodes for this section
        for (let r = 0; r < sec.rowsCount; r++) {
          const rowNum = currentRowIndex + r;
          const rowLabel = String.fromCharCode(64 + rowNum);

          for (let c = 1; c <= sec.seatsPerRow; c++) {
            const seatId = `R${rowNum}-C${c}`;
            const isBlocked = blockedSeats.includes(seatId);
            const price = customPrices[seatId] || sec.price;

            seatNodesObject[seatId] = {
              id: seatId,
              seatId,
              section: sec.name,
              row: rowLabel,
              col: c,
              number: c,
              price,
              status: isBlocked ? 'booked' : 'available',
            };
          }
        }

        currentRowIndex += sec.rowsCount;
        return {
          id: sec.id,
          name: sec.name,
          color: sec.color,
          price: sec.price,
          rowsCount: sec.rowsCount,
          seatsPerRow: sec.seatsPerRow,
          startRowIndex: startRow,
        };
      });

      totalRows = currentRowIndex - 1;

      const seatMapConfig: SeatMapConfig = {
        rows: totalRows,
        cols: maxCols,
        aisleAfterCols: [aisleAfterCol],
        tierByRow,
        sections: formattedSections,
      };

      // 2. Deploy through the authenticated server; the browser has read-only
      // access to the public seat projection under the locked RTDB rules.
      let authorization = '';
      if (auth.currentUser) {
        authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }
      const deployResponse = await safeFetch<any>(`/api/events/${encodeURIComponent(selectedEvent.id)}/seats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({
          seatNodes: seatNodesObject,
          seatMap: seatMapConfig,
          totalCapacity: metrics.totalSeats,
        }),
      });
      if (!deployResponse.ok || !deployResponse.data?.success) {
        throw new Error(deployResponse.data?.error || deployResponse.error || 'Seat map deployment was rejected.');
      }

      // 3. Refresh the local event projection from the protected event API.
      const updatedEvent: EventItem = {
        ...selectedEvent,
        totalCapacity: metrics.totalSeats,
        seatMap: seatMapConfig,
      };

      await updateEvent(updatedEvent);

      setSuccessMsg(
        `Seat map deployed live! Generated ${metrics.totalSeats} seats across ${sections.length} sections for "${selectedEvent.title}".`
      );
    } catch (err: any) {
      console.error('Failed to deploy seat map:', err);
      setErrorMsg(err?.message || 'Failed to deploy seat map to Realtime Database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#141414] via-[#1C1C1C] to-[#121212] border border-[#D4AF37]/20 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[10px] font-black tracking-widest uppercase">
            Seat Management Engine
          </span>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-white mt-1">
            Event Seat-Map Builder
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-xl">
            Configure seating sections, row quantities, seat numbers, and tier pricing. Deploys directly to Realtime Database.
          </p>
        </div>

        {/* Deploy Button */}
        <button
          onClick={handleDeploySeatMap}
          disabled={isSaving || !selectedEvent}
          className="py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2.5 shadow-xl shadow-[#D4AF37]/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 stroke-[3]" />}
          <span>{isSaving ? 'Deploying...' : 'Deploy Seat Map to RTDB'}</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Event Selection & Layout Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls & Sections Setup */}
        <div className="lg:col-span-5 space-y-6">
          {/* Target Event Picker Card */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
            <h3 className="font-heading font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#D4AF37]" />
              <span>Target Event Selection</span>
            </h3>

            <div>
              <label className="text-xs text-gray-400 font-bold block mb-1">Select Event to Assign Seatmap</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#D4AF37]"
              >
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.city} • {e.date})
                  </option>
                ))}
              </select>
            </div>

            {/* Layout Preset Buttons */}
            <div className="pt-2">
              <span className="text-[10px] text-gray-400 uppercase font-bold block mb-2">Quick Presets</span>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetLayout('cinema')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  🎬 Cinema Hall
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetLayout('stadium')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  🏟️ Stadium
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetLayout('intimate')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  🎭 Theatre
                </button>
              </div>
            </div>
          </div>

          {/* Section & Block Definition List */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="font-heading font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <span>Seating Sections ({sections.length})</span>
              </h3>
              <button
                type="button"
                onClick={handleAddSection}
                className="py-1.5 px-3 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Section</span>
              </button>
            </div>

            {/* Aisle configuration */}
            <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2 p-3 rounded-2xl bg-[#1C1C1C] border border-white/5 text-xs">
              <span className="text-gray-300 font-bold">Center Aisle Gap After Column</span>
              <input
                type="number"
                min={1}
                max={20}
                value={aisleAfterCol}
                onChange={(e) => setAisleAfterCol(Number(e.target.value))}
                className="w-16 bg-[#121212] border border-white/10 rounded-lg px-2 py-1 text-center font-bold text-white"
              />
            </div>

            {/* List of sections */}
            <div className="space-y-4">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className="p-4 rounded-2xl bg-[#1A1A1A] border border-white/10 space-y-3 relative group"
                  style={{ borderLeftColor: sec.color, borderLeftWidth: '4px' }}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: sec.color }}
                      />
                      <span className="font-extrabold text-white text-xs">Section #{idx + 1}</span>
                    </div>

                    {sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(sec.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 text-xs">
                    <div className="min-[420px]:col-span-2">
                      <label className="text-gray-400 text-[10px] font-bold block mb-1">Section Title</label>
                      <input
                        type="text"
                        value={sec.name}
                        onChange={(e) => handleUpdateSection(sec.id, 'name', e.target.value)}
                        className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-[10px] font-bold block mb-1">Price per Seat (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={sec.price}
                        onChange={(e) => handleUpdateSection(sec.id, 'price', Number(e.target.value))}
                        className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-emerald-400 font-extrabold"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-[10px] font-bold block mb-1">Accent Color</label>
                      <input
                        type="color"
                        value={sec.color}
                        onChange={(e) => handleUpdateSection(sec.id, 'color', e.target.value)}
                        className="w-full h-8 bg-[#121212] border border-white/10 rounded-lg p-0.5 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-[10px] font-bold block mb-1">Number of Rows</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={sec.rowsCount}
                        onChange={(e) => handleUpdateSection(sec.id, 'rowsCount', Number(e.target.value))}
                        className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-[10px] font-bold block mb-1">Seats per Row</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={sec.seatsPerRow}
                        onChange={(e) => handleUpdateSection(sec.id, 'seatsPerRow', Number(e.target.value))}
                        className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Seat Map Canvas & Metrics */}
        <div className="lg:col-span-7 space-y-6">
          {/* Layout Summary Bar */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-4 gap-3 bg-[#141414] border border-white/10 p-3 sm:p-4 rounded-3xl">
            <div className="p-3 rounded-2xl bg-[#1C1C1C]">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Total Seats</span>
              <span className="font-heading font-black text-lg text-white">{metrics.totalSeats}</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#1C1C1C]">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Available</span>
              <span className="font-heading font-black text-lg text-emerald-400">{metrics.availableCount}</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#1C1C1C]">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Blocked/Hold</span>
              <span className="font-heading font-black text-lg text-amber-400">{metrics.blockedCount}</span>
            </div>
            <div className="p-3 rounded-2xl bg-[#1C1C1C]">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Gross Capacity</span>
              <span className="font-heading font-black text-lg text-[#D4AF37] truncate">
                {formatINR(metrics.totalRevenue)}
              </span>
            </div>
          </div>

          {/* Seat Map Visual Canvas */}
          <div className="bg-[#121212] border border-[#D4AF37]/20 rounded-3xl p-3 sm:p-6 space-y-6 shadow-2xl relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] text-[#D4AF37] font-mono uppercase tracking-widest block">
                  Interactive Live Layout Canvas
                </span>
                <h3 className="font-heading font-bold text-base text-white">
                  {selectedEvent?.title || 'Event Seat Layout'}
                </h3>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Click seat to toggle block status</span>
            </div>

            {/* Stage Arc Header */}
            <div className="relative w-full max-w-md mx-auto text-center space-y-1 py-2">
              <div className="h-2 w-full border-t-2 border-[#D4AF37]/50 rounded-[100%] shadow-[0_-8px_20px_rgba(212,175,55,0.3)] bg-gradient-to-b from-[#D4AF37]/10 to-transparent" />
              <p className="text-[9px] uppercase font-bold tracking-[0.25em] text-[#D4AF37]/80 pt-0.5 font-heading">
                STAGE / SCREEN THIS WAY
              </p>
            </div>

            {/* Sections Canvas View */}
            <div className="overflow-x-auto py-4">
              <div className="min-w-[400px] flex flex-col items-center space-y-6">
                {(() => {
                  let overallRowCounter = 1;

                  return sections.map((sec) => {
                    const startRowForSection = overallRowCounter;
                    const sectionRows = Array.from({ length: sec.rowsCount });
                    overallRowCounter += sec.rowsCount;

                    return (
                      <div key={sec.id} className="w-full flex flex-col items-center space-y-2">
                        {/* Section Header */}
                        <div
                          className="w-full py-1.5 px-3 rounded-xl border flex items-center justify-between text-xs font-bold"
                          style={{
                            backgroundColor: `${sec.color}15`,
                            borderColor: `${sec.color}40`,
                            color: sec.color,
                          }}
                        >
                          <span className="font-heading uppercase tracking-wider">{sec.name}</span>
                          <span>{formatINR(sec.price)} / seat</span>
                        </div>

                        {/* Rows */}
                        {sectionRows.map((_, rIdx) => {
                          const rowNum = startRowForSection + rIdx;
                          const rowLabel = String.fromCharCode(64 + rowNum);

                          return (
                            <div key={rowNum} className="flex items-center gap-2">
                              <span className="w-5 text-center text-[10px] font-bold text-gray-400 font-mono">
                                {rowLabel}
                              </span>

                              <div className="flex items-center gap-1.5">
                                {Array.from({ length: sec.seatsPerRow }).map((_, cIdx) => {
                                  const colNum = cIdx + 1;
                                  const seatId = `R${rowNum}-C${colNum}`;
                                  const isBlocked = blockedSeats.includes(seatId);
                                  const isAisle = colNum === aisleAfterCol;

                                  return (
                                    <React.Fragment key={seatId}>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSeatBlock(seatId)}
                                        title={`Row ${rowLabel}, Seat ${colNum} (${isBlocked ? 'Blocked' : 'Available'})`}
                                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                                          isBlocked
                                            ? 'bg-red-500/20 border border-red-500/40 text-red-400 line-through'
                                            : 'border bg-[#181818] text-white hover:scale-110'
                                        }`}
                                        style={{
                                          borderColor: isBlocked ? undefined : `${sec.color}60`,
                                        }}
                                      >
                                        <span>{colNum}</span>
                                      </button>
                                      {isAisle && <div className="w-4" />}
                                    </React.Fragment>
                                  );
                                })}
                              </div>

                              <span className="w-5 text-center text-[10px] font-bold text-gray-400 font-mono">
                                {rowLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Legend Footer */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-[11px] text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-[#D4AF37] bg-[#181818]" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500/20 border border-red-500/40" />
                <span>Blocked / Unavailable</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
