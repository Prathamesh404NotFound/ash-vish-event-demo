import React, { useState, useCallback } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  Ticket,
  Users,
  Plus,
  Trash2,
  Edit,
  Camera,
  CheckCircle,
  AlertTriangle,
  Download,
  Search,
  X,
  Sparkles,
  MoreVertical,
} from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { EventItem, EventCategory } from '../types';
import { EventEditor } from '../components/admin/EventEditor';
import { RowActions } from '../components/admin/RowActions';
import { safeFetch } from '../lib/api';
import { authenticatedApiHeaders } from '../lib/authHeaders';

export const AdminPage: React.FC = () => {
  const { events, myTickets, addEvent, updateEvent, deleteEvent, scanTicketQR, showToast } = useBooking();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'scanner' | 'bookings'>('dashboard');
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editorEvent, setEditorEvent] = useState<EventItem | null>(null);

  // Scanner state
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    ticket?: any;
  } | null>(null);

  // Attendees table search
  const [attendeeSearch, setAttendeeSearch] = useState('');

  // Event Editor (full CRUD — create + edit)
  const openEditorCreate = () => {
    setEditorEvent(null);
    setEditorMode('create');
  };
  const openEditorEdit = (evt: EventItem) => {
    setEditorEvent(evt);
    setEditorMode('edit');
  };
  const closeEditor = () => {
    setEditorEvent(null);
    setEditorMode(null);
  };
  const handleSaveEvent = async (
    draft: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>
  ): Promise<void> => {
    if (editorMode === 'edit' && editorEvent) {
      // Preserve id, rating seed and review count from the existing record.
      await updateEvent({
        ...editorEvent,
        ...draft,
        id: editorEvent.id,
        rating: editorEvent.rating,
        reviewsCount: editorEvent.reviewsCount,
      });
    } else {
      await addEvent({
        ...draft,
        rating: 5.0,
        reviewsCount: 0,
      });
    }
  };

  // Duplicate an existing event (deep clone with a fresh id)
  const handleDuplicateEvent = (evt: EventItem) => {
    setEditorEvent({
      ...JSON.parse(JSON.stringify({ ...evt, id: undefined })),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: `${evt.title} (Copy)`,
      status: 'draft',
      isFeatured: false,
      isTrending: false,
      isPopularThisWeek: false,
      clonedFrom: evt.id,
    });
    setEditorMode('edit');
  };

  const handleRunScan = async () => {
    if (!scanInput) return;
    const res = await scanTicketQR(scanInput);
    setScanResult(res);
  };

  const filteredBookings = myTickets.filter(
    (t) =>
      t.attendeeName.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
      t.ticketNumber.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
      t.eventTitle.toLowerCase().includes(attendeeSearch.toLowerCase())
  );

  // Delete ticket handler
  const handleDeleteTicket = useCallback(async (ticketId: string, ticketNumber: string) => {
    if (!window.confirm(`Permanently delete ticket ${ticketNumber}? This action cannot be undone.`)) return;
    try {
      const headers = await authenticatedApiHeaders();
      const res = await safeFetch<{ success: boolean; error?: string; message?: string }>(
        `/api/admin/tickets/${ticketId}`,
        { method: 'DELETE', headers }
      );
      if (res.ok && res.data?.success) {
        showToast(res.data.message || `Ticket ${ticketNumber} deleted.`, 'success');
        // Refresh the page to remove the deleted ticket
        window.location.reload();
      } else {
        showToast(res.data?.error || 'Could not delete ticket.', 'error');
      }
    } catch {
      showToast('Could not delete ticket.', 'error');
    }
  }, [showToast]);

  return (
    <div className="pb-16 pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
            ADMINISTRATIVE PORTAL
          </span>
          <h1 className="font-heading font-extrabold text-3xl text-white mt-1 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
            <span>Event Management Console</span>
          </h1>
        </div>

        {/* Console Nav Tabs */}
        <div className="flex p-1 rounded-xl bg-[#141414] border border-white/10">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'dashboard' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'events' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            Events ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'scanner' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            Gate Scanner
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'bookings' ? 'bg-[#D4AF37] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            Attendees
          </button>
        </div>
      </div>


      {/* ---------------- DASHBOARD TAB ---------------- */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in">
          
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Gross Revenue</span>
              <span className="font-heading font-extrabold text-3xl text-white block">$148,290</span>
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> +18.4% vs last month
              </span>
            </div>

            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Passes Issued</span>
              <span className="font-heading font-extrabold text-3xl text-[#D4AF37] block">1,842</span>
              <span className="text-xs text-gray-400">across 6 featured venues</span>
            </div>

            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Active Headliners</span>
              <span className="font-heading font-extrabold text-3xl text-white block">{events.length}</span>
              <span className="text-xs text-purple-400 font-semibold">100% Verified Venues</span>
            </div>

            <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Gate Scan Success Rate</span>
              <span className="font-heading font-extrabold text-3xl text-emerald-400 block">99.8%</span>
              <span className="text-xs text-gray-400">Zero fraud reported</span>
            </div>
          </div>

          {/* Recent Sales Activity Chart Placeholder */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#D4AF37]" />
              <span>Realtime Ticket Sales Velocity</span>
            </h3>

            {/* Stylized Sales Bar Chart */}
            <div className="h-48 w-full bg-[#1C1C1C] rounded-2xl p-6 flex items-end justify-between gap-3 border border-white/5">
              {[45, 68, 30, 95, 80, 110, 85, 130, 90, 145].map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div
                    className="w-full bg-gradient-to-t from-[#F3E5AB] to-[#D4AF37] rounded-t-lg transition-all duration-500 hover:brightness-125"
                    style={{ height: `${(val / 150) * 100}%` }}
                  />
                  <span className="text-[10px] text-gray-400 font-mono">D{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}


      {/* ---------------- EVENTS MANAGEMENT TAB ---------------- */}
      {activeTab === 'events' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h3 className="font-heading font-bold text-xl text-white">Live Events Inventory</h3>
            <button
              onClick={openEditorCreate}
              className="px-4 py-2.5 rounded-xl bg-[#D4AF37] text-black font-bold text-xs flex items-center gap-2 "
            >
              <Plus className="w-4 h-4" />
              <span>Create New Event</span>
            </button>
          </div>

          {/* Events Table */}
          <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#1C1C1C] text-gray-400 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-4">Event & Poster</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Date & Venue</th>
                  <th className="p-4">Price</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      {evt.posterUrl ? (
                        <img src={evt.posterUrl} alt={evt.title} className="w-12 h-14 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-14 rounded-lg bg-[#262626] border border-white/10 flex items-center justify-center shrink-0">
                          <Ticket className="w-5 h-5 text-white/30" />
                        </div>
                      )}
                      <div>
                        <span className="font-heading font-bold text-sm text-white block">{evt.title}</span>
                        <span className="text-gray-400">{evt.subtitle}</span>
                      </div>
                    </td>
                    <td className="p-4 capitalize font-semibold text-[#D4AF37]">{evt.category}</td>
                    <td className="p-4">
                      <span className="block font-semibold text-white">{evt.date}</span>
                      <span className="text-gray-400">{evt.venue}</span>
                    </td>
                    <td className="p-4 font-bold text-[#D4AF37]">${evt.startingPrice}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditorEdit(evt)}
                          title="Edit event (all fields)"
                          className="p-2 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicateEvent(evt)}
                          title="Duplicate event"
                          className="p-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${evt.title}"? This cannot be undone.`)) {
                              deleteEvent(evt.id);
                            }
                          }}
                          title="Delete event"
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ---------------- GATE SCANNER SIMULATION TAB ---------------- */}
      {activeTab === 'scanner' && (
        <div className="max-w-xl mx-auto space-y-6 animate-in fade-in">
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 space-y-6 text-center">
            
            <h3 className="font-heading font-bold text-2xl text-white flex items-center justify-center gap-2">
              <Camera className="w-6 h-6 text-[#D4AF37]" />
              <span>Gate Entrance Scanner</span>
            </h3>

            {/* Camera Viewfinder Box Animation */}
            <div className="relative aspect-square max-w-xs mx-auto rounded-2xl bg-black border-2 border-[#D4AF37] p-4 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-0 border-2 border-dashed border-[#D4AF37]/40 rounded-2xl animate-pulse" />
              <div className="absolute inset-x-0 h-0.5 bg-[#D4AF37] shadow-[0_0_15px_#D4AF37] top-1/2 animate-[bounce_2s_infinite]" />
              
              <Ticket className="w-12 h-12 text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 font-mono">Position QR Code Here</p>
            </div>

            {/* Test QR Code Buttons */}
            <div className="space-y-2 pt-2">
              <p className="text-xs text-gray-400">Quick Test QR Presets:</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setScanInput('AUR-8829-NYC')}
                  className="px-3 py-1.5 rounded-lg bg-[#1C1C1C] text-xs font-mono text-[#D4AF37] border border-white/10"
                >
                  AUR-8829-NYC (Valid)
                </button>
                <button
                  onClick={() => setScanInput('AUR-4412-LAX')}
                  className="px-3 py-1.5 rounded-lg bg-[#1C1C1C] text-xs font-mono text-gray-400 border border-white/10"
                >
                  AUR-4412-LAX (Already Used)
                </button>
              </div>
            </div>

            {/* Scan Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Ticket Number or QR Hash"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="flex-1 bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                onClick={handleRunScan}
                className="px-5 py-3 rounded-xl bg-[#D4AF37] text-black font-extrabold text-xs shadow-md"
              >
                Scan Ticket
              </button>
            </div>

            {/* Scan Result Feedback */}
            {scanResult && (
              <div
                className={`p-4 rounded-2xl border text-left text-xs space-y-2 ${
                  scanResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {scanResult.success ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  <span>{scanResult.message}</span>
                </div>
                {scanResult.ticket && (
                  <p className="text-gray-300">
                    Attendee: {scanResult.ticket.attendeeName} • Tier: {scanResult.ticket.tierName}
                  </p>
                )}
              </div>
            )}

          </div>
        </div>
      )}


      {/* ---------------- ATTENDEES TABLE TAB ---------------- */}
      {activeTab === 'bookings' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={attendeeSearch}
                onChange={(e) => setAttendeeSearch(e.target.value)}
                placeholder="Search attendees by name or ticket number..."
                className="w-full bg-[#141414] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <button
              onClick={() => alert('Attendees roster exported to CSV!')}
              className="px-4 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white font-semibold text-xs flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Roster CSV</span>
            </button>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#1C1C1C] text-gray-400 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-4">Ticket Ref</th>
                  <th className="p-4">Attendee Name</th>
                  <th className="p-4">Event Show</th>
                  <th className="p-4">Tier & Price</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono text-[#D4AF37] font-bold">{b.ticketNumber}</td>
                    <td className="p-4">
                      <span className="font-bold text-white block">{b.attendeeName}</span>
                      <span className="text-gray-400 text-[10px]">{b.attendeeEmail}</span>
                    </td>
                    <td className="p-4 font-semibold text-white">{b.eventTitle}</td>
                    <td className="p-4">
                      <span className="block text-white font-semibold">{b.tierName}</span>
                      <span className="text-gray-400">${b.totalPaid}</span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          b.status === 'valid'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-gray-500/10 text-gray-400'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <RowActions
                        closeKey={b.id}
                        actions={[
                          {
                            label: 'Delete Ticket',
                            icon: <Trash2 className="w-4 h-4" />,
                            onClick: () => handleDeleteTicket(b.id, b.ticketNumber),
                            variant: 'danger',
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full event editor (create + edit + duplicate) */}
      {editorMode && (
        <EventEditor
          mode={editorMode}
          existing={editorEvent}
          onSave={handleSaveEvent}
          onClose={closeEditor}
        />
      )}
    </div>
  );
};
