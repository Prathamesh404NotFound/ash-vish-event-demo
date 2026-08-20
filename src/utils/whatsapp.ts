import { Ticket } from '../types';

export function formatDateDDMMMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = d.getDate();
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    }
  } catch {}
  return dateStr;
}

export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  if (/AM|PM/i.test(timeStr)) return timeStr.trim();
  try {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1].substring(0, 2);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strHours = hours < 10 ? `0${hours}` : `${hours}`;
      return `${strHours}:${minutes} ${ampm}`;
    }
  } catch {}
  return timeStr;
}

export function formatWhatsAppTicketMessage(ticket: Ticket): string {
  const appUrl = (import.meta.env.VITE_APP_URL as string) || 'https://ashvishevents.com';
  const appBase = appUrl.replace(/\/+$/, '');
  
  const passSlugObj = (ticket as any).passSlug;
  const passPath = passSlugObj?.id && passSlugObj?.sig 
    ? `${passSlugObj.id}/${passSlugObj.sig}` 
    : (ticket as any).passId || ticket.ticketNumber;

  const passUrl = `${appBase}/pass/${passPath}`;

  const eventTitle = ticket.eventTitle || 'Event';
  const attendeeName = ticket.attendeeName || 'Valued Guest';
  const quantity = Number(ticket.quantity) > 0 ? Number(ticket.quantity) : 1;
  const formattedDate = formatDateDDMMMMYYYY(ticket.date) || ticket.date || '';
  const formattedTime = formatTime12h(ticket.time) || ticket.time || '';
  const venue = ticket.venue || '';
  const city = ticket.city || '';
  const venueWithCity = venue && city ? `${venue}, ${city}` : (venue || city || 'Event Venue');
  const tierName = ticket.tierName || 'Standard';

  const selectedSeats = Array.isArray((ticket as any).selectedSeats) ? (ticket as any).selectedSeats : [];
  const rawSeatNumber = ticket.seatNumber || (selectedSeats.length > 0 ? selectedSeats.join(', ') : '');
  const hasSeats = selectedSeats.length > 0 || (rawSeatNumber && !/general/i.test(rawSeatNumber));
  const seatLabel = hasSeats ? rawSeatNumber : '';

  const rawTicketRef = ticket.ticketNumber || (ticket as any).id || '';
  const ticketRef = String(rawTicketRef).replace(/^ASH-/i, '');

  const mapsRaw = (ticket as any).eventGoogleMapsQuery || venueWithCity;
  const mapsUrl = /^https?:\/\//i.test(mapsRaw) ? mapsRaw : `https://maps.google.com/?q=${encodeURIComponent(mapsRaw)}`;

  const lines = [
    '🎟️ *TICKET CONFIRMED — You\'re In!*',
    '━━━━━━━━━━━━━━━',
    `🎬 *${eventTitle}*`,
    '━━━━━━━━━━━━━━━',
    '',
    `👤 *Attendee:* ${attendeeName}`,
    `🎟️ *Tickets:* ${quantity || 1}`,
    `📅 *Date:* ${formattedDate}`,
    `🕗 *Time:* ${formattedTime}`,
    `📍 *Venue:* ${venueWithCity}`,
    `🪑 *Tier:* ${tierName}`,
    ...(hasSeats ? [`💺 *Seat:* ${seatLabel}`] : []),
    `🧾 *Ticket Ref:* \`ASH-${ticketRef}\``,
    '',
    '🔗 *Your Digital Pass*',
    `👉 ${passUrl}`,
    '_Scan at the gate — no printing needed_',
    '',
    '🗺️ *Get Directions*',
    `👉 ${mapsUrl}`,
    '',
    '⚠️ *Check-In Tips*',
    '• Open the pass link & show the QR at the gate',
    '• One QR per attendee — everyone gets their own pass',
    '• Please arrive 15 minutes before show time',
    '',
    '✨ *Thank you for booking with Ash-vish Events!*',
    '📩 Any help? — hello@ashvishevents.com'
  ];

  return lines.join('\n');
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
