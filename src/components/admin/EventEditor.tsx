import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Image as ImageIcon,
  MapPin,
  Calendar,
  CreditCard,
  Star,
  Clock,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Layers,
  Flag,
  FileText,
} from 'lucide-react';
import type { EventItem, EventCategory, TicketTier, EventScheduleItem, FAQ, SeatMapConfig } from '../../types';

export type EditorMode = 'create' | 'edit';

interface EventEditorProps {
  mode: EditorMode;
  existing?: EventItem | null;
  onSave: (draft: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>) => Promise<void>;
  onClose: () => void;
}

type EditorSection = 'basics' | 'venue' | 'media' | 'tickets' | 'perks' | 'schedule' | 'flags';

const DEFAULT_DRAFT: Omit<EventItem, 'id' | 'rating' | 'reviewsCount'> = {
  title: '',
  subtitle: '',
  category: 'concert' as EventCategory,
  status: 'published',
  date: '',
  time: '07:30 PM',
  venue: '',
  address: '',
  city: 'Kolhapur',
  startingPrice: 0,
  posterUrl: '',
  coverUrl: '',
  organizer: 'AV Events (Ash-vish Events)',
  description: '',
  artists: [],
  ticketTiers: [],
  gallery: [],
  faqs: [],
  schedule: [],
  perks: [],
  usesSeatMap: false,
  totalCapacity: 500,
  isFeatured: false,
  isTrending: false,
};

const uid = () => Math.random().toString(36).slice(2, 9);

const inputCls =
  'w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#D4AF37] transition-colors';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5';
const sectionHeading = (icon: React.ReactNode, title: string) => (
  <h4 className="font-heading font-bold text-sm text-white flex items-center gap-2 pt-2">
    <span className="text-[#D4AF37]">{icon}</span>
    {title}
  </h4>
);

