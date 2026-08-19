# Gate Scanner State Machine & UX Flow

This document details the client-side state machine, visual & audio feedback loops, idempotent lockout, and developer modes implemented for the Ash-Vish Gate Pass Scanner (`src/components/TicketScanner.tsx`).

---

## 1. Scan State Machine (`ScanPhase`)

The scanner operates through an explicit, asynchronous state machine:

```
                  ┌──────────────────────┐
                  │         IDLE         │◄────────────────────────┐
                  └──────────┬───────────┘                         │
                             │ (QR Decoded / Manual Submit)        │
                             ▼                                     │
                  ┌──────────────────────┐                         │
                  │      VERIFYING       │                         │
                  └──────────┬───────────┘                         │
                             │                                     │
           ┌─────────────────┼──────────────────┐                  │
           │ (success: true) │ (alreadyRedeemed)│ (invalid/tamper) │ (offline/timeout)
           ▼                 ▼                  ▼                  ▼
     ┌───────────┐     ┌───────────┐      ┌───────────┐      ┌───────────┐
     │  ALLOWED  │     │ DUPLICATE │      │  DENIED   │      │NETWORK_ERR│
     └─────┬─────┘     └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
           │                 │                  │                  │
     [Auto-Clear]      [Auto-Clear]       [Manual Tap]       [Manual Tap]
      (3 seconds)       (3 seconds)        ("Dismiss")     ("Retry/Lookup")
           │                 │                  │                  │
           └─────────────────┴──────────────────┴──────────────────┘
```

### State Definitions

| Phase | Visual Surface | Audio Tone | Dismissal Policy | Description |
|---|---|---|---|---|
| `idle` | Neutral Dark Card with pulsing viewfinder & laser | Silent | Continuous | Camera is scanning at 30 FPS. Corner brackets and aiming guidance active. |
| `verifying` | Viewfinder Dark Overlay with loader & token preview | Silent | In flight | Network verification in flight with an 8-second timeout guard. Shows preview of scanned token. |
| `allowed` | Emerald (`#10B981`) Full Flash + Dominant `ADMITTED ✓` badge | 880 Hz High Chime (120ms) + 40ms vibration | **Auto-clears in 3s** | Gate admission granted. Large attendee name, tier, seat, and ticket number. |
| `duplicate` | Amber (`#F59E0B`) Full Flash + `ALREADY ADMITTED` banner | 440 Hz Warning Buzz (180ms) | **Auto-clears in 3s** | Pass was already admitted earlier. Details show which staff member checked it in and when. |
| `denied` | Red (`#EF4444`) Full Flash + `NOT VALID ✗` screen | 440 Hz Warning Buzz (180ms) | **Requires Explicit Dismiss Tap** | Tampered pass, invalid signature, or void status. Recommends opening live app. |
| `network_err` | Amber (`#F59E0B`) Warning screen with connection icon | 440 Hz Warning Buzz (180ms) | **Requires Explicit Action** | Server timeout (>8s) or offline network. Offers Retry or Manual Lookup. |

---

## 2. Asymmetric Dismissal Policy

To maximize gate throughput while upholding security:
- **Positive Outcomes (`ALLOWED`, `DUPLICATE`)**: Automatically reset after 3.0 seconds, returning the camera to active scan mode without any manual tap required.
- **Negative / Ambiguous Outcomes (`DENIED`, `NETWORK_ERR`)**: Strictly require an explicit user tap on **"Dismiss & Ready for Next"** to ensure staff take notice and do not accidentally admit unverified guests.

---

## 3. Idempotent Client-Side Lockout (3-Second Debounce)

When a QR code remains in front of the camera, `html5-qrcode` can emit decode callbacks up to 30 times per second.
The scanner caches `{ token, timestamp, result }` in a local `useRef`. If the same QR token is scanned within 3000ms:
- The redundant network redemption request is skipped completely.
- The UI immediately renders the cached result with a subtle **"Recently scanned"** indicator.
- This eliminates server lag and unnecessary RTDB transaction load.

---

## 4. Sensory Feedback (Web Audio API & Vibration)

- **Audio Engine**: Synthesized in-browser using Web Audio API oscillators (`AudioContext`). Zero external MP3/WAV assets required.
- **Speaker Toggle**: Gate staff can toggle audio beeps on or off via the speaker button in the header. The preference is stored in `localStorage` under `ash_scanner_sound_enabled`.
- **Haptic Vibration**: Uses `navigator.vibrate([40])` for physical confirmation on supported mobile devices.
- **Motion Accessibility**: All flash animations respect `prefers-reduced-motion: reduce`.

---

## 5. Result Wording & Typography Hierarchy

All developer jargon has been replaced with actionable gate-staff terminology:

- ❌ *Security Failure / HMAC-SHA256 Token Signature Invalid* → **"NOT VALID ✗"** ("This pass doesn't match our records. Ask the guest to open the live Ash-vish pass...")
- ❌ *Access Granted / TICKET REDEEMED* → **"ADMITTED ✓"** ("Let them in.")
- ❌ *Already Redeemed* → **"ALREADY ADMITTED"** ("Was checked in by {staff} at {time}.")
- ❌ *Could not resolve a valid ticket ID* → **"Pass not found. Check the guest opened the latest pass."**

---

## 6. Manual Guest Lookup Polish

- **Search Debounce**: 300ms input debouncing.
- **Result Capping**: Displays the top 10 matching records with a notification to refine queries if more results match.
- **Unified Redemption Flow**: Selecting "Admit Guest" from the manual list passes through the exact same state machine, triggering the corresponding audio chime, flash, and auto-reset.

---

## 7. Developer Test Mode

- Direct token simulators ("Valid Signed Pass", "Tampered Pass") and raw debug headers are hidden in production.
- Developer simulation buttons are gated behind either the `?dev=1` query parameter or `import.meta.env.DEV`.
