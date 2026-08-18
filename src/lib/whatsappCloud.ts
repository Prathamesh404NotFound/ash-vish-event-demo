import { Ticket } from '../types';

/**
 * Helper to format date string to "DD MMMM YYYY" (e.g., 18 August 2026).
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
 * Helper to convert 24h format time (e.g., "19:30") to 12h formatted time (e.g., "07:30 PM").
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
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const strHours = hours < 10 ? `0${hours}` : `${hours}`;
      return `${strHours}:${minutes} ${ampm}`;
    }
  } catch {}
  return timeStr;
}

/**
 * Helper to truncate token for logging (first 6 + last 4 chars).
 */
function truncateToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

/**
 * Normalizes phone number to strip non-digits and prepend '91' if 10 digits.
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  return cleaned;
}

/**
 * Returns parameters for the ticket_confirmation WhatsApp template.
 */
export function getTicketMessageComponents(ticket: any) {
  const appUrl = (process.env.VITE_APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const slugId = ticket.passSlug?.id || '';
  const slugSig = ticket.passSlug?.sig || '';
  const passUrl = `${appUrl}/pass/${slugId}/${slugSig}`;

  const formattedDate = formatDateDDMMMMYYYY(ticket.date);
  const formattedTime = formatTime12h(ticket.time);

  return [
    { type: "text", text: ticket.attendeeName || '' },
    { type: "text", text: ticket.eventTitle || '' },
    { type: "text", text: formattedDate || '' },
    { type: "text", text: formattedTime || '' },
    { type: "text", text: `${ticket.venue || ''}, ${ticket.city || ''}` },
    { type: "text", text: ticket.ticketNumber || '' },
    { type: "text", text: passUrl }
  ];
}

/**
 * Returns the media header component (event poster image) if the ticket
 * carries a usable public poster URL, otherwise null.
 */
export function getTicketHeaderComponent(ticket: any): { type: "image"; image: { link: string } } | null {
  const poster = ticket?.eventPoster;
  if (poster && /^https?:\/\//i.test(String(poster))) {
    return { type: "image", image: { link: poster } };
  }
  return null;
}

/**
 * Sends ticket confirmation via Meta's WhatsApp Cloud API (test mode enabled).
 */
export async function sendTicketCloud(ticket: any, recipientPhone: string): Promise<{ success: boolean; waMessageId?: string; error?: any }> {
  const testMode = process.env.WHATSAPP_TEST_MODE;
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (testMode !== 'true') {
    const err = new Error('WhatsAppAPI_DISABLED');
    (err as any).code = 'WhatsAppAPI_DISABLED';
    throw err;
  }

  if (!token || !phoneNumberId) {
    console.error('[WHATSAPP CLOUD] Missing credentials:', { hasToken: !!token, hasPhoneNumberId: !!phoneNumberId });
    return { success: false, error: { message: 'Missing credentials' } };
  }

  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    console.error('[WHATSAPP CLOUD] Invalid phone number:', recipientPhone);
    return { success: false, error: { message: 'Invalid phone number format', code: 131008 } };
  }

  const parameters = getTicketMessageComponents(ticket);
  const headerComponent = getTicketHeaderComponent(ticket);
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "template",
    template: {
      name: "ticket_confirmation_media",
      language: { code: "en_US" },
      components: [
        ...(headerComponent ? [headerComponent] : []),
        {
          type: "body",
          parameters: parameters
        }
      ]
    }
  } as any;

  const url = `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`;
  const truncatedToken = truncateToken(token);

  let attempts = 0;
  const maxAttempts = 3;
  const backoffs = [1000, 3000, 9000];
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[WHATSAPP CLOUD] Send attempt ${attempts}/${maxAttempts} to ${normalizedPhone} using token ${truncatedToken}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseErr) {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        const waMessageId = responseData.messages?.[0]?.id;
        console.log(`[WHATSAPP CLOUD] Success on attempt ${attempts}. Message ID: ${waMessageId}`);
        return { success: true, waMessageId };
      }

      // Handle non-ok response
      const metaError = responseData.error || responseData;
      const status = response.status;
      console.warn(`[WHATSAPP CLOUD] Received HTTP ${status} error response:`, JSON.stringify(metaError));

      // Template-missing fallback: error 132001 means the custom template
      // 'ticket_confirmation' has not been created in WhatsApp Manager yet.
      // Fall back once to the built-in 'hello_world' template (exists in every
      // account by default) so a message still reaches the attendee immediately.
      const templateMissing =
        metaError?.code === 132001 ||
        (typeof metaError?.message === 'string' && /template name .* does not exist/i.test(metaError.message));
      if (templateMissing && payload.template.name !== 'hello_world') {
        console.warn(`[WHATSAPP CLOUD] Custom template missing (132001). Falling back to built-in hello_world.`);
        payload.template = { name: 'hello_world', language: { code: 'en_US' } };
        // hello_world takes no body parameters — remove them for the fallback call
        delete (payload.template as any).components;
        continue;
      }

      // Header mismatch (132040): the template's header is 'None' but we sent
      // a media (image) header component. Strip the header once and retry.
      if (
        (metaError?.code === 132040 ||
          (typeof metaError?.message === 'string' &&
            /header/i.test(metaError.message))) &&
        attempts === 1 &&
        Array.isArray(payload.template.components) &&
        headerComponent !== null
      ) {
        console.warn(`[WHATSAPP CLOUD] Template header mismatch (${metaError?.code || 'unknown'}). Retrying with the headerless 'ticket_confirmation' template (image header removed).`);
        payload.template = {
          name: 'ticket_confirmation',
          language: { code: 'en_US' },
          components: payload.template.components.filter((c: any) => c.type !== 'image')
        };
        continue;
      }

      // Retryable statuses: 429, 500, 502, 503
      if (status === 429 || status === 500 || status === 502 || status === 503) {
        lastError = metaError;
        if (attempts < maxAttempts) {
          const delayMs = backoffs[attempts - 1];
          console.log(`[WHATSAPP CLOUD] Retryable HTTP ${status}. Backing off for ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      } else {
        // Non-retryable HTTP errors (400, 401, 403, etc.) - fail fast!
        console.error(`[WHATSAPP CLOUD] Non-retryable HTTP ${status} error. Failing fast.`);
        return { success: false, error: metaError };
      }
    } catch (networkErr: any) {
      console.warn(`[WHATSAPP CLOUD] Network error on attempt ${attempts}:`, networkErr.message || networkErr);
      lastError = { message: networkErr.message || String(networkErr), type: 'NetworkError' };
      if (attempts < maxAttempts) {
        const delayMs = backoffs[attempts - 1];
        console.log(`[WHATSAPP CLOUD] Backing off for ${delayMs}ms after network error...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  console.error('[WHATSAPP CLOUD] Failed after maximum attempts.');
  return { success: false, error: lastError || { message: 'Failed after maximum attempts' } };
}
