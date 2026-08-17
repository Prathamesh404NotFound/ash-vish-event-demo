import React, { useState, useEffect, useCallback } from 'react';
import {
  Armchair, Plus, Edit3, Power, Eraser, Users, X, AlertTriangle, MapPin, KeyRound,
} from 'lucide-react';
import { safeFetch } from '../../lib/api';
import { authenticatedApiHeaders } from '../../lib/authHeaders';
import { useBooking } from '../../contexts/BookingContext';

interface Counter {
  id: string;
  name: string;
  venue: string;
  status: 'active' | 'inactive';
  merchantUpi: { vpa: string; name: string };
  assignedStaffIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface StaffMember {
  uid: string;
  email: string;
  name?: string;
  role?: string;
  status?: string;
}

const VPA_RE = /^[A-Za-z0-9.\-_]{2,64}@[A-Za-z0-9.\-_]{2,64}$/;

export const AdminCounters: React.FC = () => {
  const { showToast } = useBooking();
  const [counters, setCounters] = useState<Counter[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Selection for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newStaff, setNewStaff] = useState<string[]>([]);

  // Edit modal (per-counter)
  const [editing, setEditing] = useState<Counter | null>(null);
  const [editName, setEditName] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editUpi, setEditUpi] = useState('');
  const [editUpiName, setEditUpiName] = useState('');
  const [editUpiClear, setEditUpiClear] = useState(false);
  const [editStaff, setEditStaff] = useState<string[]>([]);

  // Batch dialog
  const [batchMode, setBatchMode] = useState<'upi' | 'staff' | 'status' | 'clear-upi' | null>(null);
  const [batchUpi, setBatchUpi] = useState('');
  const [batchUpiName, setBatchUpiName] = useState('');
  const [batchStaff, setBatchStaff] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<'active' | 'inactive'>('inactive');

  const [saving, setSaving] = useState(false);

  const staffName = useCallback(
    (uid: string) => staffList.find((s) => s.uid === uid)?.name || staffList.find((s) => s.uid === uid)?.email || uid.slice(0, 8),
    [staffList]
  );

