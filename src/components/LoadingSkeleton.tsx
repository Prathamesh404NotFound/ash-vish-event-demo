import React from 'react';

export const LoadingSkeletonCard: React.FC = () => {
  return (
    <div className="card-depth rounded-[18px] overflow-hidden bg-[#141414] border border-white/5 animate-pulse">
      <div className="aspect-[4/3] w-full bg-[#1C1C1C]" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-[#1C1C1C] rounded-md w-3/4" />
        <div className="h-3 bg-[#1C1C1C] rounded-md w-1/2" />
        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
          <div className="h-6 bg-[#1C1C1C] rounded-md w-16" />
          <div className="h-8 bg-[#1C1C1C] rounded-xl w-24" />
        </div>
      </div>
    </div>
  );
};

export const LoadingSkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeletonCard key={i} />
      ))}
    </div>
  );
};
