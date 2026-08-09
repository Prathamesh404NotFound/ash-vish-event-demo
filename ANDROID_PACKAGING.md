# Android TWA & Capacitor App Packaging Guide

This document outlines the packaging strategy, configuration, and build steps to package this React + Express ticket booking application as an installable Android APK connected to the shared Firebase backend and backend REST APIs.

---

## 1. Chosen Packaging Framework: Capacitor + Android WebView Shell
We chose **Capacitor (by Ionic)** combined with the **Android Native WebView Shell** because:
1. **Full Native Camera Access**: Essential for the live QR gate pass scanner (`html5-qrcode` & native camera permissions).
2. **Offline LocalStorage & Session Persistence**: Securely stores Firebase Auth tokens and user booking state across app restarts.
3. **Seamless API Proxying**: Connects directly to the same Firebase Realtime Database / Firestore and Node backend API routes (`/api/razorpay`, `/api/tickets/verify-and-redeem`).

---

## 2. Project Configuration (`capacitor.config.json`)

```json
{
  "appId": "com.ash.ticketapp.prod",
  "appName": "Ashoka Live Tickets",
  "webDir": "dist",
  "bundledWebRuntime": false,
  "server": {
    "url": "https://ais-dev-ic33ibe3lcgrjqy6qdkija-130685679103.asia-southeast1.run.app",
    "cleartext": true
  },
  "android": {
    "allowMixedContent": true,
    "webContentsDebuggingEnabled": true
  }
}
```

---

## 3. Android Manifest Permissions (`AndroidManifest.xml`)

Ensure required native permissions are declared for camera barcode scanning and network connectivity:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="true" />
```

---

## 4. Building the Signed Release APK

To build the signed release APK for deployment and testing on physical Android devices:

1. **Build the Web Bundle**:
   ```bash
   npm run build
   ```

2. **Initialize & Sync Capacitor Android Project**:
   ```bash
   npx cap init "Ashoka Live Tickets" com.ash.ticketapp.prod --web-dir dist
   npx cap add android
   npx cap sync android
   ```

3. **Generate Signed Release APK via Gradle**:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

4. **Locate Output APK**:
   The compiled signed release APK will be generated at:
   `android/app/build/outputs/apk/release/app-release.unsigned.apk` (or signed with your release keystore `app-release.apk`).

---

## 5. Verification Checklist in Android App
- **Authentication**: Firebase Auth login/signup works seamlessly with persistent login tokens.
- **Seat Selection**: Interactive hall seat map renders correctly and locks selected seats.
- **Payment Gateway**: Integrates Razorpay and Cashfree checkout flows.
- **QR Ticket Scanning**: Live camera scanner verifies signed HMAC-SHA256 tickets via `/api/tickets/verify-and-redeem` and displays instantaneous access validation feedback.
