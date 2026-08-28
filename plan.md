# PhonePe Payment Gateway Implementation Plan

This document describes the implementation details for migrating Ash-Vish Events exclusively to PhonePe Payment Gateway and removing all legacy payment gateways (Razorpay).

## Credentials
- **Client ID**: `M22GIH1IAD6YJ_2608200104`
- **Client Secret**: `NzY1ZDBlM2EtNzk3MC00MWRlLTk2MTQtMGQ1M2I5N2Q5ZmNl`
- **Environment**: `production`

## Architecture & Flow
1. **Backend Service (`src/lib/payment/phonepe.ts`)**:
   - PhonePe OAuth token authentication (`/apis/identity-manager/v1/oauth/token`) with token caching.
   - Hosted Checkout order creation (`/apis/pg/checkout/v2/pay`).
   - Transaction status check and amount reconciliation (`/apis/pg/checkout/v2/order/{merchantOrderId}/status`).
   - Server-side safety net refunds (`/apis/pg/payments/v2/refund`).
   - Webhook validation.
2. **Server API (`server.ts`)**:
   - `POST /api/phonepe/create-order`
   - `POST /api/phonepe/verify-payment`
   - `POST /api/phonepe/webhook`
3. **Frontend Integration (`src/hooks/usePhonePe.ts`, `src/pages/CheckoutWizard.tsx`, `src/pages/PaymentCallbackPage.tsx`)**:
   - Secure checkout initiation with hold keepalive.
   - Seamless redirect to PhonePe standard pay page.
   - Dedicated return callback handler with verification, ticket confirmation, and ticket download/view.
4. **Cleanup**:
   - Remove Razorpay SDK and all references across `.env`, `.env.example`, `package.json`, `TermsPage.tsx`, and tests.
