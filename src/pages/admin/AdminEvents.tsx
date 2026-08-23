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
  Copy,
  Mail,
  Building2,
} from 'lucide-react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useBooking } from '../../contexts/BookingContext';
import { EventCategory, EventItem, EventStatus, TicketTier, Artist, PublicCounter } from '../../types';
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
  const { events, addEvent, updateEvent, deleteEvent, fetchAdminEvents, applyEventLifecycle, cloneEvent, fetchOrders, countNotifyHolders, notifyAllHolders } = useBooking();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'all' | EventStatus>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Form State
  const [usesSeatMap, setUsesSeatMap] = useState(true);
  const [perksText, setPerksText] = useState('');
  const [artistsText, setArtistsText] = useState('');
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
  const [cardImageUrl, setCardImageUrl] = useState('');

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

  // Extended customizations (Prompt C: full-field event CRUD)
  const [scheduleText, setScheduleText] = useState('');
  const [faqsText, setFaqsText] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [mapsUrl, setMapsUrl] = useState('');
  const [externalBookingUrl, setExternalBookingUrl] = useState('');
  const [externalBookingEnabled, setExternalBookingEnabled] = useState(false);
  const [externalBookingShowTicketInfo, setExternalBookingShowTicketInfo] = useState(true);
  const [presentedBy, setPresentedBy] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isTrending, setIsTrending] = useState(false);
  const [isPopularThisWeek, setIsPopularThisWeek] = useState(false);
  const [cashOnCounterOnly, setCashOnCounterOnly] = useState(false);
  const [isAdvertiseOnly, setIsAdvertiseOnly] = useState(false);
  const [counterLocation, setCounterLocation] = useState('');
  const [counterTimingText, setCounterTimingText] = useState('');
  const [counterContactPhone, setCounterContactPhone] = useState('');

  // Counter Panel Integration: Available & Assigned Counters
  const [availableCounters, setAvailableCounters] = useState<PublicCounter[]>([]);
  const [assignedCounterIds, setAssignedCounterIds] = useState<string[]>([]);

  // Fetch available counters from Counter Panel
  React.useEffect(() => {
    const fetchCounters = async () => {
      try {
        const res = await fetch('/api/counters');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.counters)) {
            setAvailableCounters(data.counters);
          }
        }
      } catch {
        /* fallback empty */
      }
    };
    fetchCounters();
  }, []);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Prompt B: event lifecycle scheduling (draft → published → archived)
  const [scheduledPublishAt, setScheduledPublishAt] = useState<string>('');
  const [scheduledUnpublishAt, setScheduledUnpublishAt] = useState<string>('');
  // Prompt B: event cloning
  const [cloneTarget, setCloneTarget] = useState<EventItem | null>(null);
  const [cloneNewDate, setCloneNewDate] = useState<string>('');
  const [cloneNewTime, setCloneNewTime] = useState<string>('');
  const [cloneNewTitle, setCloneNewTitle] = useState<string>('');

  const handleOpenCloneModal = (evt: EventItem) => {
    setCloneTarget(evt);
    setCloneNewDate('');
    setCloneNewTime('');
    setCloneNewTitle('');
  };

  const handleCloneEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneTarget) return;
    try {
      const res = await cloneEvent(cloneTarget.id, {
        newDate: cloneNewDate || undefined,
        newTime: cloneNewTime || undefined,
        newTitle: cloneNewTitle.trim() || undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Clone failed' }));
        alert(err.error || 'Clone request was rejected.');
        return;
      }
      alert(`Event "${cloneNewTitle.trim() || cloneTarget.title}" created as a new listing.`);
      setCloneTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Clone failed. Please try again.');
    }
  };

  const handleApplyLifecycle = async () => {
    const ok = await applyEventLifecycle();
    if (ok) alert('Scheduled publish/unpublish transitions applied.');
    else alert('Lifecycle sweep could not be applied right now.');
  };

  // Notify all ticket holders of an event (Item 6)
  const [notifyTarget, setNotifyTarget] = useState<EventItem | null>(null);
  const [notifyRecipientCount, setNotifyRecipientCount] = useState<number>(0);
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifySending, setNotifySending] = useState(false);

  const handleOpenNotifyModal = async (evt: EventItem) => {
    const count = await countNotifyHolders(evt.id);
    setNotifyTarget(evt);
    setNotifyRecipientCount(count);
    setNotifySubject(`Update regarding your ${evt.title} booking`);
    setNotifyMessage('');
  };

  const handleSendNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyTarget) return;
    if (String(notifySubject).trim().length < 3) return alert('Subject must be at least 3 characters.');
    if (String(notifyMessage).trim().length < 5) return alert('Message must be at least 5 characters.');
    if (notifyRecipientCount === 0) {
      if (!confirm('No confirmed ticket holders with email addresses were found for this event. Continue anyway?')) return;
    } else if (!confirm(`This will email approximately ${notifyRecipientCount} unique ticket holder(s) for "${notifyTarget.title}". Proceed?`)) return;
    setNotifySending(true);
    try {
      const res = await notifyAllHolders(notifyTarget.id, String(notifySubject).trim(), String(notifyMessage).trim());
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Sending failed' }));
        alert(err.error || 'Notification request was rejected.');
      } else {
        alert('Notification emails queued successfully.');
        setNotifyTarget(null);
      }
    } catch (err: any) {
      alert(err?.message || 'Sending notifications failed. Please try again.');
    } finally {
      setNotifySending(false);
    }
  };

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
    setCardImageUrl('');
    setUsesSeatMap(true);
    setPerksText('Complimentary Welcome Kit, Live DJ After-Party, Free Parking');
    setArtistsText('Ash-vish Ensemble | Main Stage');
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
    setScheduleText('');
    setFaqsText('');
    setGalleryUrls([]);
    setMapsUrl('');
    setExternalBookingUrl('');
    setExternalBookingEnabled(false);
    setExternalBookingShowTicketInfo(true);
    setPresentedBy('');
    setIsFeatured(false);
    setIsTrending(false);
    setIsPopularThisWeek(false);
    setCashOnCounterOnly(false);
    setIsAdvertiseOnly(false);
    setCounterLocation('');
    setCounterTimingText('');
    setCounterContactPhone('');
    setAssignedCounterIds([]);
    setScheduledPublishAt('');
    setScheduledUnpublishAt('');
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
    setDate(evt.date && evt.date.match(/^\d{4}-\d{2}-\d{2}$/) ? evt.date : '2026-11-25');
    setTime(evt.time || '08:00 PM');
    setVenue(evt.venue || '');
    setCity(evt.city || 'Mumbai');
    setAddress(evt.address || (evt.venue ? `${evt.venue}, ${evt.city || 'Mumbai'}` : ''));
    setOrganizer(evt.organizer || 'Ash-vish Events');
    setPosterUrl(evt.posterUrl);
    setCoverUrl(evt.coverUrl || evt.posterUrl);
    setCardImageUrl(evt.cardImageUrl || '');

    setScheduledPublishAt(evt.scheduledPublishAt || '');
    setScheduledUnpublishAt(evt.scheduledUnpublishAt || '');
    setUsesSeatMap(evt.usesSeatMap !== false);
    setPerksText((evt.perks || []).join(', '));
    setArtistsText((evt.artists || []).map((a) => `${a.name}${a.role ? ` | ${a.role}` : ''}`).join('\n'));
    setMapsUrl(evt.mapsUrl || '');
    const legacyBookingUrl = typeof evt.externalBookingUrl === 'string' ? evt.externalBookingUrl.trim() : '';
    const cleanLegacyBookingUrl = ['null', 'undefined'].includes(legacyBookingUrl.toLowerCase()) ? '' : legacyBookingUrl;
    setExternalBookingUrl(cleanLegacyBookingUrl);
    setExternalBookingEnabled(evt.externalBookingEnabled !== false && Boolean(cleanLegacyBookingUrl));
    setExternalBookingShowTicketInfo(evt.externalBookingShowTicketInfo !== false);
    setPresentedBy(evt.presentedBy || '');
    setIsFeatured(!!evt.isFeatured);
    setIsTrending(!!evt.isTrending);
    setIsPopularThisWeek(!!evt.isPopularThisWeek);
    setCashOnCounterOnly(!!evt.cashOnCounterOnly);
    setIsAdvertiseOnly(!!evt.isAdvertiseOnly);
    setCounterLocation(evt.counterLocation || '');
    setCounterTimingText(evt.counterTimingText || '');
    setCounterContactPhone(evt.counterContactPhone || '');
    setAssignedCounterIds(evt.assignedCounterIds || []);
    setGalleryUrls(evt.gallery || []);
    setScheduleText((evt.schedule || [])
      .map((s) => [s.time, s.title, s.description].map((x) => (x || '').toString()).join(' | '))
      .join('\n'));
    setFaqsText((evt.faqs || [])
      .map((f) => `${f.question} :: ${f.answer}`)
      .join('\n'));

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
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetField: 'poster' | 'cover' | 'card') => {
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
      } else if (targetField === 'cover') {
        setCoverUrl(downloadURL);
      } else if (targetField === 'card') {
        setCardImageUrl(downloadURL);
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
    if (tiers.length <= 1 && !isAdvertiseOnly) {
      alert('An event must have at least one ticket pricing tier.');
      return;
    }
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
  };

  const handleAdvertiseOnlyToggle = () => {
    setIsAdvertiseOnly((previous) => {
      const next = !previous;
      // A new external-only listing should not accidentally inherit the form's
      // default local inventory. Existing events keep their tiers until removed.
      if (next && !editingEventId) setTiers([]);
      return next;
    });
  };

  const handleUpdateTier = (id: string, field: keyof TierInput, value: any) => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const updated = { ...t, [field]: value };
          if (field === 'totalInventory') {
            const newTotal = Math.max(0, Number(value) || 0);
            const oldTotal = Math.max(0, Number(t.totalInventory) || 0);
            const oldRem = Math.max(0, Number(t.remainingInventory ?? oldTotal));
            const diff = newTotal - oldTotal;
            updated.remainingInventory = Math.max(0, Math.min(newTotal, oldRem + diff));
          }
          return updated;
        }
        return t;
      })
    );
  };

  // Save / Update Event
  const handleSaveEvent = async (e: React.FormEvent) => {
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

    // 3. Validation: External booking option
    const cleanExternalBookingUrl = (() => {
      const value = externalBookingUrl.trim();
      return ['null', 'undefined'].includes(value.toLowerCase()) ? '' : value;
    })();
    if (externalBookingEnabled && !cleanExternalBookingUrl) {
      setFormError('Add a valid external booking URL or turn External Booking off.');
      return;
    }
    if (externalBookingEnabled && cleanExternalBookingUrl) {
      try {
        const parsedBookingUrl = new URL(cleanExternalBookingUrl);
        if (!['http:', 'https:'].includes(parsedBookingUrl.protocol)) throw new Error('Unsupported protocol');
      } catch {
        setFormError('External booking URL must be a valid http:// or https:// link.');
        return;
      }
    }

    // 4. Validation: Pricing Tiers
    const isExternalOnlyListing = isAdvertiseOnly && externalBookingEnabled && Boolean(cleanExternalBookingUrl);
    if (tiers.length === 0 && !isExternalOnlyListing) {
      setFormError('At least one ticket pricing tier is required unless this is an advertisement-only event with an external booking URL.');
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
    const startingPrice = tiers.length > 0 ? Math.min(...tiers.map((t) => Number(t.price))) : 0;
    const totalCapacity = tiers.reduce((sum, t) => sum + Number(t.totalInventory), 0);

    const formattedTiers: TicketTier[] = tiers.map((t) => {
      const parsedTotal = Number(t.totalInventory) || 1;
      const rawRemaining = t.remainingInventory !== undefined ? Number(t.remainingInventory) : parsedTotal;
      const parsedRemaining = Math.min(parsedTotal, Math.max(0, rawRemaining));
      return {
        id: t.id || `tier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: t.name.trim() || 'General Entry',
        price: Math.max(0, Number(t.price) || 0),
        description: t.description.trim() || 'Standard Access Pass',
        totalInventory: parsedTotal,
        remainingInventory: parsedRemaining,
        perks: t.perksText.split(',').map((p) => p.trim()).filter(Boolean),
      };
    });

    // Parse artists lines: "Name | Role"
    const existingEvt = editingEventId ? events.find((e) => e.id === editingEventId) : null;
    const formattedArtists: Artist[] = artistsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const parts = line.split('|').map((p) => p.trim());
        const existingArtist = existingEvt?.artists ? existingEvt.artists[idx] : undefined;
        return {
          id: existingArtist?.id || `a_${idx + 1}_${Date.now()}`,
          name: parts[0] || title.trim(),
          role: parts[1] || 'Main Stage',
          image: existingArtist?.image || posterUrl,
        };
      });

    const finalArtists = formattedArtists.length > 0
      ? formattedArtists
      : (existingEvt?.artists && existingEvt.artists.length > 0
          ? existingEvt.artists
          : [{ id: 'a1', name: title.trim(), role: 'Main Stage', image: posterUrl }]);

    // Parse schedule lines: "time | title | description" (description optional)
    const formattedSchedule = scheduleText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
        return {
          time: parts[0] || '',
          title: parts[1] || '',
          description: parts.slice(2).join(' | ').trim(),
        };
      });

    // Parse FAQ lines: "question :: answer"
    const formattedFaqs = faqsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [question, ...rest] = line.split('::').map((p) => p.trim());
        return { question: question || '', answer: rest.join(' :: ') || '' };
      });

    const formattedGallery = galleryUrls.map((u) => u.trim()).filter(Boolean);

    const eventPayload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      category,
      status,
      date,
      time,
      venue: venue.trim(),
      address: address.trim() || (venue.trim() ? `${venue.trim()}, ${city.trim()}` : ''),
      city: city.trim(),
      startingPrice,
      totalCapacity,
      posterUrl,
      coverUrl: coverUrl || posterUrl,
      cardImageUrl: cardImageUrl.trim() || null,
      organizer: organizer.trim() || 'Ash-vish Events',
      description: description.trim(),
      artists: finalArtists,
      ticketTiers: formattedTiers,
      gallery: formattedGallery.length > 0 ? formattedGallery : [posterUrl, coverUrl].filter(Boolean),
      faqs: formattedFaqs,
      schedule: formattedSchedule,
      mapsUrl: mapsUrl.trim() || null,
      externalBookingEnabled,
      externalBookingShowTicketInfo,
      externalBookingUrl: externalBookingEnabled ? (cleanExternalBookingUrl || null) : null,
      presentedBy: presentedBy.trim() || null,
      isFeatured,
      isTrending,
      isPopularThisWeek,
      cashOnCounterOnly,
      isAdvertiseOnly,
      counterLocation: counterLocation.trim() || null,
      counterTimingText: counterTimingText.trim() || null,
      counterContactPhone: counterContactPhone.trim() || null,
      assignedCounterIds,
      rating: editingEventId && existingEvt?.rating !== undefined ? existingEvt.rating : 5.0,
      reviewsCount: editingEventId && existingEvt?.reviewsCount !== undefined ? existingEvt.reviewsCount : 0,
      scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
      scheduledUnpublishAt: scheduledUnpublishAt ? new Date(scheduledUnpublishAt).toISOString() : null,
      // Admin-controlled seat-map toggle.
      usesSeatMap,
      // Event-level perks/features
      perks: perksText.split(',').map((p) => p.trim()).filter(Boolean),
    };

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingEventId) {
        await updateEvent({
          ...(existingEvt || {}),
          ...eventPayload,
          id: editingEventId,
        });
      } else {
        await addEvent(eventPayload);
      }
      setShowModal(false);
      await fetchAdminEvents();
    } catch (err: any) {
      console.error('Error saving event:', err);
      setFormError(err.message || 'Failed to save event. Please check required fields.');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Status Toggle directly from list table
  const handleQuickStatusToggle = async (evt: EventItem, newStatus: EventStatus) => {
    try {
      await updateEvent({
        ...evt,
        status: newStatus,
      });
      await fetchAdminEvents();
    } catch {
      /* error surfaced via showToast in BookingContext */
    }
  };

  // Quick seat-map toggle directly from list table: flip between seat-based
  // checkout and general admission (quantity only).
  const handleQuickSeatMapToggle = async (evt: EventItem) => {
    const next = evt.usesSeatMap === false ? true : false;
    try {
      await updateEvent({ ...evt, usesSeatMap: next });
    } catch {
      /* error already surfaced via showToast */
    }
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
                  const totalRem = (evt.ticketTiers || []).reduce((sum, t) => sum + (t.remainingInventory ?? (t.totalInventory || 0)), 0);

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
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-500 font-mono">ID: {evt.id}</span>
                            {evt.isAdvertiseOnly && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                                Ad Only
                              </span>
                            )}
                          </div>
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
                          <span>{evt.ticketTiers?.length || 1} Tiers • {totalCap} Cap</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${totalRem > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className={`text-[11px] font-bold ${totalRem > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {totalRem} Left
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleQuickSeatMapToggle(evt)}
                            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold ${
                              evt.usesSeatMap !== false
                                ? 'bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border-[#D4AF37]/30 text-[#D4AF37]'
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-400 hover:text-gray-200'
                            }`}
                            title={evt.usesSeatMap !== false ? 'Seat selection is ON — click to switch this event to general admission (quantity only)' : 'General admission is ON — click to restore seat selection'}
                          >
                            <Armchair className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{evt.usesSeatMap !== false ? 'Seats ON' : 'GA Only'}</span>
                          </button>
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
                            onClick={() => handleOpenCloneModal(evt)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-sky-500/20 text-gray-300 hover:text-sky-400 transition-all cursor-pointer"
                            title="Clone Event into a New Listing"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenNotifyModal(evt)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 transition-all cursor-pointer"
                            title="Email All Ticket Holders"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`This will permanently remove event "${evt.title}" from listings. This action cannot be undone. Sales history for this event is retained in the audit log and booking records.`)) {
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-4 lg:p-6 animate-in fade-in overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-editor-title"
            className="w-full max-w-6xl min-h-full sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] bg-[#141414] border border-[#D4AF37]/30 rounded-none sm:rounded-3xl p-4 sm:p-6 lg:p-8 space-y-6 shadow-2xl overflow-y-auto relative"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start gap-4 border-b border-white/10 pb-4">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#D4AF37] block">
                  {editingEventId ? 'Edit Event Details' : 'New Event Management'}
                </span>
                <h3 id="event-editor-title" className="font-heading font-black text-lg sm:text-xl text-white break-words">
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

                  {/* Admin-controlled seat map toggle */}
                  <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-gray-300 font-bold block mb-0.5">Seat Map / Seat Selection</label>
                        <p className="text-[11px] text-gray-500 leading-snug">
                          Turn off for events that don't need a seat layout — attendees pick ticket
                          quantity only (general admission). Events that ARE already on the seat map
                          keep their map.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={usesSeatMap}
                        onClick={() => setUsesSeatMap((v) => !v)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          usesSeatMap ? 'bg-[#D4AF37]' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            usesSeatMap ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className={`text-[11px] mt-2 ${usesSeatMap ? 'text-[#D4AF37]' : 'text-gray-400'}`}>
                      {usesSeatMap
                        ? 'ON — attendees select exact seats on the map during checkout.'
                        : 'OFF — general admission, quantity only. No seat-selection step.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-gray-300 font-bold block text-xs">Auto-Publish At (Draft → Live) <span className="text-gray-500 font-normal">(Optional)</span></label>
                        {scheduledPublishAt && (
                          <button
                            type="button"
                            onClick={() => setScheduledPublishAt('')}
                            className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="datetime-local"
                        value={scheduledPublishAt}
                        min={todayISO + 'T00:00'}
                        onChange={(e) => setScheduledPublishAt(e.target.value)}
                        className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                      <span className="text-[10px] text-gray-500 block mt-1">Leave empty to keep current status.</span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-gray-300 font-bold block text-xs">Auto-Unpublish At (Take Down) <span className="text-gray-500 font-normal">(Optional)</span></label>
                        {scheduledUnpublishAt && (
                          <button
                            type="button"
                            onClick={() => setScheduledUnpublishAt('')}
                            className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="datetime-local"
                        value={scheduledUnpublishAt}
                        min={todayISO + 'T00:00'}
                        onChange={(e) => setScheduledUnpublishAt(e.target.value)}
                        className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                      />
                      <span className="text-[10px] text-gray-500 block mt-1">Leave empty if no automated take-down is needed.</span>
                    </div>
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

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Artists & Performers (One per line: Name | Role)</label>
                  <textarea
                    rows={2}
                    value={artistsText}
                    onChange={(e) => setArtistsText(e.target.value)}
                    placeholder={"e.g. Arijit Singh | Headliner\nDJ Shadow | Opening Act"}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Line format: Performer Name | Stage Role (e.g. Main Stage, Headliner, DJ, Comedian).
                  </p>
                </div>

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Perks & Features (What Attendees Get — Comma Separated)</label>
                  <textarea
                    rows={2}
                    value={perksText}
                    onChange={(e) => setPerksText(e.target.value)}
                    placeholder="e.g. Complimentary Welcome Kit, Free Parking, Live DJ After-Party, Food & Beverage Credits"
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Shown in the “What&apos;s Included” panel beside the seat map during checkout and on the event page.
                    Leave blank if the event has no extra inclusions.
                  </p>
                </div>

                {/* Extended customizations: presenter, maps link, featured flags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Presented By / Organized By Line</label>
                    <input
                      type="text"
                      value={presentedBy}
                      onChange={(e) => setPresentedBy(e.target.value)}
                      placeholder="e.g. DYP Hospitality Pvt Ltd & The Sayaji Kolhapur"
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Optional. Overwrites “Organized By” display on the event page.</p>
                  </div>
                  <div>
                    <label className="text-gray-300 font-bold block mb-1">Google Maps URL</label>
                    <input
                      type="url"
                      value={mapsUrl}
                      onChange={(e) => setMapsUrl(e.target.value)}
                      placeholder="e.g. https://maps.app.goo.gl/..."
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Optional. Overrides the default address-based map link.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-gray-300 font-bold block mb-0.5">External Booking Website</label>
                        <p className="text-[11px] text-gray-500">Turn on to show the external booking option on the public event page.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={externalBookingEnabled}
                        onClick={() => setExternalBookingEnabled((enabled) => !enabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          externalBookingEnabled ? 'bg-[#D4AF37]' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            externalBookingEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {externalBookingEnabled && (
                      <div className="pt-3 border-t border-white/10 animate-in fade-in">
                        <label className="text-gray-300 font-bold block mb-1">External Booking URL</label>
                        <input
                          type="url"
                          value={externalBookingUrl}
                          onChange={(e) => setExternalBookingUrl(e.target.value)}
                          placeholder="e.g. https://ticketkhidakee.com/..."
                          className="w-full bg-[#121212] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">Only a valid http:// or https:// link will be shown to visitors.</p>
                        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                          <div>
                            <label className="text-gray-300 font-bold block mb-0.5 text-xs">Show Ticket Prices & Info Publicly</label>
                            <p className="text-[10px] text-gray-500">Turn OFF to hide ticket price, tier, and availability information on the public event page.</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={externalBookingShowTicketInfo}
                            onClick={() => setExternalBookingShowTicketInfo((show) => !show)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                              externalBookingShowTicketInfo ? 'bg-[#D4AF37]' : 'bg-gray-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                externalBookingShowTicketInfo ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-gray-300 font-bold block mb-0.5 text-xs">Featured Headliner</label>
                        <p className="text-[10px] text-gray-500">Show in hero section.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isFeatured}
                        onClick={() => setIsFeatured((v) => !v)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          isFeatured ? 'bg-[#D4AF37]' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            isFeatured ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-gray-300 font-bold block mb-0.5 text-xs">Trending Flag</label>
                        <p className="text-[10px] text-gray-500">Trending shows feed.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isTrending}
                        onClick={() => setIsTrending((v) => !v)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          isTrending ? 'bg-[#D4AF37]' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            isTrending ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="text-gray-300 font-bold block mb-0.5 text-xs">Popular This Week</label>
                        <p className="text-[10px] text-gray-500">Highlight badge.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isPopularThisWeek}
                        onClick={() => setIsPopularThisWeek((v) => !v)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          isPopularThisWeek ? 'bg-[#D4AF37]' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            isPopularThisWeek ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#1C1C1C] border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-amber-300 font-bold block mb-0.5 text-xs">Informational / Walk-In Counter Mode</label>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">INFO ONLY</span>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        When enabled, local checkout is hidden. Guests can be sent to the external booking link below, or shown counter information.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isAdvertiseOnly}
                      onClick={handleAdvertiseOnlyToggle}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        isAdvertiseOnly ? 'bg-amber-500' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          isAdvertiseOnly ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {isAdvertiseOnly && (
                    <div className="pt-3 border-t border-white/10 space-y-3 animate-in fade-in">
                      <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider block">
                        Physical Ticket Counter Details (Shown on Event Page)
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-gray-300 font-bold block mb-1 text-xs">Counter Location</label>
                          <input
                            type="text"
                            value={counterLocation}
                            onChange={(e) => setCounterLocation(e.target.value)}
                            placeholder="e.g. Main Gate Box Office Counter 1 & 2"
                            className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 font-bold block mb-1 text-xs">Operating Hours</label>
                          <input
                            type="text"
                            value={counterTimingText}
                            onChange={(e) => setCounterTimingText(e.target.value)}
                            placeholder="e.g. 10:00 AM – 8:00 PM Daily"
                            className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 font-bold block mb-1 text-xs">Contact Phone / Desk</label>
                          <input
                            type="text"
                            value={counterContactPhone}
                            onChange={(e) => setCounterContactPhone(e.target.value)}
                            placeholder="e.g. +91 98765 43210"
                            className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assign Multiple Physical Ticket Counters from Admin Counter Panel */}
                <div className="p-4 rounded-xl bg-[#1C1C1C] border border-[#D4AF37]/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-white font-bold block mb-0.5 text-xs flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-[#D4AF37]" />
                        Assigned Ticket Counters (Box Office Stations)
                      </label>
                      <p className="text-[11px] text-gray-400">
                        Select physical ticket counters from the Counter Panel where attendees can purchase or pick up tickets for this event.
                      </p>
                    </div>
                    {availableCounters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (assignedCounterIds.length === availableCounters.length) {
                            setAssignedCounterIds([]);
                          } else {
                            setAssignedCounterIds(availableCounters.map((c) => c.id));
                          }
                        }}
                        className="text-[11px] font-bold text-[#D4AF37] hover:underline cursor-pointer shrink-0"
                      >
                        {assignedCounterIds.length === availableCounters.length ? 'Deselect All' : 'Select All Counters'}
                      </button>
                    )}
                  </div>

                  {availableCounters.length === 0 ? (
                    <div className="p-3 bg-black/40 rounded-xl text-xs text-gray-400 border border-white/5">
                      No active counters configured in the Counter Panel yet. You can create ticket counter stations under <span className="text-[#D4AF37] font-semibold">Admin Panel &rarr; Ticket Counters</span>.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto p-1">
                      {availableCounters.map((c) => {
                        const isChecked = assignedCounterIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              if (isChecked) {
                                setAssignedCounterIds(assignedCounterIds.filter((id) => id !== c.id));
                              } else {
                                setAssignedCounterIds([...assignedCounterIds, c.id]);
                              }
                            }}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-md'
                                : 'bg-[#121212] border-white/10 text-gray-400 hover:border-white/25'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-0.5 rounded text-[#D4AF37] focus:ring-[#D4AF37] accent-[#D4AF37]"
                            />
                            <div className="text-xs space-y-0.5 min-w-0 flex-1">
                              <span className="font-bold text-white block truncate">{c.name}</span>
                              {(c.venue || c.city) && (
                                <span className="text-[10px] text-gray-400 block truncate">
                                  📍 {c.venue}{c.city ? `, ${c.city}` : ''}
                                </span>
                              )}
                              {c.operatingHours && (
                                <span className="text-[10px] text-amber-300/90 block">
                                  🕒 {c.operatingHours}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#1C1C1C] border border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-gray-300 font-bold block mb-0.5 text-xs">Cash at Ticket Counter Only Mode</label>
                      <p className="text-[11px] text-gray-500">
                        When enabled, attendees reserve their booking online and settle cash directly at the venue counter.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={cashOnCounterOnly}
                      onClick={() => setCashOnCounterOnly((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        cashOnCounterOnly ? 'bg-[#D4AF37]' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          cashOnCounterOnly ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Showtime Schedule</label>
                  <textarea
                    rows={3}
                    value={scheduleText}
                    onChange={(e) => setScheduleText(e.target.value)}
                    placeholder={"One line per item: time | title | description\ne.g. 07:30 PM | Doors Open | Registration & Welcome\n08:00 PM | Live Band | Sufi performances"}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Optional. Shown as the showtime schedule on the event page.</p>
                </div>

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Frequently Asked Questions</label>
                  <textarea
                    rows={3}
                    value={faqsText}
                    onChange={(e) => setFaqsText(e.target.value)}
                    placeholder={"One FAQ per line: question :: answer\ne.g. When do doors open? :: 60 minutes before showtime\nIs parking free? :: Yes, complimentary parking for guests"}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Optional. Leave blank to use the default FAQ set.</p>
                </div>

                <div>
                  <label className="text-gray-300 font-bold block mb-1">Gallery Image URLs</label>
                  <textarea
                    rows={3}
                    value={galleryUrls.join('\n')}
                    onChange={(e) => setGalleryUrls(e.target.value.split('\n').map((u) => u.trim()).filter(Boolean))}
                    placeholder={"One URL per line\nhttps://..."}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#D4AF37]"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Optional. Falls back to poster & cover if left empty.</p>
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
                    <label className="text-gray-300 font-bold block mb-1">Full Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. The Sayaji, DYP City Mall, Kolhapur"
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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/5 pb-2">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Poster Image Upload */}
                  <div className="p-3 sm:p-4 bg-[#1C1C1C] border border-white/10 rounded-2xl space-y-3">
                    <span className="font-bold text-white block text-xs">Poster Image (Vertical)</span>
                    <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-3">
                      <img
                        src={posterUrl}
                        alt="Poster Preview"
                        className="w-16 h-20 rounded-xl object-cover bg-black border border-white/10 shrink-0"
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
                  <div className="p-3 sm:p-4 bg-[#1C1C1C] border border-white/10 rounded-2xl space-y-3">
                    <span className="font-bold text-white block text-xs">Cover Banner (Wide)</span>
                    <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-3">
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

                  {/* Card Image Upload */}
                  <div className="p-3 sm:p-4 bg-[#1C1C1C] border border-white/10 rounded-2xl space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white block text-xs">Event Card Image (Square / 1:1)</span>
                      <span className="text-[10px] text-gray-500 font-medium">Used for homepage & search cards</span>
                    </div>
                    <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center gap-3">
                      <img
                        src={cardImageUrl || posterUrl}
                        alt="Card Preview"
                        className="w-16 h-16 rounded-xl object-cover bg-black border border-white/10 shrink-0"
                      />
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex gap-2">
                          <label className="cursor-pointer py-2 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 transition-all flex-1">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploading ? 'Uploading...' : 'Choose File'}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              onChange={(e) => handleFileUpload(e, 'card')}
                              className="hidden"
                            />
                          </label>
                          {cardImageUrl && (
                            <button
                              type="button"
                              onClick={() => setCardImageUrl('')}
                              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-[11px] font-bold border border-red-500/20 transition-all"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <input
                          type="url"
                          placeholder="Or paste image URL (Optional - defaults to poster)"
                          value={cardImageUrl}
                          onChange={(e) => setCardImageUrl(e.target.value)}
                          className="w-full bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Ticket Pricing Tiers & Inventory */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-2">
                  <h4 className="text-gray-400 uppercase font-black tracking-wider text-[10px]">
                    4. Ticket Categories & Pricing Tiers
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {isAdvertiseOnly && externalBookingEnabled && externalBookingUrl.trim()
                      ? 'External booking is enabled — leave this section empty because Ticket Khidakee handles ticket sales and capacity.'
                      : 'Add at least one local tier for Ash-vish ticket sales, or enable external booking for an advertisement-only listing.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="w-full sm:w-auto justify-center py-2 sm:py-1.5 px-3 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Pricing Tier</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {tiers.length === 0 ? (
                    <div className="p-5 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 text-center">
                      <TicketIcon className="w-6 h-6 text-amber-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-amber-200">No local ticket tiers</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {isAdvertiseOnly
                          ? 'This listing will send guests to the external booking provider.'
                          : 'Add a pricing tier before publishing a regular Ash-vish event.'}
                      </p>
                    </div>
                  ) : (
                    tiers.map((t, idx) => (
                    <div
                      key={t.id}
                      className="p-4 bg-[#1A1A1A] border border-white/10 rounded-2xl space-y-3 relative group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-white text-xs flex items-center gap-2">
                          <TicketIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                          Tier #{idx + 1}
                        </span>
                        {(tiers.length > 1 || isAdvertiseOnly) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(t.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 gap-3">
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

                        <div>
                          <label className="text-gray-400 text-[10px] font-bold block mb-1">Tickets Left (Live)</label>
                          <div className="w-full bg-black/40 border border-white/5 rounded-lg px-2.5 py-2 text-[#D4AF37] font-black text-xs flex items-center justify-between">
                            <span>{t.remainingInventory ?? t.totalInventory}</span>
                            <span className="text-[9px] text-gray-500 uppercase tracking-tighter">Auto-Reconciled</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 min-[520px]:grid-cols-2 gap-3">
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
                    ))
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-white/10 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto py-3 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || isSaving}
                  className="w-full sm:w-auto py-3 px-7 rounded-xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs shadow-xl shadow-[#D4AF37]/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : editingEventId ? (
                    'Save & Sync Changes'
                  ) : (
                    'Publish Event Now'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clone Event Modal (Prompt B) */}
      {cloneTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-[#D4AF37] block">Clone Event</span>
                <h3 className="font-heading font-black text-lg text-white">Clone “{cloneTarget.title}”</h3>
              </div>
              <button
                onClick={() => setCloneTarget(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Cloning copies the event listing, pricing tiers, and seat-map configuration into a brand-new
              listing. Sales history, tickets, and orders stay with the original event and remain visible in
              the audit log. Override the date, time, or title for the new listing below.
            </p>
            <form onSubmit={handleCloneEvent} className="space-y-3">
              <div>
                <label className="text-gray-300 font-bold block mb-1 text-xs">New Title (optional)</label>
                <input
                  type="text"
                  value={cloneNewTitle}
                  onChange={(e) => setCloneNewTitle(e.target.value)}
                  placeholder={`e.g. ${cloneTarget.title} — Edition 2`}
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-300 font-bold block mb-1 text-xs">New Date</label>
                  <input
                    type="date"
                    value={cloneNewDate}
                    min={todayISO}
                    onChange={(e) => setCloneNewDate(e.target.value)}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="text-gray-300 font-bold block mb-1 text-xs">New Time</label>
                  <input
                    type="text"
                    value={cloneNewTime}
                    onChange={(e) => setCloneNewTime(e.target.value)}
                    placeholder={cloneTarget.time}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloneTarget(null)}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs cursor-pointer"
                >
                  Clone Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notify All Ticket Holders Modal (Item 6) */}
      {notifyTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-[#141414] border border-[#D4AF37]/30 rounded-3xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-[#D4AF37] block">Event Notification</span>
                <h3 className="font-heading font-black text-lg text-white">Email All Holders — “{notifyTarget.title}”</h3>
              </div>
              <button
                onClick={() => setNotifyTarget(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Compose an email to reach every unique email address attached to confirmed bookings for this
              event. Holders are only emailed once each. This is recorded in the audit log and the
              notifications ledger, regardless of whether a real SMTP server is configured.
            </p>
            <div className="rounded-xl bg-[#1C1C1C] border border-white/10 px-4 py-3 text-center">
              <span className="text-gray-400 text-[11px] uppercase font-bold tracking-wider">Estimated Recipients</span>
              <div className="text-2xl font-black text-[#D4AF37] font-mono">{notifyRecipientCount}</div>
              <span className="text-gray-500 text-[10px]">unique ticket-holder email addresses</span>
            </div>
            <form onSubmit={handleSendNotifications} className="space-y-3">
              <div>
                <label className="text-gray-300 font-bold block mb-1 text-xs">Subject</label>
                <input
                  type="text"
                  value={notifySubject}
                  onChange={(e) => setNotifySubject(e.target.value)}
                  placeholder="Update regarding your booking"
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="text-gray-300 font-bold block mb-1 text-xs">Message</label>
                <textarea
                  rows={5}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Announce schedule changes, gate updates, or post-event follow-ups..."
                  className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#D4AF37] resize-y"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNotifyTarget(null)}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={notifySending}
                  className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] hover:brightness-110 active:scale-95 text-black font-extrabold text-xs cursor-pointer disabled:opacity-50"
                >
                  {notifySending ? 'Sending…' : 'Send Notifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
