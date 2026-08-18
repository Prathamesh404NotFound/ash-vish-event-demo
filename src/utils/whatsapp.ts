import { Ticket } from '../types';

/**
 * Formats a clean, professional WhatsApp ticket message with event details,
 * seat info, ticket ref, and digital QR pass link.
 */
export function formatWhatsAppTicketMessage(ticket: Ticket): string {
  const appUrl = window.location.origin;
  const passUrl = `${appUrl}/#pass-${ticket.ticketNumber}`;

  return `🎟️ *ASH-VISH EVENTS — OFFICIAL DIGITAL QR PASS* 🎟️

*Event:* ${ticket.eventTitle}
*Ticket Ref:* ${ticket.ticketNumber}
*Tier:* ${ticket.tierName}
*Seat:* ${ticket.seatNumber}
*Attendee Name:* ${ticket.attendeeName}
*Date & Time:* ${ticket.date} @ ${ticket.time}
*Venue:* ${ticket.venue}, ${ticket.city}

*QR Pass Code:* ${ticket.qrCodeValue}

📌 *Instructions:* Present this QR pass or digital message at the venue entrance gate for instant check-in.

View Digital Pass online:
${passUrl}`;
}

/**
 * Opens WhatsApp Web/App pre-filled with the ticket pass message for the given phone number.
 */
export function sendTicketToWhatsApp(ticket: Ticket): void {
  let rawPhone = (ticket.attendeePhone || '').replace(/\D/g, '');
  
  // If 10-digit Indian mobile number, prefix with country code 91
  if (rawPhone.length === 10) {
    rawPhone = `91${rawPhone}`;
  }

  const messageText = encodeURIComponent(formatWhatsAppTicketMessage(ticket));
  
  const whatsappUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${messageText}`
    : `https://api.whatsapp.com/send?text=${messageText}`;

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}
