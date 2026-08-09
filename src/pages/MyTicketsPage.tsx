import React, { useState } from 'react';
import { Ticket as TicketIcon, Calendar, Clock, CheckCircle } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { TicketCard } from '../components/TicketCard';
import { EmptyState } from '../components/EmptyState';

interface MyTicketsPageProps {
  onExploreEvents: () => void;
}

export const MyTicketsPage: React.FC<MyTicketsPageProps> = ({ onExploreEvents }) => {
  const { myTickets } = useBooking();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const upcomingTickets = myTickets.filter((t) => t.status === 'valid');
  const pastTickets = myTickets.filter((t) => t.status !== 'valid');

  const displayTickets = activeTab === 'upcoming' ? upcomingTickets : pastTickets;

  return (
    <div className="pb-24 pt-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-heading font-extrabold text-3xl text-white flex items-center gap-2.5">
            <TicketIcon className="w-8 h-8 text-[#D4AF37]" />
            <span>My Digital Ticket Wallet</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Access your confirmed event passes, QR gate codes, and seating details.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 rounded-xl bg-[#141414] border border-white/10">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'upcoming'
                ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Upcoming ({upcomingTickets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('past')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'past'
                ? 'bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Past / Used ({pastTickets.length})</span>
          </button>
        </div>
      </div>


      {/* Tickets List */}
      {displayTickets.length > 0 ? (
        <div className="space-y-6">
          {displayTickets.map((tkt) => (
            <TicketCard key={tkt.id} ticket={tkt} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={activeTab === 'upcoming' ? 'No Upcoming Event Passes' : 'No Past Event History'}
          description="Ready for your next live experience? Browse concerts, comedy shows, and sports matches."
          icon="ticket"
          actionLabel="Explore Live Events"
          onAction={onExploreEvents}
        />
      )}

    </div>
  );
};
