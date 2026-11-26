import React from 'react';
import { LucideIcon, Wrench } from 'lucide-react';

// Props interface for configurable empty state placeholder component
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

// Reusable visual placeholder displayed when data collections or filter queries are empty
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Wrench,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`text-center py-12 px-6 bg-white dark:bg-[#111111] rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 shadow-xs flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white mb-4">
        <Icon className="w-6 h-6 stroke-[1.75]" />
      </div>
      <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-xs active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
