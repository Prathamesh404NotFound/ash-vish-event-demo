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
 *
 * Parameter order MUST match the approved template body (9 parameters):
 *   {{1}} Event title        {{2}} Attendee name     {{3}} Date
 *   {{4}} Time               {{5}} Venue             {{6}} Tier
 *   {{7}} Seat               {{8}} Ticket ref        {{9}} Pass URL
 */
export function getTicketMessageComponents(ticket: any) {
  const appUrl = (process.env.VITE_APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const slugId = ticket.passSlug?.id || '';
  const slugSig = ticket.passSlug?.sig || '';
  const passUrl = `${appUrl}/pass/${slugId}/${slugSig}`;

  const formattedDate = formatDateDDMMMMYYYY(ticket.date);
  const formattedTime = formatTime12h(ticket.time);

  return [
    { type: "text", text: ticket.eventTitle || '' },
    { type: "text", text: ticket.attendeeName || '' },
    { type: "text", text: formattedDate || '' },
    { type: "text", text: formattedTime || '' },
    { type: "text", text: `${ticket.venue || ''}, ${ticket.city || ''}` },
    { type: "text", text: ticket.tierName || ticket.tier || '' },
    { type: "text", text: ticket.seatInfo || `${ticket.tierName || ticket.tier || ''}, ${ticket.seat || 'General Floor'}` },
    { type: "text", text: ticket.ticketNumber || ticket.ref || '' },
    { type: "text", text: passUrl }
  ];
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

  const appUrl = (process.env.VITE_APP_URL || 'https://ashvishevents.com').replace(/\/+$/, '');
  const parameters = getTicketMessageComponents(ticket);
  const formattedDate = formatDateDDMMMMYYYY(ticket.date);
  const formattedTime = formatTime12h(ticket.time);
  const slugId = ticket.passSlug?.id || '';
  const slugSig = ticket.passSlug?.sig || '';
  const passUrl = `${appUrl}/pass/${slugId}/${slugSig}`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "template",
    template: {
      name: "ticket_confirmation_media",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: parameters
        }
      ]
    }
  };

  const mediaPayload = { ...payload, template: { ...payload.template } };
  (mediaPayload.template as any).components.unshift({
    type: "header",
    parameters: [{ type: "image", image: { link: `${appUrl}/og-image.jpg` } }]
  });

  // Primary text template (no image header): ticket_qr_pass — 9 parameters
  const qrPassPayload = { ...payload, template: { ...payload.template, name: "ticket_qr_pass" } };
  // Fallback text template (7 parameters): ticket_confirmation
  const fallbackPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "template",
    template: {
      name: "ticket_confirmation",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: ticket.attendeeName || '' },
            { type: "text", text: ticket.eventTitle || '' },
            { type: "text", text: formattedDate || '' },
            { type: "text", text: formattedTime || '' },
            { type: "text", text: `${ticket.venue || ''}, ${ticket.city || ''}` },
            { type: "text", text: ticket.ticketNumber || ticket.ref || '' },
            { type: "text", text: passUrl }
          ]
        }
      ]
    }
  };

  const url = `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`;
  const truncatedToken = truncateToken(token);

  let attempts = 0;
  let maxAttempts = 3;
  const backoffs = [1000, 3000, 9000];
  let lastError: any = null;

  // Send primary (media) payload first; fall back to text-only template on failure
  async function send(payloadToUse: typeof payload): Promise<{ ok: boolean; data: any; status: number }> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadToUse)
      });
      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      return { ok: response.ok, data: responseData, status: response.status };
    } catch (networkErr: any) {
      return { ok: false, data: { message: networkErr.message || String(networkErr), type: 'NetworkError' }, status: 0 };
    }
  }

  // Send order: ticket_qr_pass (new 9-var text body) first, then media
  // template, then old 7-var ticket_confirmation as final fallback
  const sendOrder: Array<{ payload: typeof payload; name: string }> = [
    { payload: qrPassPayload, name: 'ticket_qr_pass' },
    { payload: mediaPayload, name: 'ticket_confirmation_media' },
    { payload: fallbackPayload, name: 'ticket_confirmation' }
  ];
  let sendIndex = 0;
  while (sendIndex < sendOrder.length && attempts < maxAttempts) {
    attempts++;
    const { payload: currentPayload, name: templateName } = sendOrder[sendIndex];
    console.log(`[WHATSAPP CLOUD] Send attempt ${attempts}/${maxAttempts} to ${normalizedPhone} using template ${templateName} and token ${truncatedToken}`);

    try {
      const { ok, data: responseData, status } = await send(currentPayload);

      if (ok) {
        const waMessageId = responseData.messages?.[0]?.id;
        console.log(`[WHATSAPP CLOUD] Success on attempt ${attempts} with template ${templateName}. Message ID: ${waMessageId}`);
        return { success: true, waMessageId };
      }

      // Handle non-ok response
      const metaError = responseData.error || responseData;
      console.warn(`[WHATSAPP CLOUD] Received HTTP ${status} error response:`, JSON.stringify(metaError));

      // If this template is missing or has a bad parameter, try the next template in the order
      if (status === 400 || status === 500) {
        const errDetails = JSON.stringify(metaError);
        const isTemplateNotFound = errDetails.includes('132001') || errDetails.includes('template') || errDetails.includes('parameter') || errDetails.includes('Header');
        if (isTemplateNotFound) {
          const nextIndex = sendIndex + 1;
          if (nextIndex < sendOrder.length) {
            console.warn(`[WHATSAPP CLOUD] Falling back to next template ${sendOrder[nextIndex].name}...`);
          sendIndex = nextIndex;
          attempts = 0; // reset attempt counter for the new template
          maxAttempts = 3; // allow fresh retries with the new template
          continue;
          }
        }
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
