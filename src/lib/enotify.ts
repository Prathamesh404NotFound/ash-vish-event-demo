/**
 * enotify.app WhatsApp gateway sender for ashvishevents.com.
 *
 * Sends ticket confirmation messages as plain WhatsApp chats from the
 * business's QR-connected number (+91 77459 98497) via enotify.app,
 * so there is no Meta template approval pipeline involved.
 *
 * Env vars:
 *   ENOTIFY_API_URL   (default: https://enotify.app/api)
 *   ENOTIFY_TOKEN     (instance ID token)
 *   ENOTIFY_ENABLED   ("true" to enable; anything else uses Meta fallback only)
 *
 * Failover: if enotify is disabled, down, or returns an error, the message
 * falls back to the existing Meta WhatsApp Cloud API sender
 * (sendTicketCloud). The channel label 'whatsapp_cloud' is kept for all
 * audit rows for continuity.
 *
 * API docs: https://enotify.app/dashboard/api-docs
 */

import { sendTicketCloud, normalizePhoneNumber } from './whatsappCloud';

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
 * (WhatsApp markdown: *bold*, _italic_) identical in content to the
 * Meta template layout.
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
 * - Fails fast on 4xx; on 402 (credits exhausted) skips straight to
 *   the Meta fallback without retrying.
 */
async function sendViaEnotify(
  normalizedPhone: string,
  message: string
): Promise<SendResult> {
  const baseUrl = ENOTIFY_API_URL();
  const token = ENOTIFY_TOKEN();
  const truncatedToken = truncateToken(token);

  // enotify.app requires params as URL query parameters (JSON body is
  // rejected with 400 "Invalid phone number"). Use GET with the params
  // URL-encoded (the same params work on POST per docs; GET is confirmed).
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
        // with "Invalid phone number" should trigger the Meta fallback.
        const bodyStatus = responseData.status;
        if (bodyStatus === 'success') {
          const msgIds = responseData.data?.messageIDs;
          const waMessageId = Array.isArray(msgIds) ? msgIds[0] : (responseData.message_id || responseData.messageId || undefined);
          console.log(`[ENOTIFY] Success on attempt ${attempts}. Response: ${JSON.stringify(responseData)}`);
          return { success: true, waMessageId };
        }
        // Treat body-level 400 (e.g. invalid phone) as a failure to fall back
        if (bodyStatus === '400' || bodyStatus === '401' || bodyStatus === '402' || bodyStatus === '403') {
          const code = parseInt(String(bodyStatus), 10);
          return {
            success: false,
            error: {
              message: `enotify: ${responseData.message || responseText || 'Error'}`,
              code,
              fallback: 'meta'
            }
          };
        }
        // Unknown successful-looking body — still report success with id
        const waMessageId = responseData.message_id || responseData.messageId || responseData.data?.messageIDs?.[0] || undefined;
        console.log(`[ENOTIFY] Success (ambiguous body) on attempt ${attempts}. Response: ${JSON.stringify(responseData)}`);
        return { success: true, waMessageId };
      }

      console.warn(`[ENOTIFY] Received HTTP ${response.status}:`, JSON.stringify(responseData));

      // Credits exhausted or auth failure — fail fast and fall back to Meta
      if (response.status === 402 || response.status === 401 || response.status === 403 || response.status === 400) {
        return {
          success: false,
          error: {
            message: `enotify HTTP ${response.status}: ${responseData.message || responseText || 'Error'}`,
            code: response.status,
            fallback: 'meta'
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
 * Primary sender contract. Same signature/shape as sendTicketCloud so all
 * callers remain unchanged.
 *
 * Flow:
 * 1. If ENOTIFY_ENABLED !== 'true' → Meta path unchanged.
 * 2. Try enotify; on success → return success (channel stays whatsapp_cloud).
 * 3. On enotify failure → log and fall back to Meta Cloud API.
 */
export async function sendTicketWhatsApp(ticket: any, recipientPhone: string): Promise<SendResult> {
  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    console.error('[ENOTIFY] Invalid phone number:', recipientPhone);
    return { success: false, error: { message: 'Invalid phone number format' } };
  }

  // Kill-switch: ENOTIFY_ENABLED not 'true' → pure Meta behavior
  if (!ENOTIFY_ENABLED()) {
    console.log('[ENOTIFY] Disabled (ENOTIFY_ENABLED !== true). Using Meta Cloud API path.');
    return sendTicketCloud(ticket, recipientPhone);
  }

  const message = buildTicketMessage(ticket);

  // 1) Try enotify.app
  const enResult = await sendViaEnotify(normalizedPhone, message);
  if (enResult.success) {
    return { success: true, waMessageId: enResult.waMessageId };
  }

  // 402/credits exhausted → skip retries, fall straight to Meta
  const shouldFallBack = !enResult.error?.code || [400, 401, 402, 403, 429, 500, 502, 503].includes(enResult.error.code);
  if (shouldFallBack) {
    console.warn('[ENOTIFY] Falling back to Meta WhatsApp Cloud API after enotify failure:', JSON.stringify(enResult.error));
    try {
      const metaResult = await sendTicketCloud(ticket, recipientPhone);
      if (metaResult.success) {
        return { success: true, waMessageId: metaResult.waMessageId };
      }
      return { success: false, error: { message: 'Both enotify and Meta senders failed', meta: metaResult.error, enotify: enResult.error } };
    } catch (metaErr: any) {
      // Meta disabled (WHATSAPP_TEST_MODE !== true) is expected in production; surface enotify failure instead
      console.warn('[ENOTIFY] Meta fallback also failed:', metaErr?.message || metaErr);
      return { success: false, error: enResult.error };
    }
  }

  return enResult;
}
