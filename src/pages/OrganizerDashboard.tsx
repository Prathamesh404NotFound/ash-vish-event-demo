import React, { useState } from 'react';
import { Building2, Calendar, Plus, Users, QrCode, CheckCircle2, Clock, XCircle, ShieldAlert, Sparkles, Trash2, Edit3, Ticket as TicketIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooking } from '../contexts/BookingContext';
import { QRScanner } from '../components/QRScanner';
import { formatINR } from '../utils/formatters';

export const OrganizerDashboard: React.FC = () => {
  const { user } = useAuth();
  const { events, allBookings, organizers, registerOrganizer, addEvent, deleteEvent } = useBooking();

  const [activeTab, setActiveTab] = useState<'events' | 'bookings' | 'scan'>('events');

  // Registration Form State
  const [orgName, setOrgName] = useState(user?.organizationName || '');
  const [orgPhone, setOrgPhone] = useState(user?.organizerPhone || '');
  const [orgDesc, setOrgDesc] = useState(user?.organizerDescription || '');
  const [isRegistering, setIsRegistering] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Create Event Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<'concert' | 'comedy' | 'workshop' | 'sports' | 'theatre'>('concert');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [price, setPrice] = useState<number>(1499);
  const [imageUrl, setImageUrl] = useState('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&q=80&w=1200');

  // Find organizer account for current user
  const organizerAccount = organizers.find(
    (o) => o.userId === user?.id || o.email?.toLowerCase() === user?.email?.toLowerCase()
  );

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !user) return;

    setIsRegistering(true);
    const success = await registerOrganizer({
      userId: user.id,
      name: user.name,
      email: user.email,
      organizationName: orgName.trim(),
      phone: orgPhone.trim(),
      description: orgDesc.trim(),
    });
    setIsRegistering(false);

    if (success) {
      setSuccessMsg('Application submitted successfully! Awaiting administrator approval.');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !venue || !city || !organizerAccount) return;

    await addEvent({
      title,
      subtitle: subtitle || 'Live Concert & Entertainment Event',
      category,
      venue,
      city,
      date: date || '2026-12-31',
      time: time || '19:00 IST',
      imageUrl,
      priceStartingFrom: Number(price),
      totalCapacity: 5000,
      organizerId: organizerAccount.id,
      organizerName: organizerAccount.organizationName,
      ticketTiers: [
        { id: 'tier_vip', name: 'VIP Front Row', price: Number(price) * 1.8, totalInventory: 200, remainingInventory: 200 },
        { id: 'tier_gold', name: 'Gold Admission', price: Number(price), totalInventory: 1000, remainingInventory: 1000 },
        { id: 'tier_silver', name: 'Silver Standing', price: Number(price) * 0.6, totalInventory: 3800, remainingInventory: 3800 },
      ],
    });

    setIsEventModalOpen(false);
    setTitle('');
    setSubtitle('');
    setVenue('');
    setCity('');
  };

  // If not registered as organizer
  if (!organizerAccount) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 animate-in fade-in">
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 max-w-xl w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto text-[#D4AF37]">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="font-heading font-extrabold text-2xl text-white">Become an Event Organizer</h1>
            <p className="text-xs text-gray-400">
              Host your own concerts, comedy shows, and festivals. Apply with your organization details for admin approval.
            </p>
          </div>

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-gray-300 block mb-1">Organization / Brand Name</label>
              <input
                type="text"
                required
                placeholder="e.g., Apex Live Concerts"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">Contact Phone Number</label>
              <input
                type="text"
                required
                placeholder="+91 98765 00000"
                value={orgPhone}
                onChange={(e) => setOrgPhone(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">About Your Shows / Productions</label>
              <textarea
                rows={3}
                placeholder="Describe your concert genres, artist tours, or entertainment background..."
                value={orgDesc}
                onChange={(e) => setOrgDesc(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs tracking-wide hover:brightness-110 cursor-pointer shadow-lg shadow-[#D4AF37]/20"
            >
              {isRegistering ? 'Submitting Application...' : 'Submit Organizer Application'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If pending approval
  if (organizerAccount.status === 'pending') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 animate-in fade-in">
        <div className="bg-[#141414] border border-amber-500/30 rounded-3xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading font-extrabold text-2xl text-white">Application Under Review</h1>
            <p className="text-xs text-gray-300">
              Your organization <span className="text-[#D4AF37] font-bold">{organizerAccount.organizationName}</span> is currently pending approval by the platform administrator.
            </p>
          </div>
          <div className="p-4 bg-[#1C1C1C] rounded-2xl border border-white/5 text-xs text-gray-400">
            Once approved, you will gain full access to create, publish, and manage your events and attendee rosters here.
          </div>
        </div>
      </div>
    );
  }

  // If rejected
  if (organizerAccount.status === 'rejected') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 animate-in fade-in">
        <div className="bg-[#141414] border border-red-500/30 rounded-3xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading font-extrabold text-2xl text-white">Application Not Approved</h1>
            <p className="text-xs text-gray-300">
              Unfortunately, your organizer application for <span className="text-white font-bold">{organizerAccount.organizationName}</span> was not approved by the platform administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Approved Organizer Portal
  const myEvents = events.filter((e) => e.organizerId === organizerAccount.id);
  const myEventIds = myEvents.map((e) => e.id);
  const myBookingsList = allBookings.filter((b) => myEventIds.includes(b.eventId));
  const totalRevenue = myBookingsList.reduce((acc, b) => acc + (b.totalAmount || b.totalPaid || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-in fade-in">
      {/* Organizer Header */}
      <div className="bg-gradient-to-r from-[#1A1A1A] to-[#111111] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved Organizer Portal
            </span>
            <span className="text-xs text-gray-400 font-mono">ID: {organizerAccount.id}</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl text-white">
            {organizerAccount.organizationName}
          </h1>
          <p className="text-xs text-gray-400 max-w-xl">
            {organizerAccount.description || 'Manage your live shows, ticket inventory, and attendee rosters.'}
          </p>
        </div>

        <button
          onClick={() => setIsEventModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Create New Event</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-2">
          <span className="text-xs text-gray-400 font-medium">My Active Events</span>
          <div className="font-heading font-extrabold text-3xl text-white">{myEvents.length}</div>
        </div>
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-2">
          <span className="text-xs text-gray-400 font-medium">Total Tickets Sold</span>
          <div className="font-heading font-extrabold text-3xl text-[#D4AF37]">{myBookingsList.length}</div>
        </div>
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 space-y-2">
          <span className="text-xs text-gray-400 font-medium">Gross Sales Volume</span>
          <div className="font-heading font-extrabold text-3xl text-white">{formatINR(totalRevenue)}</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('events')}
          className={`shrink-0 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'events'
              ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
              : 'bg-[#181818] text-gray-300 hover:bg-white/10'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>My Events ({myEvents.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`shrink-0 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'bookings'
              ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
              : 'bg-[#181818] text-gray-300 hover:bg-white/10'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Attendee Roster & Sales ({myBookingsList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('scan')}
          className={`shrink-0 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'scan'
              ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
              : 'bg-[#181818] text-gray-300 hover:bg-white/10'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Gate Pass Scanner</span>
        </button>
      </div>

      {/* Tab 1: My Events */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myEvents.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-[#141414] rounded-3xl border border-white/10 space-y-3">
                <Calendar className="w-10 h-10 text-gray-600 mx-auto" />
                <p className="font-bold text-white text-base">No events published yet</p>
                <p className="text-xs text-gray-400">Click "Create New Event" above to host your first live show.</p>
              </div>
            ) : (
              myEvents.map((evt) => (
                <div key={evt.id} className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden group hover:border-[#D4AF37]/40 transition-all flex flex-col justify-between">
                  <div>
                    <div className="relative h-48 overflow-hidden">
                      <img src={evt.imageUrl} alt={evt.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-[#D4AF37] border border-[#D4AF37]/30">
                        {evt.category.toUpperCase()}
                      </div>
                    </div>

                    <div className="p-5 space-y-2">
                      <h3 className="font-heading font-bold text-base text-white line-clamp-1">{evt.title}</h3>
                      <p className="text-xs text-gray-400">{evt.venue}, {evt.city}</p>
                      <p className="text-xs font-mono text-[#D4AF37]">{evt.date} • {evt.time}</p>
                    </div>
                  </div>

                  <div className="p-5 pt-0 flex items-center justify-between border-t border-white/5 mt-4">
                    <span className="text-xs font-bold text-gray-300">Starts at {formatINR(evt.priceStartingFrom)}</span>
                    <button
                      onClick={() => deleteEvent(evt.id)}
                      className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                      title="Delete Event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Bookings Roster */}
      {activeTab === 'bookings' && (
        <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-white">Attendee Roster for My Events ({myBookingsList.length})</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#1C1C1C] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="px-6 py-4">Booking ID</th>
                  <th className="px-6 py-4">Event</th>
                  <th className="px-6 py-4">Attendee</th>
                  <th className="px-6 py-4">Tier & Seats</th>
                  <th className="px-6 py-4">Total Paid</th>
                  <th className="px-6 py-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {myBookingsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No ticket bookings recorded for your events yet.
                    </td>
                  </tr>
                ) : (
                  myBookingsList.map((b) => {
                    const eventObj = events.find((e) => e.id === b.eventId);
                    return (
                      <tr key={b.id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4 font-mono font-bold text-[#D4AF37]">{b.id}</td>
                        <td className="px-6 py-4 font-bold text-white">{eventObj?.title || b.eventId}</td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{b.attendeeName}</div>
                          <div className="text-[11px] text-gray-400">{b.attendeeEmail}</div>
                        </td>
                        <td className="px-6 py-4 font-mono">
                          <div>{b.tierName}</div>
                          <div className="text-[10px] text-gray-400">{b.seatNumber || 'General'}</div>
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400">{formatINR(b.totalAmount || b.totalPaid || 0)}</td>
                        <td className="px-6 py-4 font-mono text-gray-400">{new Date(b.bookedAt || Date.now()).toLocaleDateString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Scanner */}
      {activeTab === 'scan' && (
        <div className="max-w-2xl mx-auto bg-[#141414] border border-white/10 rounded-3xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <h3 className="font-heading font-extrabold text-xl text-white">Gate Pass QR Scanner</h3>
            <p className="text-xs text-gray-400">Scan or verify fan tickets for your events.</p>
          </div>
          <QRScanner />
        </div>
      )}

      {/* Create Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-none sm:rounded-3xl p-4 sm:p-6 lg:p-8 max-w-3xl w-full min-h-full sm:min-h-0 space-y-6 shadow-2xl relative sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#D4AF37]" />
                <span>Create New Event</span>
              </h3>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="text-gray-400 hover:text-white text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Summer Sunset Music Festival 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Subtitle / Tagline</label>
                <input
                  type="text"
                  placeholder="The Ultimate Electronic Dance Music Experience"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="concert">Concert</option>
                    <option value="comedy">Comedy</option>
                    <option value="workshop">Workshop</option>
                    <option value="sports">Sports</option>
                    <option value="theatre">Theatre</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">Base Price (₹)</label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Venue Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Wankhede Stadium"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">City</label>
                  <input
                    type="text"
                    required
                    placeholder="Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">Time</label>
                  <input
                    type="text"
                    required
                    placeholder="19:00 IST"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Poster Image URL</label>
                <input
                  type="url"
                  required
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-[11px] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold cursor-pointer hover:brightness-110"
                >
                  Publish Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
