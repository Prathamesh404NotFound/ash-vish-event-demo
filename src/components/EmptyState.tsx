import React from 'react';
import { Ticket, Search, Calendar, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: 'ticket' | 'search' | 'calendar';
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = 'search',
  actionLabel,
  onAction,
}) => {
  const getIcon = () => {
    switch (icon) {
      case 'ticket':
        return Ticket;
      case 'calendar':
        return Calendar;
      default:
        return Search;
    }
  };

  const Icon = getIcon();

  return (
    <div className="flex flex-col items-center justify-center text-center p-12 bg-[#141414] border border-white/10 rounded-3xl max-w-lg mx-auto my-8">
      <div className="w-16 h-16 rounded-2xl bg-[#1C1C1C] border border-white/10 flex items-center justify-center text-[#D4AF37] mb-4 shadow-xl">
        <Icon className="w-8 h-8" />
      </div>

      <h3 className="font-heading font-bold text-xl text-white mb-2">
        {title}
      </h3>

      <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-6">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#D4AF37]/25 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};
