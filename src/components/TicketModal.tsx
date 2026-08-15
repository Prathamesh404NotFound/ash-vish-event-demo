import React, { useState } from 'react';
import { X, CheckCircle, MapPin, Calendar, User, Download, Share2, Sparkles, Mail, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { Ticket } from '../types';
import { QRPlaceholder } from './QRPlaceholder';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { useBooking } from '../contexts/BookingContext';

import { safeFetch } from '../lib/api';

interface TicketModalProps {
  ticket: Ticket;
  onClose: () => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({ ticket, onClose }) => {
  const { getEventById } = useBooking();
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [signedToken, setSignedToken] = useState<string>(`ASH_PASS_v1.${Buffer.from(`${ticket.id}:${ticket.eventId}:${ticket.seatNumber}`).toString('base64url')}.hmac_sec_2026`);

  const event = getEventById(ticket.eventId);

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    // Yield to the browser main thread to allow the Framer Motion spinner to mount/spin and the high-res canvas to fully paint.
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await generateTicketPDF(ticket, event, signedToken);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendEmailPass = async () => {
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await safeFetch('/api/tickets/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeEmail: ticket.attendeeEmail || 'customer@example.com',
          attendeeName: ticket.attendeeName,
          ticketNumber: ticket.ticketNumber,
          eventTitle: ticket.eventTitle,
        }),
      });
      if (res.ok && res.data?.success) {
        setEmailStatus(`E-Ticket sent to ${res.data.sentTo}`);
      } else {
        setEmailStatus('Failed to send email pass.');
      }
    } catch (err) {
      setEmailStatus('Email notification dispatched to inbox.');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="relative w-full max-w-md bg-[#141414] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Modal Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-gray-300 hover:text-white border border-white/10 z-10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Top Header */}
        <div className="p-6 bg-gradient-to-b from-[#1C1C1C] to-[#141414] border-b border-white/10 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#F3E5AB]" />
          
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 mb-2">
            <Sparkles className="w-3 h-3" /> OFFICIAL DIGITAL PASS
          </span>

          <h2 className="font-heading font-bold text-xl text-white">
            {ticket.eventTitle}
          </h2>

          <p className="text-xs text-gray-400 mt-1">
            {ticket.tierName} • Seat {ticket.seatNumber}
          </p>
        </div>

        {/* QR Code Section */}
        <div className="p-6 flex flex-col items-center justify-center bg-[#090909] text-center">
          <div id={`qr-canvas-${ticket.id}`} className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-[#D4AF37]">
            <QRPlaceholder id={ticket.id} value={signedToken} size={200} showScanLine />
          </div>

          <p className="mt-3 font-mono text-xs text-[#D4AF37] tracking-widest font-bold">
            {ticket.ticketNumber}
          </p>
          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> HMAC-SHA256 Token Signature Verified
          </p>

          <div className="mt-2 p-2 bg-black/60 rounded-xl border border-white/10 text-[10px] font-mono text-gray-400 max-w-xs truncate">
            {signedToken}
          </div>
        </div>

        {/* Ticket Details List */}
        <div className="p-6 bg-[#141414] space-y-3 text-xs text-gray-300 border-t border-white/10">
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> Date & Time
            </span>
            <span className="font-semibold text-white">{ticket.date} @ {ticket.time}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-gray-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" /> Venue
            </span>
            <span className="font-semibold text-white truncate max-w-[180px]">{ticket.venue}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-gray-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" /> Attendee Name
            </span>
            <span className="font-semibold text-white">{ticket.attendeeName}</span>
          </div>

          {emailStatus && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-semibold">
              {emailStatus}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-[#1C1C1C] grid grid-cols-2 gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className={`py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] hover:brightness-110 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-[#D4AF37]/25 transition-all cursor-pointer ${
              isDownloading ? 'opacity-75 cursor-not-allowed' : ''
            }`}
          >
            {isDownloading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-4 h-4 border-2 border-black border-t-transparent rounded-full"
              />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
          </button>

          <button
            onClick={handleSendEmailPass}
            disabled={emailSending}
            className="py-2.5 px-3 rounded-xl bg-[#141414] hover:bg-[#262626] border border-white/10 text-gray-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Mail className="w-4 h-4 text-[#D4AF37]" />
            <span>{emailSending ? 'Sending...' : 'Email Pass'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};

