import React, { useState } from 'react';
import { Calendar, Clock, MapPin, User, Mail, Phone, Download, Share2, MessageSquareCode, Ticket as TicketIcon, ChevronDown, ChevronUp, QrCode } from 'lucide-react';
import { Ticket } from '../types';
import { formatINR } from '../utils/formatters';
import { formatDateDDMMMMYYYY, formatTime12h } from '../utils/whatsapp';
import { sendTicketToWhatsApp } from '../utils/whatsapp';
import { QRPlaceholder } from './QRPlaceholder';
import { generateTicketPDF } from '../utils/pdfGenerator';

interface PurchasedTicketCardProps {
  ticket: Ticket;
  onResendWhatsApp?: (ticketId: string) => void;
}

export const PurchasedTicketCard: React.FC<PurchasedTicketCardProps> = ({ ticket, onResendWhatsApp }) => {
  const [expanded, setExpanded] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);

  const formattedDate = formatDateDDMMMMYYYY(ticket.date) || ticket.date || '';
  const formattedTime = formatTime12h(ticket.time) || ticket.time || '';

  const handleDownloadPDF = async () => {
    setPdfGenerating(true);
    try {
      await generateTicketPDF(ticket);
    } catch (err) {
      console.warn('PDF generation failed:', err);
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleSendWhatsApp = () => {
    setSendingWA(true);
    try {
      sendTicketToWhatsApp(ticket);
    } catch (err) {
      console.warn('WhatsApp send failed:', err);
    } finally {
      setSendingWA(false);
    }
  };

  const handleShare = async () => {
    const passSlugObj = (ticket as any).passSlug;
    const passPath = passSlugObj?.id && passSlugObj?.sig
      ? `${passSlugObj.id}/${passSlugObj.sig}`
      : (ticket as any).passId || ticket.ticketNumber;
    const passUrl = `${window.location.origin}/pass/${passPath}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${ticket.eventTitle} — Ticket Confirmed`,
          text: `I've got my ticket for ${ticket.eventTitle}! 🎟️`,
          url: passUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(passUrl);
    }
  };

  const selectedSeats = Array.isArray(ticket.selectedSeats) ? ticket.selectedSeats : [];
  const seatLabel = selectedSeats.length > 0
    ? selectedSeats.join(', ')
    : (ticket.seatNumber && !/general/i.test(ticket.seatNumber) ? ticket.seatNumber : '');

  return (
    <div className="rounded-2xl border border-white/10 bg-[#141414] overflow-hidden transition-all duration-200 hover:border-[#D4AF37]/30">
      {/* Header: Event info */}
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          {/* Event poster thumbnail */}
          {ticket.eventPoster ? (
            <img
              src={ticket.eventPoster}
              alt={ticket.eventTitle}
              className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl object-cover border border-white/10 flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-[#1C1C1C] border border-white/10 flex items-center justify-center flex-shrink-0">
              <TicketIcon className="w-6 h-6 text-white/20" />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                {ticket.tierName}
              </span>
              {ticket.status === 'valid' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ✓ Active
                </span>
              )}
              {ticket.status === 'used' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
                  Used
                </span>
              )}
              {ticket.paymentStatus === 'pending' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Payment Pending
                </span>
              )}
            </div>

            <h3 className="font-heading font-bold text-base sm:text-lg text-white truncate">{ticket.eventTitle}</h3>

            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formattedTime}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{ticket.venue}{ticket.city ? `, ${ticket.city}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Ticket ref + price */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-[11px] font-mono text-gray-500">
            Ref: <span className="text-gray-300">{ticket.ticketNumber}</span>
          </span>
          <span className="text-sm font-bold text-[#D4AF37]">{formatINR(ticket.totalPaid || ticket.price * (ticket.quantity || 1))}</span>
        </div>

        {/* Seat info if present */}
        {seatLabel && (
          <div className="px-3 py-2 rounded-xl bg-[#1C1C1C] border border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Seats</p>
            <p className="text-sm font-bold text-[#D4AF37]">{seatLabel}</p>
          </div>
        )}
      </div>

      {/* QR Code section */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">
        <div className="p-3 rounded-xl bg-[#1C1C1C] border border-white/5 flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
            {ticket.qrCodeValue ? (
              <QRPlaceholder value={ticket.qrCodeValue} size={56} />
            ) : (
              <QrCode className="w-8 h-8 text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">Digital Pass QR</p>
            <p className="text-[10px] text-gray-400 truncate">Show this at the gate entrance</p>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 sm:px-5 py-3 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <span>Attendee Details</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="px-4 sm:px-5 pb-4 space-y-3 animate-in fade-in">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-gray-400">Name:</span>
                <span className="text-white font-semibold">{ticket.attendeeName}</span>
              </div>
              {ticket.attendeeEmail && (
                <div className="flex items-center gap-2 text-xs">
                  <Mail className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-gray-400">Email:</span>
                  <span className="text-white">{ticket.attendeeEmail}</span>
                </div>
              )}
              {ticket.attendeePhone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span className="text-gray-400">Phone:</span>
                  <span className="text-white">{ticket.attendeePhone}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex gap-2">
        <button
          onClick={handleSendWhatsApp}
          disabled={sendingWA}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold hover:bg-emerald-500/20 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <MessageSquareCode className="w-4 h-4" />
          <span>WhatsApp</span>
        </button>

        <button
          onClick={handleDownloadPDF}
          disabled={pdfGenerating}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-xs font-bold hover:bg-[#D4AF37]/20 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{pdfGenerating ? 'Generating...' : 'Download PDF'}</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center justify-center p-2.5 rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
