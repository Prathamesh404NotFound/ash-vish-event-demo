import React, { useState } from 'react';
import { Tag, Plus, Trash2, AlertCircle, Edit, Power } from 'lucide-react';
import { RowActions } from '../../components/admin/RowActions';
import { useBooking } from '../../contexts/BookingContext';
import { Coupon } from '../../types';

export const AdminCoupons: React.FC = () => {
  const { coupons, createCoupon, toggleCouponStatus, deleteCoupon, updateCoupon, events } = useBooking();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState<number>(20);
  const [validUntil, setValidUntil] = useState('2028-12-31');
  const [noExpiry, setNoExpiry] = useState(false);
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [eventId, setEventId] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal state (Prompt B: update existing coupons)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [editType, setEditType] = useState<'percentage' | 'fixed'>('percentage');
  const [editValue, setEditValue] = useState<number>(20);
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editNoExpiry, setEditNoExpiry] = useState(false);
  const [editUsageLimit, setEditUsageLimit] = useState<number | ''>('');
  const [editEventId, setEditEventId] = useState<string>('');
  const [editErrorMsg, setEditErrorMsg] = useState('');

  const handleOpenEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setEditType(coupon.type);
    setEditValue(coupon.value);
    setEditValidUntil(coupon.validUntil);
    setEditNoExpiry(!coupon.validUntil);
    setEditUsageLimit(coupon.usageLimit ?? '');
    setEditEventId(coupon.eventId || '');
    setEditErrorMsg('');
  };

  const handleUpdateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon) return;
    setIsSubmitting(true);
    setEditErrorMsg('');
    const success = await updateCoupon(editingCoupon.code, {
      type: editType,
      value: Number(editValue),
      validUntil: editNoExpiry ? null : editValidUntil,
      usageLimit: editUsageLimit !== '' ? Number(editUsageLimit) : null,
      eventId: editEventId || null,
      isActive: editingCoupon.isActive,
    });
    setIsSubmitting(false);
    if (success) {
      setEditingCoupon(null);
    } else {
      setEditErrorMsg('Failed to update the coupon. Please try again.');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMsg('Coupon code is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const success = await createCoupon({
      code: code.trim().toUpperCase(),
      type,
      value: Number(value),
      validUntil: noExpiry ? '' : validUntil,
      usageLimit: usageLimit !== '' ? Number(usageLimit) : undefined,
      eventId: eventId || undefined,
      isActive: true,
    });

    setIsSubmitting(false);

    if (success) {
      setIsModalOpen(false);
      setCode('');
      setValue(20);
      setUsageLimit('');
      setEventId('');
    } else {
      setErrorMsg('Failed to create coupon code. Please try again.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414] border border-white/10 rounded-3xl p-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-[#D4AF37]" />
            <span>Coupons & Discount Engine</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Create promotional codes, set expiration windows, and enforce usage limits server-side.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#D4AF37] text-black font-extrabold text-xs  cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Create New Coupon</span>
        </button>
      </div>

      {/* Coupons List Table */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white">Active Promo Codes ({coupons.length})</h2>
        </div>

        <div className="responsive-table-scroll">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#1C1C1C] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-6 py-4">Coupon Code</th>
                <th className="px-6 py-4">Discount</th>
                <th className="px-6 py-4">Valid Until</th>
                <th className="px-6 py-4">Redemptions</th>
                <th className="px-6 py-4">Restriction</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No active coupons created yet. Click "Create New Coupon" to get started.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => {
                  const isExpired = new Date(c.validUntil) < new Date();
                  const eventName = c.eventId ? events.find(e => e.id === c.eventId)?.title || c.eventId : 'All Events';

                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-sm text-[#D4AF37]">
                        {c.code}
                      </td>
                      <td className="px-6 py-4 font-bold text-white">
                        {c.type === 'percentage' ? `${c.value}% OFF` : `₹${c.value} OFF`}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-400">
                        {c.validUntil ? c.validUntil : 'No Expiry'}
                        {isExpired && <span className="ml-2 text-[10px] text-red-400 font-bold">(EXPIRED)</span>}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        <span className="text-white font-bold">{c.usedCount}</span>
                        <span className="text-gray-500"> / {c.usageLimit ? c.usageLimit : '∞'}</span>
                      </td>
                      <td className="px-6 py-4 max-w-[180px] truncate text-gray-400">
                        {eventName}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleCouponStatus(c.code)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            c.isActive && !isExpired
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-500/10 text-red-400 border-red-500/30'
                          }`}
                        >
                          {c.isActive && !isExpired ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <RowActions
                          closeKey={c.code}
                          actions={[
                            {
                              label: c.isActive && !isExpired ? 'Deactivate' : 'Activate',
                              icon: <Power className="w-4 h-4" />,
                              onClick: () => toggleCouponStatus(c.code),
                              variant: c.isActive && !isExpired ? 'danger' : 'success',
                            },
                            {
                              label: 'Edit Coupon',
                              icon: <Edit className="w-4 h-4" />,
                              onClick: () => handleOpenEditModal(c),
                            },
                            {
                              label: 'Delete Coupon',
                              icon: <Trash2 className="w-4 h-4" />,
                              onClick: () => deleteCoupon(c.code),
                              variant: 'danger',
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Coupon Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#D4AF37]" />
                <span>Create Discount Coupon</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateCoupon} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Coupon Code (e.g., FESTIVE30)</label>
                <input
                  type="text"
                  required
                  placeholder="FESTIVE30"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white uppercase font-mono text-sm focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Discount Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="percentage">Percentage (%) Off</option>
                    <option value="fixed">Fixed Amount (₹) Off</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">
                    {type === 'percentage' ? 'Percentage Value (%)' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Expiration Date</label>
                  <input
                    type="date"
                    required={!noExpiry}
                    disabled={noExpiry}
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 mt-2 text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noExpiry}
                      onChange={(e) => setNoExpiry(e.target.checked)}
                      className="accent-[#D4AF37]"
                    />
                    <span className="text-[11px]">No expiry (never expires)</span>
                  </label>
                </div>

                <div>
                  <label className="font-bold text-gray-300 block mb-1">Total Usage Limit (Optional)</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Event Restriction (Optional)</label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="">Applicable to ALL Events</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({evt.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#D4AF37] text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Save & Activate Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Coupon Modal (Prompt B) */}
      {editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#D4AF37]" />
                <span>Edit Coupon “{editingCoupon.code}”</span>
              </h3>
              <button
                onClick={() => setEditingCoupon(null)}
                className="text-gray-400 hover:text-white text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editErrorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCoupon} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Coupon Code (read-only)</label>
                <input
                  type="text"
                  readOnly
                  value={editingCoupon.code}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-gray-400 uppercase font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Discount Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="percentage">Percentage (%) Off</option>
                    <option value="fixed">Fixed Amount (₹) Off</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">
                    {editType === 'percentage' ? 'Percentage Value (%)' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editValue}
                    onChange={(e) => setEditValue(Number(e.target.value))}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Expiration Date</label>
                  <input
                    type="date"
                    required={!editNoExpiry}
                    disabled={editNoExpiry}
                    value={editValidUntil}
                    onChange={(e) => setEditValidUntil(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 mt-2 text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editNoExpiry}
                      onChange={(e) => setEditNoExpiry(e.target.checked)}
                      className="accent-[#D4AF37]"
                    />
                    <span className="text-[11px]">No expiry (never expires)</span>
                  </label>
                </div>
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Total Usage Limit (Optional)</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={editUsageLimit}
                    onChange={(e) => setEditUsageLimit(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Event Restriction (Optional)</label>
                <select
                  value={editEventId}
                  onChange={(e) => setEditEventId(e.target.value)}
                  className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="">Applicable to ALL Events</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title} ({evt.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingCoupon(null)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#D4AF37] text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
