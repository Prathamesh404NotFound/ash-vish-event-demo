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
      className={`shrink-0 snap-start flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-500 border active:scale-95 cursor-pointer ${
        isActive
          ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-xl shadow-[#D4AF37]/10'
          : 'bg-[#111] text-gray-500 border-white/5 hover:border-[#D4AF37]/30 hover:text-white'
      }`}
      aria-label={`Filter by ${getLabel()}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-black' : 'text-[#D4AF37]'}`} />
      <span className="leading-none">{getLabel()}</span>
      {count !== undefined && (
        <span
          className={`ml-1 px-2 py-0.5 rounded-md text-[9px] font-black leading-none ${
            isActive ? 'bg-black/20 text-black' : 'bg-white/5 text-gray-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
