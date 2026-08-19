import crypto from 'crypto';

const DEFAULT_INSTANCE_TOKEN = '6523f2a5758e0a2faf8f8d33';
const DEFAULT_API_URL = 'https://enotify.app/api';

/**
 * Normalizes phone numbers strictly:
 * - Digits only, no "+", no spaces, no dashes
 * - Strips leading 0091 or 0
 * - India 10-digit bare numbers become 91XXXXXXXXXX
 * - Rejects anything that is not 9-15 digits after normalization
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;

  // Strip leading 0091 prefix
  if (cleaned.startsWith('0091')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Bare 10-digit India mobile number -> prepend 91
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  // Reject anything that isn't 9–15 digits after normalization
  if (cleaned.length < 9 || cleaned.length > 15) {
    return null;
  }

  return cleaned;
}

/**
 * Formats date string into "DD Month YYYY" (e.g. 18 August 2026).
 */
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

/**
 * Formats time string into 12h format AM/PM (e.g. 07:30 PM).
 */
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

/**
 * Builds the un-guessable signed pass link:
 * https://ashvishevents.com/pass/<slugId>/<slugSig>
 */
export function buildPassUrl(ticket: any): string {
  const appUrl = (process.env.VITE_APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const slugId = ticket.passSlug?.id || (typeof ticket.passId === 'string' ? ticket.passId : '');
  const slugSig = ticket.passSlug?.sig || '';

  if (slugId && slugSig) {
    return `${appUrl}/pass/${slugId}/${slugSig}`;
  }
  if (slugId) {
    return `${appUrl}/pass/${slugId}`;
  }
  return `${appUrl}/pass/${ticket.ticketNumber || ticket.id}`;
}

/**
 * Generates the clean WhatsApp markdown message conforming to brand design.
 */
export function formatWhatsAppTicketMessage(ticket: any): string {
  const eventTitle = ticket.eventTitle || 'Event';
  const attendeeName = ticket.attendeeName || 'Valued Guest';
  const formattedDate = formatDateDDMMMMYYYY(ticket.date) || ticket.date || '';
  const formattedTime = formatTime12h(ticket.time) || ticket.time || '';
  const venue = ticket.venue || '';
  const city = ticket.city || '';
  const venueWithCity = venue && city ? `${venue}, ${city}` : (venue || city || 'Event Venue');
  const tierName = ticket.tierName || 'Standard';
  const seatNumber = ticket.seatNumber || (Array.isArray(ticket.selectedSeats) && ticket.selectedSeats.length > 0 ? ticket.selectedSeats.join(', ') : 'General Admission');
  const ticketRef = ticket.ticketNumber || ticket.id || '';

  const passUrl = buildPassUrl(ticket);
  const mapsQuery = ticket.eventGoogleMapsQuery || venueWithCity;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;

  const lines = [
    '🎟️ *TICKET CONFIRMATION*',
    '━━━━━━━━━━━━━━━━━━',
    `*Event:* ${eventTitle}`,
    `*Attendee:* ${attendeeName}`,
    `*Date:* ${formattedDate}`,
    `*Time:* ${formattedTime}`,
    `*Venue:* ${venueWithCity}`,
    `*Tier:* ${tierName}`,
    `*Seat:* ${seatNumber}`,
    `*Ticket Ref:* ${ticketRef}`,
    '━━━━━━━━━━━━━━━━━━',
    '📱 *Your Digital Pass & QR Code:*',
    passUrl,
    '',
    '📍 *Google Maps Location:*',
    mapsUrl,
    '',
    'ℹ️ *Check-In Instructions:*',
    'Open the pass link above and show the QR code at the entrance gate for quick verification.',
    '━━━━━━━━━━━━━━━━━━',
    '*Thank you — see you at the show!* ✨'
  ];

  return lines.join('\n');
}

/**
 * Truncates token for safe console logging.
 */
function truncateToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 8) return '***';
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

/**
 * Sends ticket via enotify.app REST API as the SOLE WhatsApp sender.
 * 
 * Strict protocol requirements:
 * - GET https://enotify.app/api/sendText?token=...&phone=...&message=...
 * - Requires ENOTIFY_ENABLED === "true" (kill-switch hard-fail)
 * - Detects true success via body.status === "success" && body.data.messageIDs.length > 0
 * - Retries up to 3 times on 429/5xx/network errors with 1s, 3s, 9s backoffs
 * - Fails fast on 400/401/402/403 (HTTP or body error status)
 */
