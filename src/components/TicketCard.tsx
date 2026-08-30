import React from 'react';
import { Star, Crown, AlertCircle } from 'lucide-react';
import { TicketTier } from '../types';
import { formatINR } from '../utils/formatters';

interface TicketCardProps {
  tier: TicketTier;
  isVip?: boolean;
  isPopular?: boolean;
  onSelect: (tier: TicketTier) => void;
  selectedTierId?: string;
  isLoading?: boolean;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  tier,
  isVip = false,
  isPopular = false,
  onSelect,
  selectedTierId,
  isLoading = false,
}) => {
  const isSoldOut = (tier.remainingInventory ?? 0) <= 0;
  const isLowStock = !isSoldOut && (tier.remainingInventory ?? 0) <= 5;
  const isSelected = selectedTierId === tier.id;

  const getStockStatus = () => {
    if (isSoldOut) return 'Sold Out';
    if (isLowStock) return `Only ${tier.remainingInventory} left`;
    return `${tier.remainingInventory} available`;
  };

  return (
    <div
      className={`
        relative rounded-2xl border transition-all duration-200
        ${isVip
          ? isSelected
            ? 'border-[#D4AF37] bg-gradient-to-br from-[#D4AF37]/15 to-[#D4AF37]/5 shadow-xl shadow-[#D4AF37]/30'
            : 'border-[#D4AF37]/50 bg-gradient-to-br from-[#D4AF37]/10 to-[#1C1C1C] hover:border-[#D4AF37] hover:shadow-lg hover:shadow-[#D4AF37]/20'
          : isSelected
            ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg shadow-[#D4AF37]/20'
            : 'border-white/10 bg-[#141414] hover:border-white/20 hover:shadow-lg'
        }
        ${isSoldOut ? 'opacity-60' : ''}
        p-4 sm:p-5 md:p-6
      `}
    >
      {/* VIP Badge */}
      {isVip && (
        <>
          <div className="absolute -top-2 -right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#D4AF37]/40">
            <Crown className="w-4 h-4 fill-current" />
            VIP
          </div>
          {/* VIP accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent rounded-t-2xl opacity-50" />
        </>
      )}

      {/* Popular Badge */}
      {isPopular && !isVip && (
        <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider border border-blue-500/30">
          Popular
        </div>
      )}

      {/* Sold Out Overlay */}
      {isSoldOut && (
        <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <p className="text-lg font-bold text-white">Sold Out</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Header: Name + Stock Status */}
        <div className="space-y-2">
          <h3 className="font-heading font-bold text-lg sm:text-xl text-white break-words line-clamp-2">{tier.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${
                isSoldOut
                  ? 'text-red-400'
                  : isLowStock
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
            >
              {getStockStatus()}
            </div>
            {isLowStock && !isSoldOut && (
              <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Description */}
        {tier.description && (
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed line-clamp-2">{tier.description}</p>
        )}

        {/* Price */}
        <div className="border-t border-white/10 pt-4">
          <span className="text-2xl sm:text-3xl font-heading font-bold text-[#D4AF37]">
            {formatINR(tier.price)}
          </span>
          <span className="text-xs sm:text-sm text-gray-400 ml-2">per ticket</span>
        </div>

        {/* Perks */}
        {tier.perks && tier.perks.length > 0 && (
          <div className={`border-t pt-4 space-y-3 ${isVip ? 'border-[#D4AF37]/30' : 'border-white/10'}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {isVip ? (
                <>
                  <Crown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isVip ? 'text-[#D4AF37]' : 'text-gray-400'}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    isVip ? 'text-[#D4AF37]' : 'text-gray-400'
                  }`}>
                    ✨ VIP Perks
                  </span>
                </>
              ) : (
                <>
                  <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] flex-shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    What's Included
                  </span>
                </>
              )}
            </div>
            <ul className="space-y-1.5 max-h-32 overflow-y-auto">
              {tier.perks.map((perk, idx) => (
                <li
                  key={idx}
                  className={`flex items-start gap-2 text-xs ${
                    isVip ? 'text-[#F3E5AB]' : 'text-gray-300'
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${
                    isVip ? 'bg-[#D4AF37]' : 'bg-[#D4AF37]'
                  }`} />
                  <span className="line-clamp-2">{perk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Select Button */}
        <button
          onClick={() => onSelect(tier)}
          disabled={isSoldOut || isLoading}
          className={`
            w-full py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wide transition-all duration-200
            ${isSoldOut
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : isSelected
                ? 'bg-[#D4AF37] text-black hover:bg-[#F3E5AB]'
                : 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/50 hover:bg-[#D4AF37]/30 hover:border-[#D4AF37]'
            }
          `}
        >
          {isSoldOut ? 'Sold Out' : isSelected ? '✓ Selected' : 'Select Ticket'}
        </button>
      </div>
    </div>
  );
};
