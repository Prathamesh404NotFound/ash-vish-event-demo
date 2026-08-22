import "dotenv/config";

const DEFAULT_INSTANCE_TOKEN = '';
const DEFAULT_API_URL = 'https://enotify.app/api';

/**
 * Normalizes phone numbers strictly:
 * - Digits only, no "+", no spaces, no dashes
 * - Strips leading 0091, 00, or single leading 0 (for 11-digit numbers)
 * - India 10-digit bare numbers become 91XXXXXXXXXX
 * - Rejects anything that is not 9-15 digits after normalization
 */
export function normalizePhoneNumber(phone: string | number | undefined | null): string | null {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return null;

  // Strip leading 0091 prefix
  if (cleaned.startsWith('0091')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
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
  const rawBase =
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    'https://ashvishevents.com';
  
  const appUrl = rawBase.replace(/\/+$/, '');
  const slugId = ticket?.passSlug?.id || (typeof ticket?.passId === 'string' ? ticket.passId : '');
  const slugSig = ticket?.passSlug?.sig || '';

  if (slugId && slugSig) {
    return `${appUrl}/pass/${slugId}/${slugSig}`;
  }
  if (slugId) {
    return `${appUrl}/pass/${slugId}`;
  }
  return `${appUrl}/pass/${ticket?.ticketNumber || ticket?.id || 'entry'}`;
}

/**
 * Builds short pass link for messages & sharing.
 */
export function buildShortPassUrl(ticket: any): string {
  return buildPassUrl(ticket);
}

/**
 * Generates the clean WhatsApp markdown message conforming to brand design.
 */
export function formatWhatsAppTicketMessage(ticket: any): string {
  const eventTitle = ticket?.eventTitle || 'Event';
  const attendeeName = ticket?.attendeeName || 'Valued Guest';
  const quantity = Number(ticket?.quantity) > 0 ? Number(ticket.quantity) : 1;
  const formattedDate = formatDateDDMMMMYYYY(ticket?.date) || ticket?.date || '';
  const formattedTime = formatTime12h(ticket?.time) || ticket?.time || '';
  const venue = ticket?.venue || '';
  const city = ticket?.city || '';
  const venueWithCity = venue && city ? `${venue}, ${city}` : (venue || city || 'Event Venue');
  const tierName = ticket?.tierName || 'Standard';

  const selectedSeats = Array.isArray(ticket?.selectedSeats) ? ticket.selectedSeats : [];
  const rawSeatNumber = ticket?.seatNumber || (selectedSeats.length > 0 ? selectedSeats.join(', ') : '');
  const hasSeats = selectedSeats.length > 0 || (rawSeatNumber && !/general/i.test(rawSeatNumber));
  const seatLabel = hasSeats ? rawSeatNumber : '';

  const rawTicketRef = ticket?.ticketNumber || ticket?.id || '';
  const ticketRef = String(rawTicketRef).replace(/^ASH-/i, '');

  const shortPassUrl = buildShortPassUrl(ticket);
  const mapsRaw = ticket?.eventGoogleMapsQuery || venueWithCity;
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
    `👉 ${shortPassUrl}`,
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
 * - Reads Vercel environment keys: ENOTIFY_TOKEN, ENOTIFY_API_URL, ENOTIFY_ENABLED
 * - Detects true success via body status/data.messageIDs
 * - Retries up to 3 times on 429/5xx/network errors with 1s, 3s, 9s backoffs
 * - Fails fast on 400/401/402/403 (HTTP or body error status)
 */
export async function sendTicketWhatsApp(
  ticket: any,
  recipientPhone: string
): Promise<{ success: boolean; waMessageId?: string; error?: any }> {
  const rawEnabled = process.env.ENOTIFY_ENABLED;
  const isExplicitlyDisabled = rawEnabled !== undefined && ['false', '0', 'off', 'no', 'disabled'].includes(String(rawEnabled).trim().toLowerCase());
  
  if (isExplicitlyDisabled) {
    const errorMsg = 'ENOTIFY_DISABLED: WhatsApp sending is disabled via ENOTIFY_ENABLED environment variable.';
    console.warn(`[ENOTIFY] Sending skipped: ${errorMsg}`);
    return {
      success: false,
      error: { message: errorMsg, code: 'ENOTIFY_DISABLED' }
    };
  }

  const token = (
    process.env.ENOTIFY_TOKEN ||
    process.env.ENOTIFY_API_KEY ||
    process.env.ENOTIFY_INSTANCE_TOKEN ||
    DEFAULT_INSTANCE_TOKEN
  ).trim();

  if (!token) {
    console.error('[ENOTIFY] WhatsApp API token is missing in environment variables.');
    return { success: false, error: 'MISSING_API_TOKEN' };
  }

  const baseUrl = (
    process.env.ENOTIFY_API_URL ||
    DEFAULT_API_URL
  ).trim().replace(/\/+$/, '');

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

    const targetUrl = `${baseUrl}/sendText?token=${encodeURIComponent(token)}&phone=${encodeURIComponent(normalizedPhone)}&message=${encodeURIComponent(messageText)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        },
        signal: controller.signal
      });

      const responseText = await response.text();
      let responseData: any = null;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
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

      // If HTTP is 200/OK, inspect body-level status and payload
      if (response.ok) {
        const rawStatus = responseData.status;
        const statusStr = rawStatus !== undefined && rawStatus !== null ? String(rawStatus).trim().toLowerCase() : '';
        const messageIDs = responseData.data?.messageIDs || responseData.data?.messageIds || responseData.messageIDs || responseData.messageIds;

        // Body-level hard failure codes ("400", "401", "402", "403", "failed", "error", "false")
        if (['400', '401', '402', '403', 'error', 'failed', 'false'].includes(statusStr)) {
          console.error(`[ENOTIFY] Hard failure in body payload (status: ${responseData.status}):`, JSON.stringify(responseData));
          return {
            success: false,
            error: responseData
          };
        }

        // Check for success condition
        if (
          statusStr === 'success' ||
          rawStatus === true ||
          rawStatus === 200 ||
          statusStr === '200' ||
          (Array.isArray(messageIDs) && messageIDs.length > 0) ||
          responseData.data?.id ||
          responseData.messageId
        ) {
          let waMessageId: string;
          if (Array.isArray(messageIDs) && messageIDs.length > 0) {
            waMessageId = String(messageIDs[0]);
          } else if (typeof messageIDs === 'string') {
            waMessageId = messageIDs;
          } else if (responseData.data?.id || responseData.messageId) {
            waMessageId = String(responseData.data?.id || responseData.messageId);
          } else {
            waMessageId = `enotify_${Date.now()}`;
          }

          console.log(`[ENOTIFY] Success on attempt ${attempts}. Message ID: ${waMessageId}`);
          return {
            success: true,
            waMessageId
          };
        }

        // Unknown body format
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
      const isAbort = networkErr.name === 'AbortError';
      const errMsg = isAbort ? 'Request timed out after 15s' : (networkErr.message || String(networkErr));
      console.warn(`[ENOTIFY] Network error on attempt ${attempts}:`, errMsg);
      lastError = { message: errMsg, type: isAbort ? 'TimeoutError' : 'NetworkError' };
      if (attempts < maxAttempts) {
        const delayMs = backoffs[attempts - 1];
        console.log(`[ENOTIFY] Backing off for ${delayMs}ms after network error...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  console.error(`[ENOTIFY] Delivery failed after ${maxAttempts} attempts.`);
  return {
    success: false,
    error: lastError || { message: 'Failed after maximum attempts' }
  };
}

/**
 * Sends ticket via enotify.app REST API WITH an image (event poster).
 * 
 * Protocol:
 * GET https://enotify.app/api/sendImage?token=...&phone=...&image=...&caption=...
 */
export async function sendTicketWhatsAppWithImage(
  ticket: any,
  recipientPhone: string
): Promise<{ success: boolean; waMessageId?: string; error?: any }> {
  const rawEnabled = process.env.ENOTIFY_ENABLED;
  const isExplicitlyDisabled = rawEnabled !== undefined && ['false', '0', 'off', 'no', 'disabled'].includes(String(rawEnabled).trim().toLowerCase());
  
  if (isExplicitlyDisabled) return { success: false, error: 'ENOTIFY_DISABLED' };

  const token = (
    process.env.ENOTIFY_TOKEN ||
    process.env.ENOTIFY_API_KEY ||
    process.env.ENOTIFY_INSTANCE_TOKEN ||
    DEFAULT_INSTANCE_TOKEN
  ).trim();

  if (!token) return { success: false, error: 'MISSING_API_TOKEN' };

  const baseUrl = (
    process.env.ENOTIFY_API_URL ||
    DEFAULT_API_URL
  ).trim().replace(/\/+$/, '');

  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) return { success: false, error: 'INVALID_PHONE_NUMBER' };

  const messageText = formatWhatsAppTicketMessage(ticket);
  
  // Use the public URL for the poster
  const appUrl = (process.env.VITE_APP_URL || process.env.APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const posterUrl = `${appUrl}/sufiyana-shaam-poster.jpg`;

  const targetUrl = `${baseUrl}/sendImage?token=${encodeURIComponent(token)}&phone=${encodeURIComponent(normalizedPhone)}&image=${encodeURIComponent(posterUrl)}&caption=${encodeURIComponent(messageText)}`;

  try {
    const response = await fetch(targetUrl);
    const responseData: any = await response.json();
    
    if (response.ok && (responseData.status === 'success' || responseData.status === true || responseData.status === 200)) {
      return { success: true, waMessageId: responseData.data?.id || responseData.messageId || `enotify_img_${Date.now()}` };
    }
    
    return { success: false, error: responseData };
  } catch (err) {
    console.error("[ENOTIFY] Image send network/fetch error:", err);
    return { success: false, error: err };
  }
}