export async function sendTicketWhatsApp(
  ticket: any,
  recipientPhone: string
): Promise<{ success: boolean; waMessageId?: string; error?: any }> {
  const enabled = process.env.ENOTIFY_ENABLED;
  if (enabled !== 'true') {
    const errorMsg = 'ENOTIFY_DISABLED: WhatsApp sending is disabled because ENOTIFY_ENABLED is not "true"';
    console.error(`[ENOTIFY] Kill-switch active: ${errorMsg}`);
    return {
      success: false,
      error: { message: errorMsg, code: 'ENOTIFY_DISABLED' }
    };
  }

  const token = process.env.ENOTIFY_TOKEN || DEFAULT_INSTANCE_TOKEN;
  const baseUrl = (process.env.ENOTIFY_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    const errorMsg = `Invalid phone number format: "${recipientPhone}". Normalized value must be 9-15 digits.`;
    console.error(`[ENOTIFY] Phone normalization failed: ${errorMsg}`);
    return {
      success: false,
      error: { message: errorMsg, code: 'INVALID_PHONE_NUMBER' }
    };
  }

  const messageText = formatWhatsAppTicketMessage(ticket);
  const truncatedTokenStr = truncateToken(token);

  const maxAttempts = 3;
  const backoffs = [1000, 3000, 9000];
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[ENOTIFY] Send attempt ${attempts}/${maxAttempts} to ${normalizedPhone} (token: ${truncatedTokenStr})`);

    const queryParams = new URLSearchParams({
      token,
      phone: normalizedPhone,
      message: messageText
    });

    const targetUrl = `${baseUrl}/sendText?${queryParams.toString()}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      const responseText = await response.text();
      let responseData: any = null;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch (parseErr) {
        responseData = { raw: responseText };
      }

      // Check for hard failure HTTP status codes (400, 401, 402, 403)
      if (response.status === 400 || response.status === 401 || response.status === 402 || response.status === 403) {
        console.error(`[ENOTIFY] Hard failure HTTP ${response.status}:`, responseText);
        return {
          success: false,
          error: responseData?.error || responseData || { status: response.status, body: responseText }
        };
      }

      // Check for retryable HTTP errors (429, 5xx)
      if (response.status === 429 || response.status >= 500) {
        console.warn(`[ENOTIFY] Retryable HTTP ${response.status} on attempt ${attempts}:`, responseText);
        lastError = responseData?.error || responseData || { status: response.status, body: responseText };
        if (attempts < maxAttempts) {
          const delayMs = backoffs[attempts - 1];
          console.log(`[ENOTIFY] Backing off for ${delayMs}ms before attempt ${attempts + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      // If HTTP is 200, inspect body-level status and payload
      if (response.ok) {
        const bodyStatus = responseData.status !== undefined ? String(responseData.status).toLowerCase() : '';
        const messageIDs = responseData.data?.messageIDs || responseData.data?.messageIds || responseData.messageIDs;

        // TRUE success requires status === "success" and non-empty messageIDs array
        if (bodyStatus === 'success' && Array.isArray(messageIDs) && messageIDs.length > 0) {
          const waMessageId = messageIDs[0];
          console.log(`[ENOTIFY] Success on attempt ${attempts}. Message ID: ${waMessageId}`);
          return {
            success: true,
            waMessageId
          };
        }

        // Body-level hard failure codes ("400", "401", "402", "403") inside HTTP 200
        if (bodyStatus === '400' || bodyStatus === '401' || bodyStatus === '402' || bodyStatus === '403' || bodyStatus === 'failed' || bodyStatus === 'error') {
          console.error(`[ENOTIFY] Hard failure in body payload (status: ${responseData.status}):`, JSON.stringify(responseData));
          return {
            success: false,
            error: responseData
          };
        }

        // Unknown body format or missing messageIDs
        console.warn(`[ENOTIFY] Unexpected response payload structure on attempt ${attempts}:`, JSON.stringify(responseData));
        lastError = responseData;
        if (attempts < maxAttempts) {
          const delayMs = backoffs[attempts - 1];
          console.log(`[ENOTIFY] Backing off for ${delayMs}ms before attempt ${attempts + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
    } catch (networkErr: any) {
      console.warn(`[ENOTIFY] Network error on attempt ${attempts}:`, networkErr.message || networkErr);
      lastError = { message: networkErr.message || String(networkErr), type: 'NetworkError' };
      if (attempts < maxAttempts) {
        const delayMs = backoffs[attempts - 1];
        console.log(`[ENOTIFY] Backing off for ${delayMs}ms after network error...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  console.error(`[ENOTIFY] Delivery failed after ${maxAttempts} attempts.`);
  return {
    success: false,
    error: lastError || { message: 'Failed after maximum attempts' }
  };
}
