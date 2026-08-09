import React, { useState } from 'react';
import { Tag, Plus, CheckCircle2, XCircle, Trash2, Calendar, AlertCircle, Percent, DollarSign, Filter } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';
import { Coupon } from '../../types';

export const AdminCoupons: React.FC = () => {
  const { coupons, createCoupon, toggleCouponStatus, deleteCoupon, events } = useBooking();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState<number>(20);
  const [validUntil, setValidUntil] = useState('2028-12-31');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [eventId, setEventId] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      validUntil,
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
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 cursor-pointer self-start sm:self-auto"
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

        <div className="overflow-x-auto">
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
                        {c.validUntil}
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
                        <button
                          onClick={() => deleteCoupon(c.code)}
                          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                          title="Delete Coupon"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
          <div className="bg-[#181818] border border-[#D4AF37]/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl relative">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">Expiration Date</label>
                  <input
                    type="date"
                    required
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
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

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Save & Activate Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
