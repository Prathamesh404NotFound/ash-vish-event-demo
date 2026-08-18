import { Ticket } from '../types';

function formatDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  } catch {}
  return dateStr;
}

export function formatWhatsAppTicketMessage(ticket: Ticket): string {
  const appUrl = (import.meta.env.VITE_APP_URL as string) || 'https://ashvishevents.com';
  const appBase = appUrl.replace(/\/+$/, '');
  
  const passSlugObj = (ticket as any).passSlug;
  const passPath = passSlugObj?.id && passSlugObj?.sig 
    ? `${passSlugObj.id}/${passSlugObj.sig}` 
    : (ticket as any).passId || ticket.ticketNumber;

  const passUrl = `${appBase}/pass/${passPath}`;

  const formattedDate = formatDate(ticket.date);
  const mapsQuery = (ticket as any).eventGoogleMapsQuery || `${ticket.venue}, ${ticket.city}`;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;

  return [
    '╔══════════════════════════╗',
    '║  🎟️  ASH-VISH EVENTS  🎟️  ║',
    '╚══════════════════════════╝',
    '',
    `┃ *${ticket.eventTitle}* ┃`,
    '',
    '🎫 *TICKET DETAILS*',
    `👤 *Attendee:* ${ticket.attendeeName}`,
    `📅 *Date:* ${formattedDate}`,
    `⏰ *Time:* ${ticket.time}`,
    `🎟️ *Tier:* ${ticket.tierName}`,
    `💺 *Seat:* ${ticket.seatNumber}`,
    `🔖 *Ref:* ${ticket.ticketNumber}`,
    '',
    '📍 *VENUE & DIRECTIONS*',
    `🗺️ *Venue:* ${ticket.venue}, ${ticket.city}`,
    `📍 _Get directions:_ ${mapsUrl}`,
    '',
    '🔐 *YOUR SECURE PASS*',
    '✨ *TAP BELOW — your QR pass opens here:* ✨',
    passUrl,
    '',
    '🙏 Save this message — you\'ll need it at the gate. Questions? Reply here, we respond in minutes!',
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
