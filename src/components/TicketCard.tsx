import React, { useState } from 'react';
import { Calendar, MapPin, User, QrCode, Download, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Ticket as TicketType } from '../types';
import { QRPlaceholder } from './QRPlaceholder';
import { TicketModal } from './TicketModal';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { useBooking } from '../contexts/BookingContext';

interface TicketCardProps {
  ticket: TicketType;
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket }) => {
  const { getEventById } = useBooking();
  const [modalOpen, setModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const event = getEventById(ticket.eventId);

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      generateTicketPDF(ticket, event);
    } catch (e) {
      console.warn('PDF download warning:', e);
    } finally {
      setTimeout(() => setIsDownloading(false), 800);
    }
  };

  const isValid = ticket.status === 'valid';

  return (
    <>
      <div className="card-depth rounded-2xl overflow-hidden bg-[#141414] border border-white/10 shadow-2xl transition-all duration-300 hover:border-[#D4AF37]/40">
        
        {/* Ticket Header Bar */}
        <div className="bg-[#1C1C1C] px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-heading text-xs font-bold text-gray-400 tracking-wider">
              TICKET NO.
            </span>
            <span className="font-mono text-sm font-bold text-[#D4AF37]">
              {ticket.ticketNumber}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
              isValid
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
            }`}
          >
            {isValid ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                <span>CONFIRMED & VALID</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>USED PASS</span>
              </>
            )}
          </span>
        </div>

        {/* Boarding Pass Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          {/* Event Poster & Primary Info */}
          <div className="md:col-span-8 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <img
              src={ticket.eventPoster}
              alt={ticket.eventTitle}
              className="w-24 h-32 rounded-xl object-cover border border-white/10 shrink-0 shadow-lg"
            />

            <div className="space-y-2 flex-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#D4AF37]/10 text-[#D4AF37] text-[10px] font-bold uppercase tracking-wider border border-[#D4AF37]/20">
                {ticket.tierName}
              </span>

              <h3 className="font-heading font-bold text-xl text-white leading-snug">
                {ticket.eventTitle}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-300 pt-1">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{ticket.date} • {ticket.time}</span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{ticket.venue}, {ticket.city}</span>
                </div>

                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{ticket.attendeeName}</span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[#D4AF37]">
                  <span>Seat: {ticket.seatNumber}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Perforated Divider (Hidden on small screens) */}
          <div className="hidden md:block md:col-span-1 flex justify-center h-full relative">
            <div className="w-[1px] h-32 border-r border-dashed border-white/20" />
          </div>

          {/* Right Action & QR Thumbnail */}
          <div className="md:col-span-3 flex flex-col items-center justify-center gap-3 bg-[#1C1C1C]/50 p-4 rounded-xl border border-white/5">
            <div
              onClick={() => setModalOpen(true)}
              className="cursor-pointer group relative p-2 bg-white rounded-lg transition-transform hover:scale-105"
            >
              <QRPlaceholder value={ticket.qrCodeValue} size={110} />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white font-bold text-xs gap-1">
                <ExternalLink className="w-4 h-4" /> Expand
              </div>
            </div>

            <div className="w-full flex flex-col gap-2">
              <button
                onClick={() => setModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#D4AF37]/25 transition-all"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>View Full Pass</span>
              </button>

              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full py-2 px-3 rounded-xl bg-[#1C1C1C] hover:bg-[#262626] border border-white/10 text-gray-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloading ? 'Downloading...' : 'PDF Download'}</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Ticket QR Modal */}
      {modalOpen && <TicketModal ticket={ticket} onClose={() => setModalOpen(false)} />}
    </>
  );
};
