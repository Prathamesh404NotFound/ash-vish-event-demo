import React from 'react';
import { Ticket, Search, Calendar, RefreshCw, Heart, CreditCard, Users, AlertCircle, Ban, Star, MapPin } from 'lucide-react';

type IconType = 'ticket' | 'search' | 'calendar' | 'heart' | 'payment' | 'users' | 'error' | 'ban' | 'star' | 'mappin';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconType;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const iconMap: Record<IconType, React.FC<{ className?: string }>> = {
  ticket: Ticket,
  search: Search,
  calendar: Calendar,
  heart: Heart,
  payment: CreditCard,
  users: Users,
  error: AlertCircle,
  ban: Ban,
  star: Star,
  mappin: MapPin,
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = 'search',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  const Icon = iconMap[icon] || Search;

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 bg-[#121214] border border-white/[0.06] rounded-3xl max-w-lg mx-auto my-8">
      {/* Icon Container */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-[#D4AF37]/5 blur-xl scale-150" />
        <div className="relative w-16 h-16 rounded-2xl bg-[#1A1A1C] border border-white/[0.08] flex items-center justify-center text-[#D4AF37] shadow-lg shadow-black/30">
          <Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
      </div>

      {/* Title */}
      <h3 className="font-heading font-bold text-lg text-white mb-2 leading-snug">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-500 max-w-[280px] leading-relaxed mb-6">
        {description}
      </p>

      {/* Actions */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="group px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E3C456] text-black font-bold text-xs flex items-center gap-2 transition-all duration-200"
            >
              <span>{actionLabel}</span>

            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 font-semibold text-xs hover:bg-white/5 hover:border-white/20 transition-all duration-200"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
