import React from 'react';

export const TicketCardSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#141414] p-5 sm:p-6 space-y-4 animate-pulse">
      {/* Header: Name + Stock */}
      <div className="space-y-2">
        <div className="h-6 w-3/4 bg-white/5 rounded-lg" />
        <div className="h-4 w-1/2 bg-white/5 rounded-lg" />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-white/5 rounded-lg" />
        <div className="h-3 w-4/5 bg-white/5 rounded-lg" />
      </div>

      {/* Price */}
      <div className="border-t border-white/10 pt-4">
        <div className="h-8 w-1/3 bg-white/5 rounded-lg" />
      </div>

      {/* Perks */}
      <div className="border-t border-white/10 pt-4 space-y-3">
        <div className="h-3 w-1/4 bg-white/5 rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="h-3 w-full bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Button */}
      <div className="h-10 w-full bg-white/5 rounded-xl" />
    </div>
  );
};
