# Full Viewport & Device Responsive Audit — Ash-Vish Events
**Date**: August 18, 2026
**Scope**: Public Customer site, Checkout, Account, Organizer, Admin Panel, and Counter POS panel across 320px, 375px, 768px, 1024px, and 1440px viewports.

---

## 1. Executive Summary
This audit validates complete viewport responsiveness across all areas of Ash-Vish Events, including the previously unverified Admin and Counter staff POS panels. All pages maintain the luxury gold-and-black branding (`--bg-main`, `--accent`, `--gold-primary`) while adhering to strict mobile-first and tablet-first breakpoints.

---

## 2. Breakpoint Validation Matrix

| Area / Route | 320px (Compact Mobile) | 768px (Tablet Portrait) | 1024px (Laptop) | 1440px+ (Wide Desktop) | Status |
|---|---|---|---|---|---|
| **Public Home (`/`)** | Single column cards, horizontal category chips | 2-col event grid | 3-col grid, persistent nav | Centered max-w-7xl, 4-col bento | **PASS** |
| **Event Detail (`/event/:id`)** | Stacked image, stacked ticketing & perks sidebar | 2-col hero / ticketing split | Sticky booking card | Full widescreen layout | **PASS** |
| **Checkout Wizard (`/checkout`)** | 5-step progress wrap, single column | Single column padded | Side-by-side summary | 2-col secure checkout | **PASS** |
| **Seat Map (`/checkout/seats`)** | Horizontal scroll container with visual affordance, min 44px targets | Zoomable stage | Full seat selector | Centered wide theater layout | **PASS** |
| **My Tickets & Profile** | Stacked pass cards, vertical form layout | 2-col pass view | Grid ticket cards | Multi-column account layout | **PASS** |
| **Admin Dashboard & Events (`/admin/*`)** | Card-view / horizontal scroll container (`.responsive-table-scroll`) for tables | Responsive grid panels | Persistent sidebar, fluid tables | Full-width admin workspace | **PASS** |
| **Counter POS (`/counter/*`)** | Tablet portrait optimized (one-handed sale flow) | Tablet landscape optimized (Walk-in & cashier POS) | Desktop counter view | Expanded POS terminal | **PASS** |

---

## 3. Key Responsive & Accessibility Fixes Implemented
1. **Safe Area Insets (`viewport-fit=cover`)**: Added `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)` to all fixed navigation bars and bottom action buttons to prevent content clipping behind phone notches or iOS home gesture bars.
2. **iOS Auto-Zoom Prevention**: Enforced `font-size: 16px` on mobile inputs, selects, and textareas (`max-width: 639px`) to prevent Safari from auto-zooming on focus.
3. **Touch Targets**: Ensured all buttons, category chips, and table action triggers meet the ≥44×44px touch-target standard on touchscreens.
4. **Table Strategies**: Wrapped all raw `<table>` elements in `.responsive-table-scroll` horizontal scroll containers with touch momentum scrolling (`-webkit-overflow-scrolling: touch`) and sticky row identifiers.
5. **View Height Stability**: Replaced rigid `vh` heights with `100dvh` where appropriate to prevent layout jitter when mobile browser chrome toolbars collapse/expand.
