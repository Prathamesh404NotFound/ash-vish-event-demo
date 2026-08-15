import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle, Download, Ticket as TicketIcon, Calendar, MapPin, Share2, Sparkles, ArrowRight } from 'lucide-react';
import { useBooking } from '../contexts/BookingContext';
import { QRPlaceholder } from '../components/QRPlaceholder';

interface ConfirmationPageProps {
  onGoToMyTickets: () => void;
  onExploreMore: () => void;
}

export const ConfirmationPage: React.FC<ConfirmationPageProps> = ({
  onGoToMyTickets,
  onExploreMore,
}) => {
  const { myTickets } = useBooking();
  const latestTicket = myTickets[0]; // Most recent ticket purchased

  useEffect(() => {
    // Launch celebratory confetti burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF6B00', '#FF8A26', '#ffffff', '#22C55E'],
    });
  }, []);

  if (!latestTicket) {
    return (
      <div className="pt-28 pb-12 max-w-lg mx-auto text-center px-4 space-y-4">
        <h2 className="font-heading font-bold text-2xl text-white">No Recent Booking Found</h2>
        <button onClick={onExploreMore} className="px-6 py-2.5 rounded-xl bg-[#FF6B00] text-black font-bold text-xs">
          Explore Events
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-20 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      
      {/* Success Badge Banner */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-xl">
          <CheckCircle className="w-8 h-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20">
          <Sparkles className="w-3.5 h-3.5" /> BOOKING CONFIRMED & RESERVED
        </span>

        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-white">
          You're Going To The Show!
        </h1>

        <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
          We’ve dispatched your digital QR pass to <span className="text-white font-semibold">{latestTicket.attendeeEmail}</span>. Show this pass at entry.
        </p>
      </div>


      {/* TICKET TEAR ANIMATED CARD */}
      <div className="relative card-depth rounded-3xl bg-[#141414] border border-white/10 overflow-hidden shadow-2xl transition-all duration-500 hover:border-[#FF6B00]/40">
        
        {/* Ticket Header */}
        <div className="bg-[#1C1C1C] px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TicketIcon className="w-5 h-5 text-[#FF6B00]" />
            <span className="font-heading font-bold text-sm text-white">PASS REF:</span>
            <span className="font-mono text-sm font-bold text-[#FF6B00]">{latestTicket.ticketNumber}</span>
          </div>

          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            VALID FOR ENTRY
          </span>
        </div>

        {/* Top Half of Ticket */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20">
                {latestTicket.tierName}
              </span>
              <h2 className="font-heading font-bold text-2xl text-white">
                {latestTicket.eventTitle}
              </h2>
              <p className="text-xs text-gray-400">Attendee: {latestTicket.attendeeName}</p>
            </div>

            <img
              src={latestTicket.eventPoster}
              alt={latestTicket.eventTitle}
              className="w-20 h-28 rounded-xl object-cover border border-white/10 shadow-lg"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10 text-xs text-gray-300">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Date & Time</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-[#FF6B00]" /> {latestTicket.date}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Venue</span>
              <span className="font-semibold text-white flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" /> {latestTicket.venue}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Assigned Seat</span>
              <span className="font-semibold text-[#FF6B00] font-mono mt-0.5 block">
                {latestTicket.seatNumber}
              </span>
            </div>
          </div>
        </div>

        {/* TICKET PERFORATION TEAR EDGE */}
        <div className="relative py-2 flex items-center justify-between bg-[#090909]">
          <div className="w-6 h-6 rounded-full bg-[#090909] border-r border-white/10 -ml-3" />
          <div className="flex-1 border-b-2 border-dashed border-white/20 mx-2" />
          <div className="w-6 h-6 rounded-full bg-[#090909] border-l border-white/10 -mr-3" />
        </div>

        {/* Bottom Half with QR Code */}
        <div className="p-6 sm:p-8 bg-[#1C1C1C]/60 flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-3 bg-white rounded-2xl shadow-xl border-2 border-[#FF6B00]">
            <QRPlaceholder value={latestTicket.qrCodeValue} size={180} showScanLine />
          </div>

          <div className="space-y-1">
            <p className="font-mono text-xs text-[#FF6B00] font-bold">
              {latestTicket.qrCodeValue}
            </p>
            <p className="text-[11px] text-gray-400">Scan this barcode at venue entrance gate</p>
          </div>
        </div>

      </div>


      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={onGoToMyTickets}
          className="w-full sm:flex-1 py-3.5 rounded-2xl bg-[#FF6B00] hover:bg-[#FF8A26] text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B00]/20 transition-all"
        >
          <TicketIcon className="w-4 h-4 stroke-[2.5]" />
          <span>View In My Tickets</span>
        </button>

        <button
          onClick={onExploreMore}
          className="w-full sm:flex-1 py-3.5 rounded-2xl bg-[#141414] hover:bg-[#1C1C1C] border border-white/10 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
        >
          <span>Explore More Events</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
