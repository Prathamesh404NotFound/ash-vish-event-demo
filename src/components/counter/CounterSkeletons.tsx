import React from 'react';

const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-[#1C1C1E] rounded-md animate-pulse ${className}`} />
);

/** Dashboard stat card skeleton */
export const StatCardSkeleton: React.FC = () => (
  <div className="p-5 rounded-2xl bg-[#141414] border border-white/[0.06] space-y-3">
    <div className="flex items-center justify-between">
      <Shimmer className="h-3 w-24" />
      <Shimmer className="h-4 w-4 rounded" />
    </div>
    <Shimmer className="h-8 w-16" />
    <Shimmer className="h-2.5 w-full rounded-full" />
  </div>
);

/** Dashboard banner skeleton */
export const DashboardBannerSkeleton: React.FC = () => (
  <div className="p-6 md:p-8 rounded-3xl bg-[#1C1C1C] border border-white/[0.06] space-y-4">
    <div className="flex items-center gap-2">
      <Shimmer className="h-5 w-32 rounded-full" />
    </div>
    <Shimmer className="h-8 w-64" />
    <Shimmer className="h-4 w-96 max-w-full" />
    <div className="flex gap-3 pt-2">
      <Shimmer className="h-11 w-36 rounded-2xl" />
      <Shimmer className="h-11 w-36 rounded-2xl" />
    </div>
  </div>
);

/** Event card skeleton for the counter overview */
export const EventCardSkeleton: React.FC = () => (
  <div className="p-4 rounded-2xl bg-[#1C1C1C] border border-white/[0.04] space-y-3">
    <div className="flex gap-3">
      <Shimmer className="w-16 h-16 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-2.5 w-20" />
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-3 w-24" />
      </div>
    </div>
    <div className="pt-2 border-t border-white/5 space-y-2">
      <div className="flex justify-between">
        <Shimmer className="h-3 w-28" />
        <Shimmer className="h-3 w-20" />
      </div>
      <Shimmer className="h-2 w-full rounded-full" />
    </div>
  </div>
);

/** Full counter overview skeleton */
export const CounterOverviewSkeleton: React.FC = () => (
  <div className="space-y-8 max-w-6xl mx-auto animate-fade-in-up">
    <DashboardBannerSkeleton />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
    <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.06] space-y-4">
      <Shimmer className="h-5 w-48" />
      <Shimmer className="h-3 w-full rounded-full" />
    </div>
    <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.06] space-y-4">
      <Shimmer className="h-5 w-56" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EventCardSkeleton />
        <EventCardSkeleton />
      </div>
    </div>
  </div>
);

/** Table row skeleton for orders/sales pages */
export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 6 }) => (
  <tr className="border-b border-white/5">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-3">
        <Shimmer className="h-4 w-full" />
      </td>
    ))}
  </tr>
);

/** Orders page skeleton */
export const CounterOrdersSkeleton: React.FC = () => (
  <div className="space-y-6 animate-fade-in-up">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-2">
        <Shimmer className="h-7 w-48" />
        <Shimmer className="h-4 w-72" />
      </div>
      <div className="flex gap-2">
        <Shimmer className="h-10 w-24 rounded-xl" />
        <Shimmer className="h-10 w-24 rounded-xl" />
      </div>
    </div>
    {/* Filters */}
    <div className="flex gap-3 flex-wrap">
      <Shimmer className="h-10 w-48 rounded-xl" />
      <Shimmer className="h-10 w-32 rounded-xl" />
      <Shimmer className="h-10 w-32 rounded-xl" />
    </div>
    {/* Table */}
    <div className="rounded-2xl bg-[#141414] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <Shimmer className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRowSkeleton key={i} cols={6} />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/** Sales page skeleton */
export const MySalesSkeleton: React.FC = () => (
  <div className="space-y-6 animate-fade-in-up">
    <div className="space-y-2">
      <Shimmer className="h-7 w-40" />
      <Shimmer className="h-4 w-64" />
    </div>
    {/* Summary cards */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
    {/* Filters */}
    <div className="flex gap-3 flex-wrap">
      <Shimmer className="h-10 w-48 rounded-xl" />
      <Shimmer className="h-10 w-32 rounded-xl" />
    </div>
    {/* Table */}
    <div className="rounded-2xl bg-[#141414] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            {Array.from({ length: 5 }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <Shimmer className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRowSkeleton key={i} cols={5} />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/** Shift page skeleton */
export const ShiftPageSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-2xl mx-auto animate-fade-in-up">
    <div className="space-y-2 text-center">
      <Shimmer className="h-7 w-48 mx-auto" />
      <Shimmer className="h-4 w-72 mx-auto" />
    </div>
    <div className="p-6 rounded-3xl bg-[#141414] border border-white/[0.06] space-y-4">
      <Shimmer className="h-5 w-36" />
      <div className="grid grid-cols-2 gap-4">
        <Shimmer className="h-12 w-full rounded-xl" />
        <Shimmer className="h-12 w-full rounded-xl" />
      </div>
      <Shimmer className="h-12 w-full rounded-xl" />
      <Shimmer className="h-12 w-full rounded-xl" />
    </div>
  </div>
);
