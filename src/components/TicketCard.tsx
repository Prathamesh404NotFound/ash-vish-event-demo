import React from 'react';
import { Star, Crown, AlertCircle, Gem, Smile } from 'lucide-react';
import { TicketTier } from '../types';
import { formatINR } from '../utils/formatters';
import { getTierBadgeStyle, getTierKind } from '../lib/ticketItems';

interface TicketCardProps {
  tier: TicketTier;
  /** Legacy prop: forces the VIP look for any tier. Kept for backward compat. */
  isVip?: boolean;
  isPopular?: boolean;
  onSelect: (tier: TicketTier) => void;
  selectedTierId?: string;
  isLoading?: boolean;
  /**
   * Multi-type mode (general admission): when onQuantityChange is provided the
   * Select button becomes an add-to-booking stepper, letting one transaction
   * mix ticket types (e.g. 2 VIP + 3 Kids). quantity is this tier's current
   * count in the booking (0 = not added). Legacy single-type callers omit both.
   */
  quantity?: number;
  onQuantityChange?: (tier: TicketTier, next: number) => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  tier,
  isVip: isVipProp = false,
  isPopular = false,
  onSelect,
  selectedTierId,
  isLoading = false,
  quantity = 0,
  onQuantityChange,
}) => {
  const isSoldOut = (tier.remainingInventory ?? 0) <= 0;
  const isLowStock = !isSoldOut && (tier.remainingInventory ?? 0) <= 5;
  const isMulti = typeof onQuantityChange === 'function' && !isSoldOut;
  const count = isMulti ? Math.max(0, quantity || 0) : 0;
  const isSelected = isMulti ? count > 0 : selectedTierId === tier.id;

  // Badge kind drives the premium accents. 'vip' keeps the legacy crown style;
  // 'vvip' and 'kids' reuse the same badge anatomy with their own palette.
  const kind = getTierKind(tier.name);
  const isVip = kind === 'vip' || isVipProp;
  const isVVip = kind === 'vvip';
  const isKids = kind === 'kids';
  const isPremiumTier = kind !== 'standard';

  const getStockStatus = () => {
    if (isSoldOut) return 'Sold Out';
    if (isLowStock) return `Only ${tier.remainingInventory} left`;
    return `${tier.remainingInventory} available`;
  };

  return (
    <div
      className={`
        relative rounded-2xl border transition-all duration-200
        ${isPremiumTier
          ? isSelected
            ? `border-[#D4AF37] bg-gradient-to-br from-[#D4AF37]/15 to-[#D4AF37]/5 shadow-xl shadow-[#D4AF37]/30 ${isKids ? 'border-[#38BDF8] shadow-[#38BDF8]/30' : ''} ${isVVip ? 'border-[#F3E5AB] shadow-[#F3E5AB]/30' : ''}`
            : isKids
              ? 'border-[#38BDF8]/50 bg-gradient-to-br from-[#38BDF8]/10 to-[#1C1C1C] hover:border-[#38BDF8] hover:shadow-lg hover:shadow-[#38BDF8]/20'
              : isVVip
                ? 'border-[#F3E5AB]/60 bg-gradient-to-br from-[#F3E5AB]/15 to-[#1C1C1C] hover:border-[#F3E5AB] hover:shadow-lg hover:shadow-[#F3E5AB]/20'
                : 'border-[#D4AF37]/50 bg-gradient-to-br from-[#D4AF37]/10 to-[#1C1C1C] hover:border-[#D4AF37] hover:shadow-lg hover:shadow-[#D4AF37]/20'
          : isSelected
            ? 'border-[#D4AF37] bg-[#D4AF37]/5 '
            : 'border-white/10 bg-[#141414] hover:border-white/20 hover:shadow-lg'
        }
        ${isSoldOut ? 'opacity-60' : ''}
        p-4 sm:p-5 md:p-6
      `}
    >
      {/* Premium Tier Badge — VIP (gold crown), VVIP (platinum gem), Kids (sky smile).
          All three share the same badge anatomy; only the palette differs. */}
      {isPremiumTier && (
        <>
          <div
            role="note"
            aria-label={`${isVVip ? 'VVIP' : isKids ? 'Kids' : 'VIP'} ticket category`}
            className={`absolute -top-2 -right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-black text-xs font-bold uppercase tracking-wider ${
              isKids
                ? 'bg-gradient-to-r from-[#38BDF8] to-[#7DD3FC] text-[#0B2534] shadow-lg shadow-[#38BDF8]/30'
                : isVVip
                  ? 'bg-gradient-to-r from-[#E5E4E2] via-[#F3E5AB] to-[#D4AF37] shadow-lg shadow-[#F3E5AB]/40'
                  : 'bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] shadow-lg shadow-[#D4AF37]/40'
            }`}
          >
            {isKids ? <Smile className="w-4 h-4 fill-current" /> : isVVip ? <Gem className="w-4 h-4 fill-current" /> : <Crown className="w-4 h-4 fill-current" />}
            {isKids ? 'Kids' : isVVip ? 'VVIP' : 'VIP'}
          </div>
          {/* Premium accent line */}
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent ${isKids ? 'via-[#38BDF8]' : isVVip ? 'via-[#F3E5AB]' : 'via-[#D4AF37]'} to-transparent rounded-t-2xl opacity-50`} />
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
          <div className={`border-t pt-4 space-y-3 ${isPremiumTier ? (isKids ? 'border-[#38BDF8]/30' : 'border-[#D4AF37]/30') : 'border-white/10'}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {isPremiumTier ? (
                <>
                  {isKids ? <Smile className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-[#7DD3FC]" /> : isVVip ? <Gem className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-[#F3E5AB]" /> : <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 text-[#D4AF37]" />}
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
                    ✨ {isKids ? 'Kids Perks' : isVVip ? 'VVIP Perks' : 'VIP Perks'}
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
                    isPremiumTier ? (isKids ? 'text-[#BAE6FD]' : 'text-[#F3E5AB]') : 'text-gray-300'
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

        {/* Select Button / Multi-type quantity stepper */}
        {isMulti ? (
          <div
            role="group"
            aria-label={`Tickets for ${tier.name}`}
            className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 border transition-all duration-200 ${
              isSelected
                ? isKids
                  ? 'border-[#38BDF8]/60 bg-[#38BDF8]/10'
                  : isVVip
                    ? 'border-[#F3E5AB]/60 bg-[#F3E5AB]/10'
                    : 'border-[#D4AF37]/60 bg-[#D4AF37]/10'
                : 'border-white/15 bg-[#1C1C1C]'
            }`}
          >
            <button
              type="button"
              aria-label={`Remove one ${tier.name} ticket`}
              onClick={() => onQuantityChange(tier, count - 1)}
              disabled={count === 0 || isLoading}
              className="w-9 h-9 rounded-lg bg-[#141414] hover:bg-black text-white font-bold text-base flex items-center justify-center border border-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              −
            </button>
            <span
              aria-live="polite"
              className={`font-heading font-bold text-sm whitespace-nowrap ${
                count > 0 ? 'text-[#D4AF37]' : 'text-gray-400'
              }`}
            >
              {count > 0
                ? `${count} in booking`
                : 'Add'}
            </span>
            <button
              type="button"
              aria-label={`Add one ${tier.name} ticket`}
              onClick={() => onQuantityChange(tier, count + 1)}
              disabled={isLoading}
              className="w-9 h-9 rounded-lg bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-bold text-base flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              +
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
};
