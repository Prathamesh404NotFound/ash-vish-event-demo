import React, { useState } from 'react';
import { Star, Eye, EyeOff, Trash2, CheckCircle2, MessageSquare, Filter, ShieldAlert } from 'lucide-react';
import { useBooking } from '../../contexts/BookingContext';

export const AdminReviews: React.FC = () => {
  const { reviews, toggleReviewVisibility, deleteReview, events } = useBooking();

  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredReviews = reviews.filter((r) => {
    const matchesEvent = selectedEventId === 'all' || r.eventId === selectedEventId;
    const matchesStatus = selectedStatus === 'all' || r.status === selectedStatus;
    return matchesEvent && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414] border border-white/10 rounded-3xl p-6">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#D4AF37]" />
            <span>Fan Review Moderation</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Monitor, approve, hide, or moderate customer ratings and written reviews across all live events.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1C1C1C] border border-white/10 rounded-2xl px-3 py-2 text-xs text-gray-300">
            <Filter className="w-3.5 h-3.5 text-[#D4AF37]" />
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="all">All Events ({reviews.length})</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#1C1C1C] border border-white/10 rounded-2xl px-3 py-2 text-xs text-gray-300">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published Only</option>
              <option value="hidden">Hidden / Moderated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reviews Table */}
      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white">
            Fan Feedback ({filteredReviews.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#1C1C1C] text-gray-400 uppercase text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="px-6 py-4">Event</th>
                <th className="px-6 py-4">Fan</th>
                <th className="px-6 py-4">Rating</th>
                <th className="px-6 py-4">Review Comment</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No reviews matching the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredReviews.map((rev) => {
                  const eventObj = events.find((e) => e.id === rev.eventId);

                  return (
                    <tr key={rev.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 max-w-[180px] font-bold text-white truncate">
                        {eventObj ? eventObj.title : rev.eventId}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={rev.userAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"}
                            alt={rev.userName}
                            className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]/30"
                          />
                          <div>
                            <span className="font-bold text-white block">{rev.userName}</span>
                            {rev.isVerifiedBuyer && (
                              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                          <span className="font-bold text-white">{rev.rating}.0</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 max-w-xs text-gray-300 italic">
                        "{rev.comment}"
                      </td>

                      <td className="px-6 py-4 font-mono text-gray-400 text-[11px]">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            rev.status === 'published'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {rev.status === 'published' ? 'PUBLISHED' : 'HIDDEN'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => toggleReviewVisibility(rev.id)}
                          className={`p-2 rounded-xl transition-all cursor-pointer ${
                            rev.status === 'published'
                              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-black'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black'
                          }`}
                          title={rev.status === 'published' ? 'Hide Review' : 'Publish Review'}
                        >
                          {rev.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => deleteReview(rev.id)}
                          className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                          title="Delete Review"
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
    </div>
  );
};
