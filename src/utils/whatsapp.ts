import { Ticket } from '../types';

export function formatWhatsAppTicketMessage(ticket: Ticket): string {
  const appUrl = (import.meta.env.VITE_APP_URL as string) || 'https://ashvishevents.com';
  const appBase = appUrl.replace(/\/+$/, '');
  
  const passSlugObj = (ticket as any).passSlug;
  const passPath = passSlugObj?.id && passSlugObj?.sig 
    ? `${passSlugObj.id}/${passSlugObj.sig}` 
    : (ticket as any).passId || ticket.ticketNumber;

  const passUrl = `${appBase}/pass/${passPath}`;

  return [
    '━━━━━━━━━━━━━━━━━━',
    '*ASH-VISH EVENTS*',
    '*Your Digital QR Pass*  🎟️',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `*${ticket.eventTitle}*`,
    `👤 ${ticket.attendeeName}`,
    `📅 *${ticket.date}* at ${ticket.time}`,
    `📍 ${ticket.venue}, ${ticket.city}`,
    '',
    `🎫 Tier: *${ticket.tierName}*\n💺 Seat: ${ticket.seatNumber}\n🔖 Ref: ${ticket.ticketNumber}`,
    '',
    '*Your pass is live — tap to open:*',
    passUrl,
    '',
    '📌 *How to enter:* open the link above and show the QR code at the entrance gate for instant check-in.',
    '━━━━━━━━━━━━━━━━━━',
    `*Thank you — see you at the show!* ✨`,
  ].join('\n');
}

export function sendTicketToWhatsApp(ticket: Ticket): void {
  let rawPhone = (ticket.attendeePhone || '').replace(/\D/g, '');
  if (rawPhone.length === 10) rawPhone = `91${rawPhone}`;
  const messageText = encodeURIComponent(formatWhatsAppTicketMessage(ticket));
  const whatsappUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${messageText}`
    : `https://api.whatsapp.com/send?text=${messageText}`;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}
