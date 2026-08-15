import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Edit,
  Upload,
  Calendar,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileImage,
  Ticket as TicketIcon,
  Layers,
  MapPin,
  Clock,
  ShieldAlert,
  Search,
  Filter,
  Armchair,
} from 'lucide-react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useBooking } from '../../contexts/BookingContext';
import { EventCategory, EventItem, EventStatus, TicketTier } from '../../types';
import { formatINR } from '../../utils/formatters';

interface TierInput {
  id: string;
  name: string;
  price: number;
  description: string;
  totalInventory: number;
  remainingInventory: number;
  perksText: string;
}

export const AdminEvents: React.FC = () => {
  const { events, addEvent, updateEvent, deleteEvent } = useBooking();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'all' | EventStatus>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('concert');
  const [status, setStatus] = useState<EventStatus>('published');
  const [date, setDate] = useState('2026-11-20');
  const [time, setTime] = useState('07:30 PM');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [address, setAddress] = useState('');
  const [organizer, setOrganizer] = useState('Ash-vish Events');
  const [posterUrl, setPosterUrl] = useState(
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'
  );
  const [coverUrl, setCoverUrl] = useState(
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=1200'
  );

  // Ticket Tiers State
  const [tiers, setTiers] = useState<TierInput[]>([
    {
      id: 'tier_gen_' + Date.now(),
      name: 'General Access',
      price: 1499,
      description: 'Standard floor admission pass',
      totalInventory: 500,
      remainingInventory: 500,
      perksText: 'General Entry, Express Security',
    },
    {
      id: 'tier_vip_' + Date.now(),
      name: 'VIP Front Lounge',
      price: 3999,
      description: 'Elevated view with complimentary beverage',
      totalInventory: 100,
      remainingInventory: 100,
      perksText: 'VIP Lounge, Free Beverage, Priority Parking',
    },
  ]);

  // Upload & Validation States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const todayISO = new Date().toISOString().split('T')[0];

  // Open modal for creating new event
  const handleOpenCreateModal = () => {
    setEditingEventId(null);
    setTitle('');
    setSubtitle('');
    setDescription('Join us for an unforgettable live experience packed with top-tier performances, state-of-the-art visuals, and extraordinary energy.');
    setCategory('concert');
    setStatus('published');
    setDate('2026-11-25');
    setTime('08:00 PM');
    setVenue('Jio World Garden');
    setCity('Mumbai');
    setAddress('BKC, Bandra East, Mumbai, Maharashtra');
    setOrganizer('Ash-vish Events Official');
    setPosterUrl('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800');
    setCoverUrl('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=1200');
    setTiers([
      {
        id: 'tier_gen_' + Date.now(),
        name: 'General Access',
        price: 1499,
        description: 'Standard floor admission pass',
        totalInventory: 500,
        remainingInventory: 500,
        perksText: 'General Entry, Express Security',
      },
      {
        id: 'tier_vip_' + Date.now(),
        name: 'VIP Lounge Pass',
        price: 3999,
        description: 'Elevated viewing lounge access',
        totalInventory: 100,
        remainingInventory: 100,
        perksText: 'VIP Lounge, Dedicated Bar, Reserved Parking',
      },
    ]);
    setFormError(null);
    setUploadError(null);
    setShowModal(true);
  };

  // Open modal for editing existing event
  const handleOpenEditModal = (evt: EventItem) => {
    setEditingEventId(evt.id);
    setTitle(evt.title);
    setSubtitle(evt.subtitle || '');
    setDescription(evt.description || '');
    setCategory(evt.category);
    setStatus(evt.status || 'published');

    // Parse date if possible
    setDate(evt.date.match(/^\d{4}-\d{2}-\d{2}$/) ? evt.date : '2026-11-25');
    setTime(evt.time || '08:00 PM');
    setVenue(evt.venue || '');
    setCity(evt.city || 'Mumbai');
    setAddress(evt.address || `${evt.venue}, ${evt.city}`);
    setOrganizer(evt.organizer || 'Ash-vish Events');
    setPosterUrl(evt.posterUrl);
    setCoverUrl(evt.coverUrl || evt.posterUrl);

    if (evt.ticketTiers && evt.ticketTiers.length > 0) {
      setTiers(
        evt.ticketTiers.map((t) => ({
          id: t.id,
          name: t.name,
          price: t.price,
          description: t.description || 'Standard Entry',
          totalInventory: t.totalInventory || 200,
          remainingInventory: t.remainingInventory ?? t.totalInventory ?? 200,
          perksText: (t.perks || []).join(', '),
        }))
      );
    } else {
      setTiers([
        {
          id: 'tier_gen_' + Date.now(),
          name: 'General Pass',
          price: evt.startingPrice || 999,
          description: 'Standard Pass',
          totalInventory: 300,
          remainingInventory: 300,
          perksText: 'Standard Entry',
        },
      ]);
    }

    setFormError(null);
    setUploadError(null);
    setShowModal(true);
  };

  // Client-side file type & size validation + Firebase Storage upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetField: 'poster' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // 1. File Type Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file format. Please upload a JPEG, PNG, WEBP, or GIF image.');
      return;
    }

    // 2. File Size Validation (Max 5MB)
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeInBytes) {
      setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 5MB.`);
      return;
    }

    setIsUploading(true);

    try {
      // Sane path structure: events/{eventId}/{timestamp}_{filename}
      const targetId = editingEventId || 'new_event_' + Date.now();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileStoragePath = `events/${targetId}/${Date.now()}_${cleanFileName}`;
      const imageRef = storageRef(storage, fileStoragePath);

      const snapshot = await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      if (targetField === 'poster') {
        setPosterUrl(downloadURL);
      } else {
        setCoverUrl(downloadURL);
      }
    } catch (err: any) {
      console.warn('Firebase Storage upload failed, using Data URL fallback:', err);
      // Data URL fallback if storage bucket is offline or missing rules
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          if (targetField === 'poster') {
            setPosterUrl(dataUrl);
          } else {
            setCoverUrl(dataUrl);
          }
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  // Tier management helpers
  const handleAddTier = () => {
    setTiers((prev) => [
      ...prev,
      {
        id: 'tier_' + Date.now(),
        name: 'VIP Category ' + (prev.length + 1),
        price: 2500,
        description: 'Exclusive tier pass',
        totalInventory: 150,
        remainingInventory: 150,
        perksText: 'Express Access, Dedicated Zone',
      },
    ]);
  };

  const handleRemoveTier = (tierId: string) => {
    if (tiers.length <= 1) {
      alert('An event must have at least one ticket pricing tier.');
      return;
    }
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
  };

  const handleUpdateTier = (id: string, field: keyof TierInput, value: any) => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const updated = { ...t, [field]: value };
          if (field === 'totalInventory') {
            updated.remainingInventory = Number(value);
          }
          return updated;
        }
        return t;
      })
    );
  };

  // Save / Update Event
  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validation: Date must not be in the past
    if (date < todayISO) {
      setFormError(`Event date cannot be in the past. Please select today (${todayISO}) or a future date.`);
      return;
    }

    // 2. Validation: Required fields
    if (!title.trim() || !venue.trim() || !city.trim()) {
      setFormError('Please fill in all required fields (Title, Venue, City).');
      return;
    }

    // 3. Validation: Pricing Tiers
    if (tiers.length === 0) {
      setFormError('At least one ticket pricing tier is required.');
      return;
    }

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (!t.name.trim()) {
        setFormError(`Tier #${i + 1} name cannot be empty.`);
        return;
      }
      if (t.price < 0) {
        setFormError(`Tier "${t.name}" price cannot be negative.`);
        return;
      }
      if (t.totalInventory <= 0) {
        setFormError(`Tier "${t.name}" total capacity must be greater than 0.`);
        return;
      }
    }

    // Compute minimum price and total capacity
    const startingPrice = Math.min(...tiers.map((t) => Number(t.price)));
    const totalCapacity = tiers.reduce((sum, t) => sum + Number(t.totalInventory), 0);

    const formattedTiers: TicketTier[] = tiers.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      price: Number(t.price),
      description: t.description.trim() || 'Standard Access Pass',
      totalInventory: Number(t.totalInventory),
      remainingInventory: Number(t.remainingInventory ?? t.totalInventory),
      perks: t.perksText.split(',').map((p) => p.trim()).filter(Boolean),
    }));

    const eventPayload = {
      title: title.trim(),
      subtitle: subtitle.trim() || `${category.toUpperCase()} Event in ${city}`,
      category,
      status,
      date,
      time,
      venue: venue.trim(),
      address: address.trim() || `${venue}, ${city}`,
      city: city.trim(),
      startingPrice,
      totalCapacity,
      posterUrl,
      coverUrl: coverUrl || posterUrl,
      organizer: organizer.trim() || 'Ash-vish Events',
      description: description.trim() || 'Official event pass booking via Ash-vish Events platform.',
      artists: [{ id: 'a1', name: title.trim(), role: 'Main Stage', image: posterUrl }],
      ticketTiers: formattedTiers,
      gallery: [posterUrl, coverUrl].filter(Boolean),
      faqs: [
        { question: 'When do doors open?', answer: '60 minutes prior to scheduled start time.' },
        { question: 'Are digital QR passes accepted?', answer: 'Yes, present your digital QR pass at the ticket counter for scanning.' },
      ],
      rating: 4.9,
      reviewsCount: 12,
    };

    if (editingEventId) {
      updateEvent({
        ...eventPayload,
        id: editingEventId,
      });
      alert(`Event "${title}" updated and synced live!`);
    } else {
      addEvent(eventPayload);
      alert(`Event "${title}" published and live on public portal!`);
    }

    setShowModal(false);
  };

  // Quick Status Toggle directly from list table
  const handleQuickStatusToggle = (evt: EventItem, newStatus: EventStatus) => {
    updateEvent({
      ...evt,
      status: newStatus,
    });
  };

  // Filtering
  const filteredEvents = events.filter((evt) => {
    const matchesTab = activeTab === 'all' ? true : (evt.status || 'published') === activeTab;
    const matchesSearch =
      searchFilter === '' ||
      evt.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      evt.city.toLowerCase().includes(searchFilter.toLowerCase()) ||
      evt.venue.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#141414] via-[#1A1A1A] to-[#121212] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-[10px] font-black tracking-widest uppercase">
              Admin Portal
            </span>
            <span className="text-gray-500 text-xs">• Realtime Sync Active</span>
          </div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">
            Live Events Catalog & Inventory
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-xl">
            Create, manage pricing tiers, upload posters, and switch publishing status live across the public ticketing app.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2.5 shadow-xl shadow-[#D4AF37]/20 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Create New Event</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-[#141414] border border-white/10 p-3 sm:p-4 rounded-2xl">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['all', 'published', 'draft', 'sold_out', 'cancelled'] as const).map((tab) => {
            const count = events.filter((e) => (tab === 'all' ? true : (e.status || 'published') === tab)).length;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold capitalize whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-[#D4AF37] text-black shadow-md'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{tab.replace('_', ' ')}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Filter */}
        <div className="relative w-full sm:w-auto sm:min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, city, venue..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>

      {/* Events Table / Grid */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="responsive-table-scroll">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#1C1C1C] text-gray-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="p-4">Event & Artwork</th>
                <th className="p-4">Category</th>
                <th className="p-4">Date & Location</th>
                <th className="p-4">Status Flag</th>
                <th className="p-4">Pricing & Capacity</th>
                <th className="p-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-gray-400">No events found matching criteria.</p>
                    <p className="text-xs text-gray-600 mt-0.5">Try changing filters or create a new event.</p>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => {
                  const currentStatus = evt.status || 'published';
                  const totalCap =
                    evt.totalCapacity ||
                    (evt.ticketTiers || []).reduce((sum, t) => sum + (t.totalInventory || 0), 0);

                  return (
                    <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Event & Artwork */}
                      <td className="p-4 flex items-center gap-3">
                        <img
                          src={evt.posterUrl}
                          alt={evt.title}
                          className="w-12 h-16 rounded-xl object-cover bg-black/40 border border-white/10 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-heading font-black text-sm text-white block truncate max-w-xs group-hover:text-[#D4AF37] transition-colors">
                            {evt.title}
                          </span>
                          <span className="text-gray-400 text-[11px] truncate block max-w-xs">{evt.subtitle}</span>
                          <span className="text-[10px] text-gray-500 font-mono">ID: {evt.id}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 capitalize font-bold text-[11px] inline-block">
                          {evt.category}
                        </span>
                      </td>

                      {/* Date & Location */}
                      <td className="p-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-white font-bold">
                          <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>{evt.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                          <MapPin className="w-3.5 h-3.5 text-gray-500" />
                          <span>
                            {evt.venue}, {evt.city}
                          </span>
                        </div>
                      </td>

                      {/* Status Flag Dropdown / Badge */}
                      <td className="p-4">
                        <select
                          value={currentStatus}
                          onChange={(e) => handleQuickStatusToggle(evt, e.target.value as EventStatus)}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold capitalize cursor-pointer focus:outline-none ${
                            currentStatus === 'published'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : currentStatus === 'draft'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : currentStatus === 'sold_out'
                              ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                              : 'bg-red-500/10 border-red-500/30 text-red-400'
                          }`}
                        >
                          <option value="published" className="bg-[#1A1A1A] text-emerald-400">
                            🟢 Published
                          </option>
                          <option value="draft" className="bg-[#1A1A1A] text-amber-400">
                            🟡 Draft
                          </option>
                          <option value="sold_out" className="bg-[#1A1A1A] text-purple-400">
                            🟣 Sold Out
                          </option>
                          <option value="cancelled" className="bg-[#1A1A1A] text-red-400">
                            🔴 Cancelled
                          </option>
                        </select>
                      </td>

                      {/* Pricing & Capacity */}
                      <td className="p-4 space-y-0.5">
                        <div className="font-extrabold text-emerald-400 text-sm">
                          {formatINR(evt.startingPrice)} <span className="text-[10px] text-gray-400 font-normal">onwards</span>
                        </div>
                        <div className="text-gray-400 text-[11px] flex items-center gap-1">
                          <TicketIcon className="w-3.5 h-3.5 text-gray-500" />
                          <span>{evt.ticketTiers?.length || 1} Tiers • Cap: {totalCap}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate('/admin/seatmap')}
                            className="p-2 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            title="Configure Event Seat Map"
                          >
                            <Armchair className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Seat Map</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(evt)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-[#D4AF37]/20 text-gray-300 hover:text-[#D4AF37] transition-all cursor-pointer"
                            title="Edit Event"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to permanently delete event "${evt.title}"?`)) {
                                deleteEvent(evt.id);
                              }
                            }}
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer"
                            title="Delete Event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl my-8 relative">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-[#D4AF37] block">
                  {editingEventId ? 'Edit Event Details' : 'New Event Management'}
                </span>
                <h3 className="font-heading font-black text-xl text-white">
                  {editingEventId ? `Editing: ${title || 'Event'}` : 'Publish New Event Listing'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="space-y-6 text-xs">
              {/* Section 1: Basic Information */}
              <div className="space-y-4">
                <h4 className="text-gray-400 uppercase font-black tracking-wider text-[10px] border-b border-white/5 pb-2">
                  1. Event Overview & Metadata
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-gray-300 font-bold block mb-1">Event Title *</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Arijit Singh Live in Concert 2026"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Subtitle / Lineup</label>
                    <input
                      type="text"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="e.g. India Tour Special Edition"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as EventCategory)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37] capitalize"
                    >
                      <option value="concert">Concert / Live Music</option>
                      <option value="comedy">Standup Comedy</option>
                      <option value="sports">Sports & Stadiums</option>
                      <option value="theatre">Theatre & Drama</option>
                      <option value="festival">Cultural Festival</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Publish Status Flag</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as EventStatus)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="published">🟢 Published (Live on Public Portal)</option>
                      <option value="draft">🟡 Draft (Admin Only - Hidden)</option>
                      <option value="sold_out">🟣 Sold Out</option>
                      <option value="cancelled">🔴 Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Organizer Name</label>
                    <input
                      type="text"
                      value={organizer}
                      onChange={(e) => setOrganizer(e.target.value)}
                      placeholder="e.g. Ash-vish Events"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Event description..."
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Section 2: Date, Time & Venue */}
              <div className="space-y-4">
                <h4 className="text-gray-400 uppercase font-black tracking-wider text-[10px] border-b border-white/5 pb-2">
                  2. Schedule & Venue Details (No Past Dates)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Date (YYYY-MM-DD) *</label>
                    <input
                      type="date"
                      required
                      min={todayISO}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                    {date < todayISO && (
                      <span className="text-[10px] text-red-400 font-semibold block mt-1">
                        ⚠️ Date cannot be in the past!
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Showtime *</label>
                    <input
                      type="text"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      placeholder="e.g. 07:30 PM"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Mumbai"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Venue Name *</label>
                    <input
                      type="text"
                      required
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="e.g. Jio World Garden"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Event Artwork & Firebase Storage Upload */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <h4 className="text-gray-400 uppercase font-black tracking-wider text-[10px]">
                    3. Artwork & Firebase Storage Upload
                  </h4>
                  <span className="text-[10px] text-gray-500 font-mono">Max file size: 5MB (JPEG/PNG/WEBP)</span>
                </div>

                {uploadError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Poster Image Upload */}
                  <div className="p-4 bg-[#1C1C1C] border border-white/10 rounded-2xl space-y-3">
                    <span className="font-bold text-white block text-xs">Poster Image (Vertical)</span>
                    <div className="flex items-center gap-3">
                      <img
                        src={posterUrl}
                        alt="Poster Preview"
                        className="w-14 h-18 rounded-xl object-cover bg-black border border-white/10 shrink-0"
                      />
                      <div className="space-y-2 flex-1 min-w-0">
                        <label className="cursor-pointer py-2 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploading ? 'Uploading...' : 'Choose File'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => handleFileUpload(e, 'poster')}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="url"
                          placeholder="Or paste image URL"
                          value={posterUrl}
                          onChange={(e) => setPosterUrl(e.target.value)}
                          className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cover Banner Upload */}
                  <div className="p-4 bg-[#1C1C1C] border border-white/10 rounded-2xl space-y-3">
                    <span className="font-bold text-white block text-xs">Cover Banner (Wide)</span>
                    <div className="flex items-center gap-3">
                      <img
                        src={coverUrl}
                        alt="Cover Preview"
                        className="w-20 h-14 rounded-xl object-cover bg-black border border-white/10 shrink-0"
                      />
                      <div className="space-y-2 flex-1 min-w-0">
                        <label className="cursor-pointer py-2 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploading ? 'Uploading...' : 'Choose File'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => handleFileUpload(e, 'cover')}
                            className="hidden"
                          />
                        </label>
                        <input
                          type="url"
                          placeholder="Or paste image URL"
                          value={coverUrl}
                          onChange={(e) => setCoverUrl(e.target.value)}
                          className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Ticket Pricing Tiers & Inventory */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <h4 className="text-gray-400 uppercase font-black tracking-wider text-[10px]">
                    4. Ticket Categories & Pricing Tiers (Price ≥ 0, Capacity &gt; 0)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="py-1.5 px-3 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Pricing Tier</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {tiers.map((t, idx) => (
                    <div
                      key={t.id}
                      className="p-4 bg-[#1A1A1A] border border-white/10 rounded-2xl space-y-3 relative group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-white text-xs flex items-center gap-2">
                          <TicketIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                          Tier #{idx + 1}
                        </span>
                        {tiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(t.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Tier Name *</label>
                          <input
                            type="text"
                            required
                            value={t.name}
                            onChange={(e) => handleUpdateTier(t.id, 'name', e.target.value)}
                            placeholder="e.g. VIP Front Pit"
                            className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>

                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Price (₹) *</label>
                          <input
                            type="number"
                            min={0}
                            required
                            value={t.price}
                            onChange={(e) => handleUpdateTier(t.id, 'price', Number(e.target.value))}
                            className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-2 text-emerald-400 font-extrabold text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>

                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Total Capacity *</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={t.totalInventory}
                            onChange={(e) => handleUpdateTier(t.id, 'totalInventory', Number(e.target.value))}
                            className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Description</label>
                          <input
                            type="text"
                            value={t.description}
                            onChange={(e) => handleUpdateTier(t.id, 'description', e.target.value)}
                            placeholder="e.g. Dedicated viewing lounge access"
                            className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-300 text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Perks (Comma separated)</label>
                          <input
                            type="text"
                            value={t.perksText}
                            onChange={(e) => handleUpdateTier(t.id, 'perksText', e.target.value)}
                            placeholder="Free Drink, Priority Entry, VIP Lounge"
                            className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-300 text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="py-3 px-7 rounded-xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs shadow-xl shadow-[#D4AF37]/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {editingEventId ? 'Save & Sync Changes' : 'Publish Event Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
