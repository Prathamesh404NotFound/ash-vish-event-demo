/**
 * enotify.app WhatsApp gateway sender for ashvishevents.com.
 *
 * Sole WhatsApp sender (Meta Cloud API removed Aug 2026 per owner request).
 * Sends ticket confirmation messages as plain WhatsApp chats from the
 * business's QR-connected number via enotify.app, so there is no Meta
 * template approval pipeline involved.
 *
 * Env vars:
 *   ENOTIFY_API_URL   (default: https://enotify.app/api)
 *   ENOTIFY_TOKEN     (instance ID token)
 *   ENOTIFY_ENABLED   ("true" to enable; anything else hard-fails the send)
 *
 * API docs: https://enotify.app/dashboard/api-docs
 */

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.substring(1);
  if (digits.startsWith('00')) digits = digits.substring(2);
  if (!/^\d{9,15}$/.test(digits)) return '';
  return digits;
}

export function formatDateDDMMMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
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

/**
 * Builds the human-readable ticket confirmation message body
 * (WhatsApp markdown: *bold*, _italic_).
 */
function buildTicketMessage(ticket: any): string {
  const appUrl = (process.env.VITE_APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const slugId = ticket.passSlug?.id || '';
  const slugSig = ticket.passSlug?.sig || '';
  const passUrl = `${appUrl}/pass/${slugId}/${slugSig}`;

  const formattedDate = formatDateDDMMMMYYYY(ticket.date);
  const formattedTime = formatTime12h(ticket.time);
  const venueCity = `${ticket.venue || ''}, ${ticket.city || ''}`;
  const mapsQuery = ticket.eventGoogleMapsQuery || venueCity;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;

  return [
    '━━━━━━━━━━━━━━━━━━',
    '*ASH-VISH EVENTS*',
    '*Your Digital QR Pass* 🎟️',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `*${ticket.eventTitle || ''}*`,
    `👤 ${ticket.attendeeName || ''}`,
    `📅 *${formattedDate || ''}* at ${formattedTime || ''}`,
    `📍 ${venueCity}`,
    '',
    `🎫 Tier: *${ticket.tierName || ticket.tier || ''}*`,
    `💺 Seat: ${ticket.seatInfo || `${ticket.tierName || ticket.tier || ''}, ${ticket.seat || 'General Floor'}`}`,
    `🔖 Ref: ${ticket.ticketNumber || ticket.ref || ''}`,
    '',
    '*Your pass is live — tap to open:*',
    passUrl,
    '',
    `📍 *View on Google Maps:* ${mapsUrl}`,
    '',
    '📌 *How to enter:* open the link above and show the QR code at the entrance gate for instant check-in.',
    '━━━━━━━━━━━━━━━━━━',
    '*Thank you — see you at the show!* ✨',
  ].join('\n');
}

function truncateToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

const ENOTIFY_ENABLED = () => process.env.ENOTIFY_ENABLED === 'true';
const ENOTIFY_TOKEN = () => process.env.ENOTIFY_TOKEN || '6523f2a5758e0a2faf8f8d33';
const ENOTIFY_API_URL = () => (process.env.ENOTIFY_API_URL || 'https://enotify.app/api').replace(/\/+$/, '');

type SendResult = { success: boolean; waMessageId?: string; error?: any };

/**
 * Sends a message via enotify.app with retry/backoff.
 * - Retries on 429/5xx and network errors (1s / 3s / 9s, max 3 attempts)
 * - Fails fast on 4xx (auth/credits/invalid phone are not retryable)
 */
async function sendViaEnotify(
  normalizedPhone: string,
  message: string
): Promise<SendResult> {
  const baseUrl = ENOTIFY_API_URL();
  const token = ENOTIFY_TOKEN();
  const truncatedToken = truncateToken(token);

  // enotify.app requires params as URL query parameters (JSON body is
  // rejected with 400 "Invalid phone number"). GET with URL-encoded params
  // is the confirmed working format.
  const url = `${baseUrl}/sendText?token=${encodeURIComponent(token)}&phone=${encodeURIComponent(normalizedPhone)}&message=${encodeURIComponent(message)}`;

  let attempts = 0;
  const maxAttempts = 3;
  const backoffs = [1000, 3000, 9000];
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[ENOTIFY] Send attempt ${attempts}/${maxAttempts} to ${normalizedPhone} with token ${truncatedToken}`);

    try {
      const response = await fetch(url);
      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        // enotify returns HTTP 200 even for some failures: success is when
        // status === "success" (messageIDs present); a JSON status "400"
        // with "Invalid phone number" must fail the send.
        const bodyStatus = responseData.status;
        if (bodyStatus === 'success') {
          const msgIds = responseData.data?.messageIDs;
          const waMessageId = Array.isArray(msgIds) ? msgIds[0] : (responseData.message_id || responseData.messageId || undefined);
          console.log(`[ENOTIFY] Success on attempt ${attempts}. Response: ${JSON.stringify(responseData)}`);
          return { success: true, waMessageId };
        }
        // Body-level error codes — fail fast (not retryable)
        if (bodyStatus === '400' || bodyStatus === '401' || bodyStatus === '402' || bodyStatus === '403') {
          const code = parseInt(String(bodyStatus), 10);
          return {
            success: false,
            error: {
              message: `enotify: ${responseData.message || responseText || 'Error'}`,
              code
            }
          };
        }
        // Unknown successful-looking body — report success with id
        const waMessageId = responseData.message_id || responseData.messageId || responseData.data?.messageIDs?.[0] || undefined;
        console.log(`[ENOTIFY] Success (ambiguous body) on attempt ${attempts}. Response: ${JSON.stringify(responseData)}`);
        return { success: true, waMessageId };
      }

      console.warn(`[ENOTIFY] Received HTTP ${response.status}:`, JSON.stringify(responseData));

      // Auth failure / credits exhausted / invalid phone — fail fast
      if (response.status === 402 || response.status === 401 || response.status === 403 || response.status === 400) {
        return {
          success: false,
          error: {
            message: `enotify HTTP ${response.status}: ${responseData.message || responseText || 'Error'}`,
            code: response.status
          }
        };
      }

      // Retryable: 429 / 5xx
      lastError = responseData;
      if (attempts < maxAttempts) {
        const delayMs = backoffs[attempts - 1];
        console.log(`[ENOTIFY] Retryable HTTP ${response.status}. Backing off ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    } catch (networkErr: any) {
      console.warn(`[ENOTIFY] Network error on attempt ${attempts}:`, networkErr.message || networkErr);
      lastError = { message: networkErr.message || String(networkErr), type: 'NetworkError' };
      if (attempts < maxAttempts) {
        const delayMs = backoffs[attempts - 1];
        console.log(`[ENOTIFY] Backing off ${delayMs}ms after network error...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  console.error('[ENOTIFY] Failed after maximum attempts.');
  return { success: false, error: lastError || { message: 'Failed after maximum attempts' } };
}

/**
 * Sole WhatsApp sender contract for ashvishevents.com (Meta removed).
 *
 * - If ENOTIFY_ENABLED !== 'true' → send fails immediately (no fallback exists).
 * - Otherwise sends the formatted ticket message via enotify.app with retry.
 */
export async function sendTicketWhatsApp(ticket: any, recipientPhone: string): Promise<SendResult> {
  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    console.error('[ENOTIFY] Invalid phone number:', recipientPhone);
    return { success: false, error: { message: 'Invalid phone number format' } };
  }

  // Kill-switch: ENOTIFY_ENABLED not 'true' → hard failure (no fallback)
  if (!ENOTIFY_ENABLED()) {
    console.warn('[ENOTIFY] Disabled (ENOTIFY_ENABLED !== true). Send aborted.');
    return { success: false, error: { message: 'WhatsApp sending is disabled (ENOTIFY_ENABLED !== true)' } };
  }

  const message = buildTicketMessage(ticket);
  return sendViaEnotify(normalizedPhone, message);
}