export const EventEditor: React.FC<EventEditorProps> = ({ mode, existing, onSave, onClose }) => {
  const isEdit = mode === 'edit';
  const [draft, setDraft] = useState<Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>>(
    existing
      ? { ...DEFAULT_DRAFT, ...existing, seatMap: existing.seatMap ?? (undefined as unknown as SeatMapConfig | undefined) }
      : DEFAULT_DRAFT
  );
  const [section, setSection] = useState<EditorSection>('basics');
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Omit<EventItem, 'id' | 'rating' | 'reviewsCount'>>) =>
    setDraft((d) => ({ ...d, ...patch }));

  // ---------- Tiers helpers ----------
  const setTiers = (tiers: TicketTier[]) => set({ ticketTiers: tiers });
  const addTier = () =>
    setTiers([
      ...draft.ticketTiers,
      {
        id: `tier_${uid()}`,
        name: 'General Entry',
        price: 0,
        description: 'General admission pass.',
        totalInventory: 500,
        remainingInventory: 500,
        perks: [],
      },
    ]);
  const removeTier = (id: string) => setTiers(draft.ticketTiers.filter((t) => t.id !== id));
  const patchTier = (id: string, patch: Partial<TicketTier>) =>
    setTiers(draft.ticketTiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const syncStartingPrice = () => {
    const prices = draft.ticketTiers.map((t) => Number(t.price)).filter((p) => !Number.isNaN(p) && p >= 0);
    set({ startingPrice: prices.length ? Math.min(...prices) : 0 });
  };

  // ---------- Perks / artists / gallery / faq / schedule ----------
  const setPerks = (perks: string[]) => set({ perks });
  const addPerk = () => setPerks([...draft.perks, '']);
  const removePerk = (i: number) => setPerks(draft.perks.filter((_, idx) => idx !== i));

  const setArtists = (artists: NonNullable<EventItem['artists']>) => set({ artists });
  const addArtist = () =>
    setArtists([...draft.artists, { id: `artist_${uid()}`, name: '', role: 'Main Stage', image: draft.posterUrl || '' }]);
  const removeArtist = (id: string) => setArtists(draft.artists.filter((a) => a.id !== id));

  const setGallery = (gallery: string[]) => set({ gallery });
  const addGalleryUrl = () => setGallery([...draft.gallery, '']);
  const removeGalleryUrl = (i: number) => setGallery(draft.gallery.filter((_, idx) => idx !== i));

  const setFaqs = (faqs: FAQ[]) => set({ faqs });
  const addFaq = () => setFaqs([...draft.faqs, { question: '', answer: '' }]);
  const removeFaq = (i: number) => setFaqs(draft.faqs.filter((_, idx) => idx !== i));

  const setSchedule = (schedule: EventScheduleItem[]) => set({ schedule });
  const addScheduleItem = () => setSchedule([...draft.schedule, { time: '', title: '', description: '' }]);
  const removeScheduleItem = (i: number) => setSchedule(draft.schedule.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      alert('Please enter an event title.');
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch {
      // save errors are already toasted by the booking context
    } finally {
      setSaving(false);
    }
  };

  const sections: { id: EditorSection; icon: React.ReactNode; label: string }[] = [
    { id: 'basics', icon: <FileText className="w-4 h-4" />, label: 'Basics' },
    { id: 'venue', icon: <MapPin className="w-4 h-4" />, label: 'Date & Venue' },
    { id: 'media', icon: <ImageIcon className="w-4 h-4" />, label: 'Media' },
    { id: 'tickets', icon: <CreditCard className="w-4 h-4" />, label: 'Tickets' },
    { id: 'perks', icon: <Star className="w-4 h-4" />, label: 'Perks & Artists' },
    { id: 'schedule', icon: <Clock className="w-4 h-4" />, label: 'Schedule & FAQ' },
    { id: 'flags', icon: <Flag className="w-4 h-4" />, label: 'Flags' },
  ];

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <span className={labelCls}>{label}</span>
      {node}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 overflow-y-auto">
      <div className="bg-[#0E0E0E] border border-white/10 rounded-3xl w-full max-w-3xl my-8 max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
              {isEdit ? 'EDIT EVENT' : 'CREATE EVENT'}
            </span>
            <h3 className="font-heading font-bold text-lg text-white">
              {isEdit ? `Edit: ${draft.title || 'Untitled'}` : 'New Event'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Section tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-5 py-2">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  section === s.id
                    ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {section === 'basics' && (
              <div className="space-y-4">
                {sectionHeading(<FileText className="w-4 h-4" />, 'Basic Information')}
                {field(
                  'Title *',
                  <input
                    className={inputCls}
                    value={draft.title}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="e.g. A Bollywood Musical Night"
                  />
                )}
                {field(
                  'Subtitle / Tagline',
                  <input
                    className={inputCls}
                    value={draft.subtitle}
                    onChange={(e) => set({ subtitle: e.target.value })}
                    placeholder="e.g. Sufiyana Shaam at Sayaji"
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {field(
                    'Category',
                    <select
                      className={inputCls}
                      value={draft.category}
                      onChange={(e) => set({ category: e.target.value as EventCategory })}
                    >
                      <option value="concert">Concert</option>
                      <option value="comedy">Comedy</option>
                      <option value="sports">Sports</option>
                      <option value="theatre">Theatre</option>
                      <option value="festival">Festival</option>
                    </select>
                  )}
                  {field(
                    'Status',
                    <select
                      className={inputCls}
                      value={draft.status || 'published'}
                      onChange={(e) => set({ status: e.target.value as EventItem['status'] })}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="sold_out">Sold Out</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  )}
                  {field(
                    'Organizer Name',
                    <input
                      className={inputCls}
                      value={draft.organizer}
                      onChange={(e) => set({ organizer: e.target.value })}
                      placeholder="e.g. AV Events (Ash-vish Events)"
                    />
                  )}
                </div>
                {field(
                  'Description',
                  <textarea
                    className={`${inputCls} min-h-24`}
                    value={draft.description}
                    onChange={(e) => set({ description: e.target.value })}
                    placeholder="Join us for a celebration of soulful melodies..."
                  />
                )}
              </div>
            )}

            {section === 'venue' && (
              <div className="space-y-4">
                {sectionHeading(<Calendar className="w-4 h-4" />, 'Date & Time')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {field(
                    'Date (YYYY-MM-DD)',
                    <input
                      className={inputCls}
                      type="date"
                      value={draft.date}
                      onChange={(e) => set({ date: e.target.value })}
                    />
                  )}
                  {field(
                    'Time',
                    <input
                      className={inputCls}
                      value={draft.time}
                      onChange={(e) => set({ time: e.target.value })}
                      placeholder="e.g. 07:30 PM"
                    />
                  )}
                </div>
                {sectionHeading(<MapPin className="w-4 h-4" />, 'Venue & Location')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {field(
                    'Venue Name',
                    <input
                      className={inputCls}
                      value={draft.venue}
                      onChange={(e) => set({ venue: e.target.value })}
                      placeholder="e.g. Megh Malhar Hall, The Sayaji"
                    />
                  )}
                  {field(
                    'City',
                    <input
                      className={inputCls}
                      value={draft.city}
                      onChange={(e) => set({ city: e.target.value })}
                      placeholder="e.g. Kolhapur"
                    />
                  )}
                </div>
                {field(
                  'Address',
                  <input
                    className={inputCls}
                    value={draft.address}
                    onChange={(e) => set({ address: e.target.value })}
                    placeholder="e.g. The Sayaji, DYP City Mall, Miraj-Sangli Road, Kolhapur, Maharashtra 416001"
                  />
                )}
                {field(
                  'Google Maps URL',
                  <input
                    className={inputCls}
                    value={draft.mapsUrl || ''}
                    onChange={(e) => set({ mapsUrl: e.target.value })}
                    placeholder="e.g. https://maps.app.goo.gl/..."
                  />
                )}
                {field(
                  'Total Capacity',
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    value={draft.totalCapacity ?? ''}
                    onChange={(e) => set({ totalCapacity: Number(e.target.value) })}
                    placeholder="500"
                  />
                )}
              </div>
            )}

            {section === 'media' && (
              <div className="space-y-4">
                {sectionHeading(<ImageIcon className="w-4 h-4" />, 'Poster & Cover')}
                {field(
                  'Poster Image URL',
                  <input
                    className={inputCls}
                    value={draft.posterUrl}
                    onChange={(e) => set({ posterUrl: e.target.value })}
                    placeholder="https://..."
                  />
                )}
                {field(
                  'Cover Image URL',
                  <input
                    className={inputCls}
                    value={draft.coverUrl}
                    onChange={(e) => set({ coverUrl: e.target.value })}
                    placeholder="https://... (defaults to poster if empty)"
                  />
                )}
                <div className="flex gap-3">
                  <label className="flex-1">
                    <span className={labelCls}>Poster Preview</span>
                    <div className="aspect-[890/357] rounded-2xl overflow-hidden bg-[#1C1C1C] border border-white/10 flex items-center justify-center">
                      {draft.posterUrl ? (
                        <img src={draft.posterUrl} alt="Poster preview" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-gray-600" />
                      )}
                    </div>
                  </label>
                </div>
                {sectionHeading(<Layers className="w-4 h-4" />, 'Gallery')}
                <div className="space-y-2">
                  {draft.gallery.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        value={url}
                        onChange={(e) => {
                          const next = [...draft.gallery];
                          next[i] = e.target.value;
                          setGallery(next);
                        }}
                        placeholder="Gallery image URL"
                      />
                      <button
                        type="button"
                        onClick={() => removeGalleryUrl(i)}
                        className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addGalleryUrl}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#D4AF37] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" /> Add Gallery URL
                  </button>
                </div>
              </div>
            )}

            {section === 'tickets' && (
              <div className="space-y-4">
                {sectionHeading(<CreditCard className="w-4 h-4" />, 'Ticket Tiers')}
                <div className="flex items-center justify-between rounded-2xl bg-[#1C1C1C] border border-white/10 px-4 py-3">
                  <span className="text-xs text-gray-400">
                    Card starting price is auto-synced to the cheapest tier price.
                  </span>
                  <button
                    type="button"
                    onClick={addTier}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Tier
                  </button>
                </div>
                {draft.ticketTiers.length === 0 && (
                  <p className="text-xs text-gray-500">No ticket tiers yet — add one to start.</p>
                )}
                {draft.ticketTiers.map((tier) => (
                  <div key={tier.id} className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">{tier.name || 'Tier'}</span>
                      <button
                        type="button"
                        onClick={() => removeTier(tier.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className={labelCls}>Tier Name</span>
                        <input
                          className={inputCls}
                          value={tier.name}
                          onChange={(e) => patchTier(tier.id, { name: e.target.value })}
                          placeholder="General Entry"
                        />
                      </div>
                      <div>
                        <span className={labelCls}>Price (₹ incl. taxes)</span>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          value={tier.price}
                          onChange={(e) => {
                            patchTier(tier.id, { price: Number(e.target.value) });
                            setTimeout(syncStartingPrice, 0);
                          }}
                        />
                      </div>
                      <div>
                        <span className={labelCls}>Total Inventory</span>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          value={tier.totalInventory}
                          onChange={(e) => patchTier(tier.id, { totalInventory: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <span className={labelCls}>Remaining Inventory</span>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          value={tier.remainingInventory}
                          onChange={(e) => patchTier(tier.id, { remainingInventory: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div>
                      <span className={labelCls}>Tier Description</span>
                      <textarea
                        className={`${inputCls} min-h-14`}
                        value={tier.description}
                        onChange={(e) => patchTier(tier.id, { description: e.target.value })}
                        placeholder="General admission pass, ₹2,500 inclusive of all taxes."
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Tier Perks (comma separated)</span>
                      <input
                        className={inputCls}
                        value={tier.perks.join(', ')}
                        onChange={(e) =>
                          patchTier(
                            tier.id,
                            { perks: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }
                          )
                        }
                        placeholder="Unlimited Veg & Non-Veg Food, Access to Party Arena"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {section === 'perks' && (
              <div className="space-y-5">
                {sectionHeading(<Star className="w-4 h-4" />, 'Event Perks (What\'s Included)')}
                <div className="space-y-2">
                  {draft.perks.map((perk, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        value={perk}
                        onChange={(e) => {
                          const next = [...draft.perks];
                          next[i] = e.target.value;
                          setPerks(next);
                        }}
                        placeholder="e.g. Unlimited Veg & Non-Veg Food — Starters"
                      />
                      <button
                        type="button"
                        onClick={() => removePerk(i)}
                        className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPerk}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#D4AF37] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" /> Add Perk
                  </button>
                </div>

                <div className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <ToggleRight className="w-4 h-4 text-[#D4AF37]" />
                      Walk-in / No Seat Map
                    </span>
                    <button
                      type="button"
                      onClick={() => set({ usesSeatMap: !draft.usesSeatMap })}
                      className={`flex items-center gap-1.5 text-xs font-bold ${draft.usesSeatMap ? 'text-gray-400' : 'text-[#D4AF37]'}`}
                    >
                      {draft.usesSeatMap ? (
                        <>
                          <ToggleRight className="w-5 h-5" /> OFF
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-5 h-5" /> ON (walk-in)
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    When ON, the event runs a general-admission flow: no seat selection step, quantity only at checkout.
                  </p>
                </div>

                {sectionHeading(<ImageIcon className="w-4 h-4" />, 'Featured Lineup & Artists')}
                <div className="space-y-3">
                  {draft.artists.map((artist) => (
                    <div key={artist.id} className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">{artist.name || 'Artist'}</span>
                        <button
                          type="button"
                          onClick={() => removeArtist(artist.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          className={inputCls}
                          value={artist.name}
                          onChange={(e) =>
                            setArtists(draft.artists.map((a) => (a.id === artist.id ? { ...a, name: e.target.value } : a)))
                          }
                          placeholder="Artist name"
                        />
                        <input
                          className={inputCls}
                          value={artist.role}
                          onChange={(e) =>
                            setArtists(draft.artists.map((a) => (a.id === artist.id ? { ...a, role: e.target.value } : a)))
                          }
                          placeholder="Role (e.g. Main Stage)"
                        />
                        <input
                          className={inputCls}
                          value={artist.image}
                          onChange={(e) =>
                            setArtists(draft.artists.map((a) => (a.id === artist.id ? { ...a, image: e.target.value } : a)))
                          }
                          placeholder="Image URL"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addArtist}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#D4AF37] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" /> Add Artist
                  </button>
                </div>
              </div>
            )}

            {section === 'schedule' && (
              <div className="space-y-5">
                {sectionHeading(<Clock className="w-4 h-4" />, 'Showtime Schedule')}
                <div className="space-y-2">
                  {draft.schedule.map((item, i) => (
                    <div key={i} className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          className={`${inputCls} w-32`}
                          value={item.time}
                          onChange={(e) => {
                            const next = [...draft.schedule];
                            next[i] = { ...item, time: e.target.value };
                            setSchedule(next);
                          }}
                          placeholder="08:00 PM"
                        />
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => removeScheduleItem(i)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        className={inputCls}
                        value={item.title}
                        onChange={(e) => {
                          const next = [...draft.schedule];
                          next[i] = { ...item, title: e.target.value };
                          setSchedule(next);
                        }}
                        placeholder="Segment title"
                      />
                      <input
                        className={inputCls}
                        value={item.description}
                        onChange={(e) => {
                          const next = [...draft.schedule];
                          next[i] = { ...item, description: e.target.value };
                          setSchedule(next);
                        }}
                        placeholder="Short description"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addScheduleItem}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#D4AF37] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" /> Add Schedule Item
                  </button>
                </div>

                {sectionHeading(<HelpCircle className="w-4 h-4" />, 'Frequently Asked Questions')}
                <div className="space-y-2">
                  {draft.faqs.map((faq, i) => (
                    <div key={i} className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">Q{i + 1}</span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => removeFaq(i)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        className={inputCls}
                        value={faq.question}
                        onChange={(e) => {
                          const next = [...draft.faqs];
                          next[i] = { ...faq, question: e.target.value };
                          setFaqs(next);
                        }}
                        placeholder="Question"
                      />
                      <textarea
                        className={`${inputCls} min-h-14`}
                        value={faq.answer}
                        onChange={(e) => {
                          const next = [...draft.faqs];
                          next[i] = { ...faq, answer: e.target.value };
                          setFaqs(next);
                        }}
                        placeholder="Answer"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addFaq}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#D4AF37] flex items-center gap-2 hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" /> Add FAQ
                  </button>
                </div>
              </div>
            )}

            {section === 'flags' && (
              <div className="space-y-4">
                {sectionHeading(<Flag className="w-4 h-4" />, 'Visibility Flags')}
                {(
                  [
                    ['isFeatured', 'Featured Headliner', 'Showed in the hero / featured headliner section on the home page.'],
                    ['isTrending', 'Trending', 'Included in the Trending Shows carousel.'],
                    ['isPopularThisWeek', 'Popular This Week', 'Included in the Popular This Week section.'],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div key={key} className="flex items-center justify-between rounded-2xl bg-[#1C1C1C] border border-white/10 px-4 py-3">
                    <div>
                      <span className="text-xs font-bold text-white block">{label}</span>
                      <span className="text-[11px] text-gray-500">{hint}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => set({ [key]: !draft[key] })}
                      className={`flex items-center gap-1.5 text-xs font-bold ${draft[key] ? 'text-[#D4AF37]' : 'text-gray-500'}`}
                    >
                      {draft[key] ? <ToggleLeft className="w-5 h-5" /> : <ToggleRight className="w-5 h-5" />}
                      {draft[key] ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}
                {field(
                  'Presented By / Organizer Display Name',
                  <input
                    className={inputCls}
                    value={draft.organizerName || ''}
                    onChange={(e) => set({ organizerName: e.target.value })}
                    placeholder="e.g. AV Events & DYP Hospitality Pvt Ltd"
                  />
                )}
                {field(
                  'Presented By (subtitle line)',
                  <input
                    className={inputCls}
                    value={draft.presentedBy || ''}
                    onChange={(e) => set({ presentedBy: e.target.value })}
                    placeholder="e.g. DYP Hospitality Pvt Ltd & The Sayaji Kolhapur"
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 text-xs font-bold hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black text-xs font-extrabold shadow-lg shadow-[#D4AF37]/20 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Publish Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
