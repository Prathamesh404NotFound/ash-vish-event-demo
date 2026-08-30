import React, { useState } from 'react';
import { Star, CheckCircle2, MessageSquarePlus, Send } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from './UserAvatar';

interface EventReviewsSectionProps {
  eventId: string;
}

export const EventReviewsSection: React.FC<EventReviewsSectionProps> = ({ eventId }) => {
  const { getEventReviews, submitReview } = useBooking();
  const { user } = useAuth();

  const reviews = getEventReviews(eventId);
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1))
    : 5.0;

  // Star Rating Breakdown
  const ratingCounts = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((r) => r.rating === stars).length;
    const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
    return { stars, count, percentage };
  });

  // Review Form State
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [userRating, setUserRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setIsSubmitting(true);
    const ok = await submitReview(
      eventId,
      userRating,
      comment,
      user?.name || 'Verified Fan',
      user?.photoUrl || undefined
    );
    setIsSubmitting(false);

    if (ok) {
      setSuccessMessage('Thank you! Your review has been published.');
      setComment('');
      setShowReviewForm(false);
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  };

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-8">
      {/* Header & Overall Score */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <h3 className="font-heading font-bold text-2xl text-white flex items-center gap-2">
            <span>Fan Ratings & Reviews</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 font-sans">
              Verified Attendees
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Real feedback from fans who booked tickets for this live show.
          </p>
        </div>

        <button
          onClick={() => setShowReviewForm(!showReviewForm)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-extrabold text-xs transition-all cursor-pointer shadow-lg shadow-[#D4AF37]/10 self-start md:self-auto"
        >
          <MessageSquarePlus className="w-4 h-4 stroke-[2.5]" />
          <span>{showReviewForm ? 'Cancel Review' : 'Write a Review'}</span>
        </button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Write Review Collapsible Form */}
      {showReviewForm && (
        <form onSubmit={handleSubmit} className="bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-2xl p-6 space-y-4 animate-in fade-in">
          <h4 className="font-heading font-bold text-base text-white">Share Your Concert Experience</h4>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-2">Overall Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((starVal) => {
                const active = (hoverRating !== null ? hoverRating : userRating) >= starVal;
                return (
                  <button
                    key={starVal}
                    type="button"
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setUserRating(starVal)}
                    className="p-1 text-yellow-400 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <Star className={`w-6 h-6 ${active ? 'fill-[#D4AF37] text-[#D4AF37]' : 'text-gray-600'}`} />
                  </button>
                );
              })}
              <span className="text-xs text-[#D4AF37] font-bold ml-2">
                {userRating === 5 ? '5.0 — Outstanding!' : userRating === 4 ? '4.0 — Great Show' : userRating === 3 ? '3.0 — Average' : 'Needs Improvement'}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-300 block mb-1">Your Written Review</label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was the atmosphere, acoustics, crowd energy, or seating view?"
              className="w-full bg-[#141414] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReviewForm(false)}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !comment.trim()}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-extrabold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Posting...' : 'Post Review'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Ratings Dashboard & Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-[#181818] rounded-2xl p-6 border border-white/5">
        {/* Big Average Score */}
        <div className="md:col-span-4 text-center md:border-r border-white/10 md:pr-6 space-y-2">
          <span className="font-heading font-extrabold text-5xl text-white">{avgRating}</span>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-4 h-4 ${
                  s <= Math.round(avgRating) ? 'fill-[#D4AF37] text-[#D4AF37]' : 'text-gray-600'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">Based on {totalReviews} verified fan reviews</p>
        </div>

        {/* Rating Breakdown Bars */}
        <div className="md:col-span-8 space-y-2">
          {ratingCounts.map(({ stars, count, percentage }) => (
            <div key={stars} className="flex items-center gap-3 text-xs text-gray-300">
              <span className="w-12 font-semibold text-gray-400 flex items-center gap-1">
                {stars} <Star className="w-3 h-3 fill-[#D4AF37] text-[#D4AF37]" />
              </span>
              <div className="flex-1 h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-12 text-right text-gray-400 font-mono text-[11px]">{count} ({percentage}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-xs bg-[#181818] rounded-2xl border border-white/5 space-y-2">
            <p className="font-bold text-white text-sm">Be the first to review this event!</p>
            <p>Share your concert experience to help fellow music lovers.</p>
          </div>
        ) : (
          reviews.map((rev) => (
            <div key={rev.id} className="bg-[#181818] border border-white/5 hover:border-white/10 rounded-2xl p-5 space-y-3 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={rev.userAvatar}
                    name={rev.userName}
                    size="w-9 h-9"
                    className="border border-[#D4AF37]/30"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-xs text-white">{rev.userName}</h5>
                      {rev.isVerifiedBuyer && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Verified Buyer
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {new Date(rev.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-black/40 px-2.5 py-1 rounded-xl border border-white/10">
                  <Star className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                  <span className="text-xs font-bold text-white">{rev.rating}.0</span>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed pl-1">
                "{rev.comment}"
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
