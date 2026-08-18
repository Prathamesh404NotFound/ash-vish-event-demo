import React from 'react';
import { Compass, Music, Laugh, Trophy, Film, Sparkles } from 'lucide-react';
import { EventCategory } from '../types';

interface CategoryChipProps {
  category: EventCategory | 'all';
  activeCategory: EventCategory | 'all';
  onSelectCategory: (category: EventCategory | 'all') => void;
  count?: number;
}

export const CategoryChip: React.FC<CategoryChipProps> = ({
  category,
  activeCategory,
  onSelectCategory,
  count,
}) => {
  const isActive = activeCategory === category;

  const getIcon = () => {
    switch (category) {
      case 'concert':
        return Music;
      case 'comedy':
        return Laugh;
      case 'sports':
        return Trophy;
      case 'theatre':
        return Film;
      case 'festival':
        return Sparkles;
      default:
        return Compass;
    }
  };

  const Icon = getIcon();

  const getLabel = () => {
    if (category === 'all') return 'All Events';
    return category.charAt(0).toUpperCase() + category.slice(1) + (category === 'comedy' ? ' Shows' : 's');
  };

  return (
    <button
      onClick={() => onSelectCategory(category)}
      className={`shrink-0 snap-start flex items-center gap-2 px-4 py-2.5 sm:py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border touch-min-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070707] active:scale-95 cursor-pointer ${
        isActive
          ? 'bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/30 scale-[1.02] font-bold'
          : 'bg-[#141414] text-gray-300 border-white/10 hover:border-[#D4AF37]/40 hover:text-white hover:bg-[#1C1C1C]'
      }`}
      aria-label={`Filter by ${getLabel()}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-[#D4AF37]'}`} />
      <span className="leading-none">{getLabel()}</span>
      {count !== undefined && (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold leading-none ${
            isActive ? 'bg-black/90 text-white' : 'bg-white/10 text-gray-300'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
