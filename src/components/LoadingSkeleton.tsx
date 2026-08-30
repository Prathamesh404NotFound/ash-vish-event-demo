import React from 'react';

/** Base shimmer animation for skeleton elements */
const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-[#1C1C1E] rounded-md animate-pulse ${className}`} />
);

/** Event card skeleton — matches the EventCard layout */
export const LoadingSkeletonCard: React.FC = () => {
  return (
    <div className="card-depth rounded-[18px] overflow-hidden bg-[#141414] border border-white/5">
      <div className="aspect-[4/3] w-full bg-[#1C1C1E] animate-pulse" />
      <div className="p-5 space-y-3">
        <Shimmer className="h-5 w-3/4" />
        <Shimmer className="h-3 w-1/2" />
        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
          <Shimmer className="h-6 w-16" />
          <Shimmer className="h-8 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

/** Grid of event card skeletons */
export const LoadingSkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeletonCard key={i} />
      ))}
    </div>
  );
};

/** Dashboard stat card skeleton */
export const LoadingStatCard: React.FC = () => (
  <div className="bg-[#121214] border border-white/[0.06] rounded-2xl p-5 space-y-3">
    <div className="flex items-center gap-3">
      <Shimmer className="w-10 h-10 rounded-xl" />
      <div className="space-y-2 flex-1">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-6 w-16" />
      </div>
    </div>
    <Shimmer className="h-2 w-full rounded-full" />
  </div>
);

/** Table row skeleton */
export const LoadingTableRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr className="border-b border-white/5">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-4">
        <Shimmer className="h-4 w-full" />
      </td>
    ))}
  </tr>
);

/** Page section skeleton — for loading a full page section */
export const LoadingPageSection: React.FC = () => (
  <div className="space-y-6 animate-in fade-in">
    <div className="space-y-2">
      <Shimmer className="h-8 w-48" />
      <Shimmer className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <LoadingSkeletonCard />
      <LoadingSkeletonCard />
      <LoadingSkeletonCard />
    </div>
  </div>
);

/** Inline loading spinner */
export const InlineSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; label?: string }> = ({
  size = 'md',
  label,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  };

  return (
    <div className="flex items-center justify-center gap-2.5 py-8">
      <div className={`${sizeClasses[size]} border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin`} />
      {label && <span className="text-sm text-gray-400">{label}</span>}
    </div>
  );
};
