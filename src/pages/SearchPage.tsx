import React, { useState, useMemo } from 'react';
import { Search, Filter, X, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { EventItem, EventCategory, FilterOptions } from '../types';
import { useBooking } from '../contexts/BookingContext';
import { EventCard } from '../components/EventCard';
import { CategoryChip } from '../components/CategoryChip';
import { EmptyState } from '../components/EmptyState';
import { useSEO } from '../hooks/useSEO';

interface SearchPageProps {
  initialCategory?: EventCategory | 'all';
  onSelectEvent: (event: EventItem) => void;
  onBookNow: (event: EventItem) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  initialCategory = 'all',
  onSelectEvent,
  onBookNow,
}) => {
  const { events } = useBooking();

  useSEO({
    title: 'Explore & Search Upcoming Live Events',
    description: 'Filter upcoming concerts, standup comedy shows, theater plays, and stadium games by category, city, date, and price.',
  });

  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: '',
    category: initialCategory,
    city: 'all',
    priceMax: 500,
    dateFilter: 'all',
    sortBy: 'featured',
  });

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Available cities
  const cities = ['all', 'New York', 'Los Angeles', 'Chicago', 'Miami'];
  const categories: (EventCategory | 'all')[] = ['all', 'concert', 'comedy', 'sports', 'theatre', 'festival'];

  // Filtered & Sorted events computation
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      // Exclude draft events from public search
      if (evt.status === 'draft') return false;

      // Search query match
      if (
        filters.searchQuery &&
        !evt.title.toLowerCase().includes(filters.searchQuery.toLowerCase()) &&
        !evt.venue.toLowerCase().includes(filters.searchQuery.toLowerCase()) &&
        !evt.city.toLowerCase().includes(filters.searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Category match
      if (filters.category !== 'all' && evt.category !== filters.category) {
        return false;
      }

      // City match
      if (filters.city !== 'all' && evt.city.toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }

      // Price match
      if (evt.startingPrice > filters.priceMax) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (filters.sortBy === 'price-asc') return a.startingPrice - b.startingPrice;
      if (filters.sortBy === 'price-desc') return b.startingPrice - a.startingPrice;
      if (filters.sortBy === 'date-asc') return a.date.localeCompare(b.date);
      return b.rating - a.rating;
    });
  }, [events, filters]);

  const resetFilters = () => {
    setFilters({
      searchQuery: '',
      category: 'all',
      city: 'all',
      priceMax: 500,
      dateFilter: 'all',
      sortBy: 'featured',
    });
  };

  return (
    <div className="pb-24 pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Search Bar & Header */}
      <div className="space-y-4">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-white">
          Search Live Events
        </h1>

        {/* Large Input Bar */}
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#FF6B00]" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Search by artist, concert title, venue, or city..."
            className="w-full bg-[#141414] border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:border-[#FF6B00] shadow-xl transition-all"
          />
          {filters.searchQuery && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-white/10 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>


      {/* Main Grid with Filter Sidebar & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Desktop Filter Sidebar */}
        <div className="hidden lg:block lg:col-span-3 space-y-6 bg-[#141414] border border-white/10 p-6 rounded-3xl h-fit">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#FF6B00]" />
              <span>Filters</span>
            </h3>
            <button
              onClick={resetFilters}
              className="text-xs text-[#FF6B00] hover:underline font-semibold"
            >
              Reset All
            </button>
          </div>

          {/* Category Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Category
            </label>
            <div className="flex flex-col gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilters((prev) => ({ ...prev, category: cat }))}
                  className={`text-left px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                    filters.category === cat
                      ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black font-bold'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {cat === 'all' ? 'All Categories' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* City Selector */}
          <div className="space-y-2 pt-4 border-t border-white/10">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              City
            </label>
            <select
              value={filters.city}
              onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))}
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            >
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Cities' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Price Range Slider */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-gray-300 uppercase tracking-wider">
                Max Price
              </label>
              <span className="font-bold text-[#D4AF37]">${filters.priceMax}</span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={filters.priceMax}
              onChange={(e) => setFilters((prev) => ({ ...prev, priceMax: Number(e.target.value) }))}
              className="w-full accent-[#D4AF37] cursor-pointer"
            />
          </div>

          {/* Sort Selection */}
          <div className="space-y-2 pt-4 border-t border-white/10">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#D4AF37]" />
              Sort By
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as any }))}
              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="featured">Featured & Highest Rated</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="date-asc">Upcoming Date</option>
            </select>
          </div>
        </div>


        {/* Results Column */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Active Filter Bar & Mobile Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#141414] p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400">
                Found <span className="text-white">{filteredEvents.length}</span> events
              </span>
            </div>

            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="lg:hidden flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1C1C1C] text-xs font-bold text-white border border-white/10"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#D4AF37]" />
              <span>Filters</span>
            </button>
          </div>

          {/* Category quick chips row */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                activeCategory={filters.category}
                onSelectCategory={(c) => setFilters((prev) => ({ ...prev, category: c }))}
              />
            ))}
          </div>

          {/* Results Grid or Empty State */}
          {filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((evt) => (
                <EventCard
                  key={evt.id}
                  event={evt}
                  onSelectEvent={onSelectEvent}
                  onBookNow={onBookNow}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No Events Found"
              description="Try adjusting your category filter, city location, or search keywords."
              actionLabel="Clear Filters"
              onAction={resetFilters}
            />
          )}

        </div>

      </div>

    </div>
  );
};