  const maskVpa = (vpa: string) => {
    if (!vpa) return '—';
    const [local, domain] = vpa.split('@');
    if (local.length <= 2) return `${local[0]}…@${domain}`;
    return `${local[0]}${'•'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authenticatedApiHeaders();
      const [cRes, sRes] = await Promise.all([
        safeFetch<any>('/api/admin/counters', { headers }),
        safeFetch<any>('/api/staff', { headers }),
      ]);
      if (cRes.ok && cRes.data?.success) setCounters(cRes.data.counters || []);
      else setError(cRes.data?.error || 'Failed to load counters.');
      if (sRes.ok && sRes.data?.success) setStaffList(sRes.data.staff || []);
    } catch (err: any) {
      setError(err?.message || 'Network error while loading counters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const api = async (path: string, init: RequestInit) => {
    const res = await safeFetch<any>(path, { ...init, headers: await authenticatedApiHeaders() });
    return res;
  };

  const jsonBody = (body: any): RequestInit => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // ---------- Create ----------
  const openCreate = () => {
    setNewName('');
    setNewVenue('');
    setNewStaff([]);
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (newName.trim().length < 2) {
      showToast('Counter name must be at least 2 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api('/api/admin/counters', jsonBody({ name: newName.trim(), venue: newVenue.trim(), assignedStaffIds: newStaff }));
      if (res.ok && res.data?.success) {
        showToast(`Counter "${newName.trim()}" created.`, 'success');
        setShowCreate(false);
        await loadAll();
      } else {
        showToast(res.data?.error || 'Could not create counter.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Per-counter edit ----------
  const openEdit = (c: Counter) => {
    setEditing(c);
    setEditName(c.name);
    setEditVenue(c.venue);
    setEditUpi(c.merchantUpi?.vpa || '');
    setEditUpiName(c.merchantUpi?.name || '');
    setEditUpiClear(false);
    setEditStaff([...c.assignedStaffIds]);
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (editName.trim().length < 2) {
      showToast('Counter name must be at least 2 characters.', 'error');
      return;
    }
    const vpa = editUpi.trim();
    if (vpa && !VPA_RE.test(vpa)) {
      showToast("The UPI ID must look like 'merchant@upi' (letters, digits, . _ - only).", 'error');
      return;
    }
    setSaving(true);
    try {
      const merchantUpi = editUpiClear ? null : vpa ? { vpa, ...(editUpiName.trim() ? { name: editUpiName.trim().slice(0, 25) } : {}) } : undefined;
      const res = await api(`/api/admin/counters/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          venue: editVenue.trim(),
          status: editing.status,
          ...(merchantUpi !== undefined ? { merchantUpi } : {}),
          assignedStaffIds: editStaff,
        }),
      });
      if (res.ok && res.data?.success) {
        showToast(`Counter "${editName.trim()}" updated.`, 'success');
        setEditing(null);
        await loadAll();
      } else {
        showToast(res.data?.error || 'Could not update counter.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleCounterStatus = async (c: Counter) => {
    setSaving(true);
    try {
      const res = await api(`/api/admin/counters/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: c.status === 'active' ? 'inactive' : 'active' }),
      });
      if (res.ok && res.data?.success) {
        showToast(`Counter "${c.name}" ${c.status === 'active' ? 'deactivated' : 'activated'}.`, 'success');
        await loadAll();
      } else {
        showToast(res.data?.error || 'Could not change counter status.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteCounter = async (c: Counter) => {
    const confirmed = window.confirm(
      c.status === 'active'
        ? `"${c.name}" is active and will be deactivated first. To remove it permanently, deactivate then delete again. Continue?`
        : `Permanently delete counter "${c.name}"? It can only be deleted when it has no recorded sales.`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await api(`/api/admin/counters/${c.id}`, { method: 'DELETE' });
      if (res.ok && res.data?.success) {
        showToast(res.data.note || `Counter "${c.name}" removed.`, 'success');
        await loadAll();
      } else {
        showToast(res.data?.error || 'Could not delete counter.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Batch ----------
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitBatch = async () => {
    if (selectedIds.size === 0) {
      showToast('Select at least one counter first.', 'error');
      return;
    }
    const patch: any = {};
    if (batchMode === 'upi') {
      const vpa = batchUpi.trim();
      if (!vpa) {
        showToast('Enter a UPI ID for the batch update.', 'error');
        return;
      }
      if (!VPA_RE.test(vpa)) {
        showToast("The UPI ID must look like 'merchant@upi' (letters, digits, . _ - only).", 'error');
        return;
      }
      patch.merchantUpi = { vpa, ...(batchUpiName.trim() ? { name: batchUpiName.trim().slice(0, 25) } : {}) };
    } else if (batchMode === 'staff') {
      patch.assignedStaffIds = batchStaff;
    } else if (batchMode === 'status') {
      patch.status = batchStatus;
    } else if (batchMode === 'clear-upi') {
      patch.merchantUpi = null;
    } else {
      return;
    }
    setSaving(true);
    try {
      const res = await api('/api/admin/counters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterIds: Array.from(selectedIds), patch }),
      });
      if (res.ok && res.data?.success) {
        const failed = (res.data.outcomes || []).filter((o: any) => !o.success);
        showToast(
          failed.length ? `Batch applied with ${failed.length} failure(s).` : `Batch applied to ${selectedIds.size} counter(s).`,
          failed.length ? 'error' : 'success'
        );
        setBatchMode(null);
        setSelectedIds(new Set());
        await loadAll();
      } else {
        showToast(res.data?.error || 'Batch update failed (all-or-nothing).', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const openBatchUpi = () => {
    setBatchMode('upi');
    setBatchUpi('');
    setBatchUpiName('');
  };

  const openBatchStaff = () => {
    setBatchMode('staff');
    setBatchStaff([]);
  };

  const openBatchStatus = (status: 'active' | 'inactive') => {
    setBatchMode('status');
    setBatchStatus(status);
  };

  const toggleBatchStaff = (uid: string) => {
    setBatchStaff((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  // ---------- Render helpers ----------
  const StaffChips: React.FC<{ ids: string[] }> = ({ ids }) => {
    if (ids.length === 0) return <span className="text-gray-500">Unassigned</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {ids.slice(0, 3).map((uid) => (
          <span key={uid} className="px-2 py-0.5 rounded-full bg-white/5 text-gray-300 text-[10px] border border-white/10 truncate max-w-24">
            {staffName(uid)}
          </span>
        ))}
        {ids.length > 3 && <span className="px-2 py-0.5 rounded-full bg-white/5 text-gray-400 text-[10px]">+{ids.length - 3}</span>}
      </div>
    );
  };

  const staffCheckboxRow = (uid: string, label: string, checked: boolean, onChange: () => void) => (
    <label key={uid} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 cursor-pointer text-gray-300 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[#D4AF37]" />
      <span className="truncate">{label}</span>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide ml-auto">{String((staffList.find((s) => s.uid === uid) as any)?.role || '')}</span>
    </label>
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-[#141414] border border-white/10 rounded-3xl p-12 text-center text-gray-500 text-sm">
          Loading counters&hellip;
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414] border border-white/10 rounded-3xl p-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <Armchair className="w-6 h-6 text-[#D4AF37]" />
            <span>Ticket Counters</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Named ticket-counter stations. Each counter can collect into its own merchant UPI account, or fall back to the global one.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Counter
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-3xl px-5 py-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={loadAll} className="ml-auto px-3 py-1 rounded-xl bg-red-500/10 text-red-300 text-xs font-bold hover:bg-red-500 hover:text-white transition-all cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Batch bar */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-400">
          {selectedIds.size === 0 ? 'Select counters below for batch actions.' : `${selectedIds.size} selected.`}
        </span>
        <div className="flex flex-wrap gap-2 ml-auto">
          <button
            onClick={openBatchUpi}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 text-xs font-bold hover:bg-[#D4AF37]/20 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" /> Set Merchant UPI
          </button>
          <button
            onClick={() => {
              if (selectedIds.size === 0) return;
              if (!window.confirm(`Clear the UPI override on ${selectedIds.size} counter(s)? They will use the global merchant UPI.`)) return;
              setBatchMode('clear-upi');
            }}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 rounded-xl bg-white/5 text-gray-300 border border-white/10 text-xs font-bold hover:bg-white/10 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear UPI (Global)
          </button>
          <button
            onClick={openBatchStaff}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 rounded-xl bg-white/5 text-gray-300 border border-white/10 text-xs font-bold hover:bg-white/10 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" /> Assign Staff
          </button>
          <button
            onClick={() => openBatchStatus('inactive')}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-500/20 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Power className="w-3.5 h-3.5" /> Deactivate
          </button>
          <button
            onClick={() => openBatchStatus('active')}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/20 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Power className="w-3.5 h-3.5" /> Activate
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white">Stations ({counters.length})</h2>
        </div>
        <div className="responsive-table-scroll">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#1C1C1C] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-6 py-4 w-10"></th>
                <th className="px-6 py-4">Counter</th>
                <th className="px-6 py-4">Merchant UPI</th>
                <th className="px-6 py-4">Assigned Staff</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {counters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No counters yet. Create the first station (e.g. &quot;Gate A&quot;) to give each walk-in point its own identity and payment account.
                  </td>
                </tr>
              ) : (
                counters.map((c) => (
                  <tr key={c.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(c.id) ? 'bg-[#D4AF37]/5' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelection(c.id)}
                        className="accent-[#D4AF37]"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-white text-sm flex items-center gap-1.5">
                        {c.name}
                        {c.status === 'inactive' && <span className="text-[10px] text-red-400 font-bold uppercase">Off</span>}
                      </div>
                      {c.venue && (
                        <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {c.venue}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {c.merchantUpi?.vpa ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-[11px] text-[#D4AF37]">{maskVpa(c.merchantUpi.vpa)}</span>
                          <div className="text-[10px] text-emerald-400/70 uppercase tracking-wide">Per-counter override</div>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-[11px]">Global default</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StaffChips ids={c.assignedStaffIds} />
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                          c.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => toggleCounterStatus(c)}
                        title={c.status === 'active' ? 'Deactivate' : 'Activate'}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                          c.status === 'active'
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        title="Edit"
                        className="px-3 py-1.5 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCounter(c)}
                        title={c.status === 'active' ? 'Deactivate & delete' : 'Delete permanently'}
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="New Ticket Counter" onClose={() => setShowCreate(false)} saving={saving}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Counter name (e.g. Gate A)"
            className="w-full px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <input
            value={newVenue}
            onChange={(e) => setNewVenue(e.target.value)}
            placeholder="Venue / location (optional)"
            className="w-full mt-2.5 px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold mt-4 mb-1.5">Assign staff</p>
          <div className="max-h-36 overflow-y-auto border border-white/10 rounded-2xl p-1.5">
            {staffList.length === 0 ? (
              <p className="text-xs text-gray-500 p-2">No staff records yet.</p>
            ) : (
              staffList.map((s) =>
                staffCheckboxRow(s.uid, s.name || s.email || s.uid, newStaff.includes(s.uid), () =>
                  setNewStaff((p) => (p.includes(s.uid) ? p.filter((x) => x !== s.uid) : [...p, s.uid]))
                )
              )
            )}
          </div>
          <button onClick={submitCreate} disabled={saving} className="mt-4 w-full px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer">
            Create Counter
          </button>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)} saving={saving}>
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Counter name"
            className="w-full px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <input
            value={editVenue}
            onChange={(e) => setEditVenue(e.target.value)}
            placeholder="Venue / location (optional)"
            className="w-full mt-2.5 px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold mt-4 mb-1.5">Merchant UPI (per-counter override)</p>
          <div className="rounded-2xl bg-[#1C1C1C] border border-white/10 p-3 space-y-2.5">
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editUpiClear}
                onChange={(e) => {
                  setEditUpiClear(e.target.checked);
                  if (e.target.checked) setEditUpi('');
                }}
                className="accent-[#D4AF37]"
              />
              Clear override — use the global merchant UPI instead
            </label>
            {!editUpiClear && (
              <>
                <input
                  value={editUpi}
                  onChange={(e) => setEditUpi(e.target.value)}
                  placeholder="Merchant UPI ID (e.g. store@upi)"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
                />
                <input
                  value={editUpiName}
                  onChange={(e) => setEditUpiName(e.target.value)}
                  placeholder="Display name (optional)"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
                />
              </>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold mt-4 mb-1.5">Assign staff</p>
          <div className="max-h-36 overflow-y-auto border border-white/10 rounded-2xl p-1.5">
            {staffList.length === 0 ? (
              <p className="text-xs text-gray-500 p-2">No staff records yet.</p>
            ) : (
              staffList.map((s) =>
                staffCheckboxRow(s.uid, s.name || s.email || s.uid, editStaff.includes(s.uid), () =>
                  setEditStaff((p) => (p.includes(s.uid) ? p.filter((x) => x !== s.uid) : [...p, s.uid]))
                )
              )
            )}
          </div>
          <button onClick={submitEdit} disabled={saving} className="mt-4 w-full px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer">
            Save Changes
          </button>
        </Modal>
      )}

      {/* Batch UPI dialog */}
      {batchMode === 'upi' && (
        <Modal title={`Set Merchant UPI for ${selectedIds.size} counter(s)`} onClose={() => setBatchMode(null)} saving={saving}>
          <p className="text-xs text-gray-400 mb-2.5">
            This writes one merchant UPI ID to every selected counter as a per-counter override.
          </p>
          <input
            autoFocus
            value={batchUpi}
            onChange={(e) => setBatchUpi(e.target.value)}
            placeholder="Merchant UPI ID (e.g. store@upi)"
            className="w-full px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <input
            value={batchUpiName}
            onChange={(e) => setBatchUpiName(e.target.value)}
            placeholder="Display name (optional)"
            className="w-full mt-2.5 px-3 py-2.5 rounded-2xl bg-[#1C1C1C] border border-white/10 text-white text-sm placeholder:text-gray-500 focus:border-[#D4AF37]/60 focus:outline-none"
          />
          <button onClick={submitBatch} disabled={saving} className="mt-4 w-full px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer">
            Apply to {selectedIds.size} Counter(s)
          </button>
        </Modal>
      )}

      {/* Batch clear-UPI dialog */}
      {batchMode === 'clear-upi' && (
        <Modal title="Clear UPI Override" onClose={() => setBatchMode(null)} saving={saving}>
          <p className="text-xs text-gray-400 mb-3">
            Removing the per-counter UPI on {selectedIds.size} counter(s) makes them fall back to the global merchant UPI config.
          </p>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                const res = await api('/api/admin/counters', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ counterIds: Array.from(selectedIds), patch: { merchantUpi: null } }),
                });
                if (res.ok && res.data?.success) {
                  showToast(`UPI override cleared on ${selectedIds.size} counter(s).`, 'success');
                  setBatchMode(null);
                  setSelectedIds(new Set());
                  await loadAll();
                } else {
                  showToast(res.data?.error || 'Batch clear failed.', 'error');
                }
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="w-full px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Confirm — Use Global UPI
          </button>
        </Modal>
      )}

      {/* Batch staff dialog */}
      {batchMode === 'staff' && (
        <Modal title={`Assign Staff to ${selectedIds.size} counter(s)`} onClose={() => setBatchMode(null)} saving={saving}>
          <p className="text-xs text-gray-400 mb-2.5">
            Replaces the assigned staff list on every selected counter with the selection below (leave empty to clear).
          </p>
          <div className="max-h-48 overflow-y-auto border border-white/10 rounded-2xl p-1.5">
            {staffList.length === 0 ? (
              <p className="text-xs text-gray-500 p-2">No staff records yet.</p>
            ) : (
              staffList.map((s) =>
                staffCheckboxRow(s.uid, s.name || s.email || s.uid, batchStaff.includes(s.uid), () => toggleBatchStaff(s.uid))
              )
            )}
          </div>
          <button onClick={submitBatch} disabled={saving} className="mt-4 w-full px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer">
            Assign {batchStaff.length || 'no'} Staff to {selectedIds.size} Counter(s)
          </button>
        </Modal>
      )}

      {/* Batch status dialog */}
      {batchMode === 'status' && (
        <Modal title={batchStatus === 'inactive' ? 'Deactivate Counters' : 'Activate Counters'} onClose={() => setBatchMode(null)} saving={saving}>
          <p className="text-xs text-gray-400 mb-3">
            {batchStatus === 'inactive'
              ? 'Deactivate selected counters so staff can no longer sell from them.'
              : 'Activate selected counters so staff can sell from them.'}
          </p>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                const res = await api('/api/admin/counters', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ counterIds: Array.from(selectedIds), patch: { status: batchStatus } }),
                });
                if (res.ok && res.data?.success) {
                  showToast(`Counters ${batchStatus === 'inactive' ? 'deactivated' : 'activated'}.`, 'success');
                  setBatchMode(null);
                  setSelectedIds(new Set());
                  await loadAll();
                } else {
                  showToast(res.data?.error || 'Batch status change failed.', 'error');
                }
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className={`w-full px-4 py-2.5 rounded-2xl text-black font-bold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37]`}
          >
            Confirm — {batchStatus === 'inactive' ? 'Deactivate' : 'Activate'} {selectedIds.size}
          </button>
        </Modal>
      )}
    </div>
  );
};

// ---------- Shared modal shell ----------
const Modal: React.FC<{ title: string; onClose: () => void; saving: boolean; children: React.ReactNode }> = ({
  title,
  onClose,
  saving,
  children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
    <div
      className="w-full max-w-md bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-bold text-base text-white">{title}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors cursor-pointer" disabled={saving} aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
