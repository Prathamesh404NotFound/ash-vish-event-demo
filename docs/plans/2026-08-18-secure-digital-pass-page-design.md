# Secure Digital Pass Page & Unguessable Pass Slug Architecture

**Date:** 18 August 2026  
**Status:** Implemented  

## Architecture Overview

To secure digital passes against enumeration, unauthorized access, and link tampering while maintaining instant gate validation:
1. **Unguessable Pass Slugs:** Each ticket issuance generates a 32-character random base64url `passId` and a 16-character HMAC-SHA256 signature (`passSig`) bound to `passId|ticketId`.
2. **Server-Side Opaque Mapping:** Pass IDs map to ticket IDs via a protected RTDB node (`passes/{passId}`). Client direct reads are blocked (`.read: false`).
3. **Secure API Endpoint (`GET /api/passes/:passId?sig=...`)**: Validates the cryptographic signature, enforces status rules (410 for cancelled, redeemed overlays), and returns only pass-safe display fields (omitting private owner details like email and phone).
4. **Dedicated Full-Screen View (`/pass/:passId`)**: A cinematic holographic pass rendered outside the main navigation layout with 60fps animations, QR pass display, and action tools (WhatsApp sharing, PNG download, print).
5. **WhatsApp Message Formatting**: Clean Markdown template linking directly to the secure pass URL instead of raw signed tokens.
