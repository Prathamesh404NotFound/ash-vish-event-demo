<div align="center">

  # 🎟️ ASH-VISH EVENTS

  ### *Premier Event Management & Digital Ticketing Platform*

  [![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
  [![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
  [![Firebase](https://img.shields.io/badge/Firebase_RTDB-10.13-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)

  **[Live Demo](https://ashvishevents.com)** · **[Report Bug](https://github.com/Prathamesh404NotFound/ash-vish-event-demo/issues)** · **[Request Feature](https://github.com/Prathamesh404NotFound/ash-vish-event-demo/issues)**

</div>

---

## 🌟 Overview

**Ash-vish Events** is a full-stack, enterprise-grade event management and online ticket booking platform built specifically for live concerts, musical nights, theatrical performances, sports tournaments, corporate summits, and weddings across **Kolhapur, Maharashtra, and India**.

Engineered with a modern React SPA frontend, an Express server backend, and real-time Firebase synchronization, Ash-vish Events powers every stage of event operations—from interactive seat selection and secure Razorpay payment processing to HMAC-signed QR digital passes and automated WhatsApp ticket delivery.

---

## ✨ Key Features

### 🎟️ Customer Experience & Booking
- **Interactive Visual Seat Maps**: Real-time seat layouts supporting VIP, Gold, and Silver tiers with dynamic pricing, seat locks, and contiguous family/group seat selection algorithms.
- **Cryptographic Digital QR Passes**: Unique 32-character HMAC-SHA256 signed pass slugs (`/pass/:slug/:signature`) rendered on a cinematic, dark-themed ticket pass interface.
- **Automated WhatsApp Pass Dispatch**: One-click ticket delivery directly to attendees' WhatsApp mobile numbers with clean, unguessable pass links.
- **Multi-Gateway Payment Flow**: Razorpay integration supporting UPI, Credit/Debit cards, Net Banking, and Wallet payments with server-side signature verification.

### 👥 Role-Based Access Control (RBAC)
- **Super Admin Dashboard**: Full system telemetry, revenue breakdown, ticket sales graphs, user role assignment, and system settings.
- **Organizer Studio**: Event management suite with tiered pricing builder, seating layout setup, coupon codes, and real-time sales telemetry.
- **Counter Staff / Walk-In Panel**: Specialized POS station for rapid walk-in bookings, cash/offline UPI collections, and shift closing reports.
- **Gate Staff & QR Scanner**: Built-in camera scanner with real-time gate validation, anti-passback security, and instant duplicate pass detection.

### 🌐 Advanced SEO & Content Engine
- **Geographic City Landing Pages**: Dedicated local SEO pages targeting `/kolhapur`, `/maharashtra`, `/india`, `/pune`, and `/mumbai`.
- **Editorial Blog Engine**: Rich informational content engine (`/blog`) pre-loaded with guides on event management, wedding checklists, and corporate event planning.
- **Structured Data Schemas**: Dynamic JSON-LD injection supporting `Organization`, `LocalBusiness`, `Event`, `FAQPage`, and `BlogPosting` schemas for maximum search engine visibility.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | High-performance Single Page Application (SPA) |
| **Styling** | Tailwind CSS, Framer Motion, Lucide Icons | Responsive UI with smooth micro-interactions |
| **Backend** | Node.js, Express.js | Full-stack API proxy, authentication, and pass verification |
| **Database** | Firebase Realtime Database & Firestore | Real-time seat locking, user auth, and ticket persistence |
| **Payments** | Razorpay Node.js SDK | Secure online payment collection with HMAC webhooks |
| **Pass Security** | Node.js Crypto (HMAC-SHA256) | Unguessable 32-hex pass slugs and signature generation |
| **Ticketing** | `qrcode.react`, `jspdf` | QR code rendering and downloadable PDF ticket passes |

---

## 📁 Repository Structure

```
ash-vish-event-demo/
├── api/                   # Serverless Vercel function adapters
├── public/                # Favicons, SEO assets, manifest.json, sitemap.xml, robots.txt
├── src/
│   ├── components/        # Reusable UI components (Navbar, SeatMap, QRScanner, etc.)
│   ├── contexts/          # React Contexts (AuthContext, BookingContext)
│   ├── data/              # Static blog posts, city data, and event presets
│   ├── hooks/             # Custom React hooks (useSEO, useRazorpay, useRoleAuth)
│   ├── lib/               # Firebase setup, API clients, seat algorithms, UPI helpers
│   ├── pages/             # App pages (Home, EventDetail, TicketPassPage, CityPage, etc.)
│   │   ├── admin/         # Super Admin management screens
│   │   └── counter/       # POS Walk-In and Counter Staff screens
│   ├── utils/             # Formatters, PDF generator, WhatsApp message builders, structured data
│   ├── App.tsx            # Main application router and layout guards
│   ├── main.tsx           # React entry point with legacy hash redirect handler
│   └── types.ts           # Global TypeScript type declarations
├── server.ts              # Express.js backend server
├── vite.config.ts         # Vite build configuration
├── package.json           # Application dependencies and scripts
└── README.md              # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js 18.x or higher
- npm or bun package manager

### 2. Installation
Clone the repository and install all dependencies:
```bash
git clone https://github.com/Prathamesh404NotFound/ash-vish-event-demo.git
cd ash-vish-event-demo
npm install
```

### 3. Environment Setup
Create a `.env` file in the project root (refer to `.env.example`):
```env
# Server & Client Domain Configuration
VITE_APP_URL=https://ashvishevents.com
APP_URL=https://ashvishevents.com

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com

# HMAC & Server Secrets
# Generate with: openssl rand -hex 32
SERVER_HMAC_SECRET=your_new_64_hex_character_secret
# Keep the old value here temporarily during a rotation.
SERVER_HMAC_SECRET_PREVIOUS=your_previous_secret_during_migration

# Razorpay Credentials (Test or Live)
VITE_RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### 4. Running Development Server
Start the Express + Vite unified development environment:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Production Build
Compile the frontend assets and bundle the server:
```bash
npm run build
npm start
```

---

## 🔒 Security & Pass Verification Architecture

Every ticket issued by Ash-vish Events is secured using cryptographic HMAC signatures:

```
[Booking Finalized] ──> Generate 32-Hex Slug (crypto.randomBytes(16))
                             │
                             ├──> Compute HMAC-SHA256(Slug + TicketId, Secret)
                             │
                             └──> Public Link: https://ashvishevents.com/pass/<slug>/<signature>
```

When an attendee opens the link:
1. `GET /api/passes/:slug/:signature` verifies the 32-hex slug format and 16-hex HMAC signature. During a planned rotation, verification accepts both `SERVER_HMAC_SECRET` and `SERVER_HMAC_SECRET_PREVIOUS`, while all newly generated signatures use only the active secret.
2. The server queries the database index without exposing internal ticket or payment IDs.
3. If valid, the ticket payload returns for rendering; if already scanned at the gate, an **"ALREADY USED — Entry Completed"** banner is overlaid.

### HMAC Secret Rotation

To rotate the secret safely, generate a new 32-byte random value, set it as `SERVER_HMAC_SECRET`, and move the current value to `SERVER_HMAC_SECRET_PREVIOUS`. Deploy and verify that old QR codes and pass links still work. If the previous secret is unavailable, the server can validate an already-issued credential only when its complete value exactly matches the canonical credential stored with that ticket; this supports no-resend recovery without allowing forged values. After the old tickets and counter PINs are no longer needed, remove `SERVER_HMAC_SECRET_PREVIOUS` and deploy again. Never commit either secret to the repository or expose it through frontend environment variables.

---

## 📄 License & Credits

Designed and developed by **Ash-vish Events Tech Team**. All rights reserved.

- **Author**: Prathamesh Jadhav ([@Prathamesh404NotFound](https://github.com/Prathamesh404NotFound))
- **Website**: [https://ashvishevents.com](https://ashvishevents.com)
