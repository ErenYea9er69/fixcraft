import React from 'react';

// Animated pulse skeleton placeholder for card grids
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-4 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-28" />
            <div className="h-5 bg-neutral-100 dark:bg-neutral-850 rounded-full w-20" />
          </div>
          <div className="h-6 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4" />
          <div className="space-y-2">
            <div className="h-3.5 bg-neutral-100 dark:bg-neutral-850 rounded w-full" />
            <div className="h-3.5 bg-neutral-100 dark:bg-neutral-850 rounded w-5/6" />
          </div>
          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-24" />
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded-lg w-24" />
          </div>
        </div>
      ))}
    </div>
  );
};

// Animated pulse skeleton placeholder for tabular lists
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden animate-pulse">
      <div className="h-12 bg-neutral-100 dark:bg-[#161616] border-b border-neutral-200 dark:border-neutral-800" />
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between gap-4">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-32" />
            <div className="h-4 bg-neutral-100 dark:bg-neutral-850 rounded w-48" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-20" />
            <div className="h-6 bg-neutral-100 dark:bg-neutral-850 rounded-md w-24" />
          </div>
        ))}
      </div>
    </div>
  );
};

// Animated pulse skeleton placeholder for summary KPI stat counters
export const StatsSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-xs space-y-2">
          <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-20" />
          <div className="h-7 bg-neutral-200 dark:bg-neutral-800 rounded w-16" />
        </div>
      ))}
    </div>
  );
};
