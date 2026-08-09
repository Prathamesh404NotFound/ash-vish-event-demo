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
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
        isActive
          ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/25 scale-105 font-bold'
          : 'bg-[#141414] text-gray-300 border-white/10 hover:border-white/30 hover:text-white hover:bg-[#1C1C1C]'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-[#D4AF37]'}`} />
      <span>{getLabel()}</span>
      {count !== undefined && (
        <span
          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            isActive ? 'bg-black text-white' : 'bg-white/10 text-gray-400'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
