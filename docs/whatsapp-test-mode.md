# Meta WhatsApp Cloud API — Test Mode Integration & Setup Guide

This guide details the step-by-step setup process for configuring the **WhatsApp Cloud API** in **Test Mode** (or live mode) for automatically dispatching digital ticket QR passes.

---

## ⚙️ Meta WhatsApp Business Portal Setup

Follow these exact steps in your Meta Developer and Business Manager accounts to configure your test numbers and message templates.

### 1. Retrieve API Credentials
1. Open the [Meta App Dashboard](https://developers.facebook.com/) and navigate to your App (or create a new Business App if you don't have one).
2. Go to **WhatsApp** in the left sidebar, and select **API Setup**.
3. Under the **API Setup** page, copy the following values:
   - **Phone Number ID**: Used as `WHATSAPP_PHONE_NUMBER_ID` in your environment variables.
   - **WhatsApp Business Account ID**: Used as `WHATSAPP_BIZ_ACCOUNT_ID`.
   - **Temporary Access Token**: Copy the active token shown at the top of the page. This is used as `WHATSAPP_API_TOKEN` (Note: Test tokens expire after 24 hours).

### 2. Verify Recipient Numbers (Required in Test Mode)
Because you are running in test mode, you can **only** send messages to numbers that have been explicitly whitelisted and verified:
1. On the same **API Setup** page, locate the **To** dropdown under the "Send and receive messages" section.
2. Click **Manage phone number list** or **Add recipient number**.
3. Add your mobile number (including country code, e.g., `91` for India) and verify it using the OTP code sent via SMS.
4. You can add up to 5 verified test recipient numbers for your staff/team during the test cycle.

### 3. Register the Message Template
1. Go to **WhatsApp Manager** (via the link in the API Setup page or Meta Business Suite).
2. Select **Account Tools** → **Message Templates** from the sidebar.
3. Click **Create Template** and configure it exactly as follows:
   - **Category**: `UTILITY`
   - **Name**: `ticket_confirmation` (must be lowercase with an underscore)
   - **Language**: `English (US)` (code: `en_US`)
4. Under the **Body Text**, paste the following text exactly (copy-paste is recommended):

```text
Hello {{1}}, your Ash-vish Events ticket for {{2}} is confirmed!

📅 {{3}} at {{4}}
📍 {{5}}
🔖 Ref: {{6}}

Open your QR pass here: {{7}}

Show this QR at the entrance gate for instant check-in. Thank you — see you at the show!
```

5. Click **Submit**. In test mode, template approvals are **instant**.

---

## 🌐 Environment Variables Configuration

To run the integration, add the following variables to your **Vercel Dashboard** (Settings → Environment Variables) for `Production` and `Preview` scopes, or your local `.env` file:

```env
# Enable test-mode WhatsApp Cloud API integration
WHATSAPP_TEST_MODE=true

# Temporary (or permanent System User) token copied from Meta API Setup
WHATSAPP_API_TOKEN=your_whatsapp_access_token_here

# The test phone number's ID from Meta API Setup
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here

# WhatsApp Business Account ID from Meta Manager
WHATSAPP_BIZ_ACCOUNT_ID=your_business_account_id_here
```

*Note: In local development, you must place these variables in your `.env` file (which is gitignored).*

---

## 🧪 Testing and Verification Endpoints

The system includes built-in test tools to verify your WhatsApp setup without buying a real ticket.

### 1. Self-Serve Delivery Test
You can trigger an immediate template message to any of your whitelisted numbers using the latest ticket issued in the system:
- **Endpoint**: `/api/whatsapp/test?phone=<number>`
- **Example**: `https://your-app-domain.com/api/whatsapp/test?phone=919876543210`
- **Behavior**: Returns `success: true` and the `waMessageId` if successful, or the detailed Meta JSON error object if it fails.

### 2. Status Audit Log
Inspect delivery history and view logged status codes (e.g. `sent` or `failed` with exact Meta failure reasons) for the last 10 messages:
- **Endpoint**: `/api/whatsapp/status`
- **Example**: `https://your-app-domain.com/api/whatsapp/status`

---

## 🔄 Transitioning to Production (Going Live)

When you are ready to send automatic messages to all customer phone numbers (outside the whitelist) with a permanent phone number:

1. **Verify your Phone Number**: In WhatsApp Manager under API Setup, register and verify your official, permanent business phone number.
2. **Submit Production Templates**: Submit the same `ticket_confirmation` template under your production number profile.
3. **Generate a System User Token**:
   - Go to Meta Business Settings → **System Users**.
   - Create or select a System User and click **Generate New Token**.
   - Select your App, check the `whatsapp_business_messaging` and `whatsapp_business_management` permissions, and generate a permanent token that never expires.
4. **Update Environment Variables in Vercel**:
   - Replace `WHATSAPP_API_TOKEN` with the permanent System User token.
   - Replace `WHATSAPP_PHONE_NUMBER_ID` with your permanent business number's ID.
   - Update `WHATSAPP_TEST_MODE` to `false`.
5. **No Code Changes Required**: The app immediately detects the mode shift and directs requests to production routes securely.

---

## ⚠️ Common Meta API Error Codes Reference

If a send fails, the API logs and records the exact Meta response code. Use this reference to troubleshoot:

- **`131047` (Recipient Not in Test List)**: The phone number you are trying to message hasn't been added and verified in the "Add recipient number" list under API Setup.
- **`131008` (Invalid Phone Format)**: Ensure the recipient phone number was entered correctly. The server automatically strips non-digits and prepends country code `91` if 10 digits are provided.
- **`131030` (Template Not Approved/Found)**: Verify that the template was created under the correct name (`ticket_confirmation`) and language (`en_US`).
- **`131051` (Business Profile Unverified)**: Required only in production. Complete your business verification in Meta Business Suite.
- **`190` / `1890272` (Invalid/Expired Token)**: Your temporary 24h Meta token has expired. Copy a new one from the Meta API Setup page and update your env variables.
