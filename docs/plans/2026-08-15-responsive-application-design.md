# Responsive Application Design

The responsive system preserves the application’s dark, gold-accented event experience while making its information hierarchy usable from a 320px-wide handset through wide desktop displays. The layout favors a single-column reading and action flow on compact devices, progressively adds paired fields and content columns on tablets, and retains the richer dashboard and event layouts from 1024px upward. No page may rely on viewport clipping for primary information or actions.

## Layout and Interaction Contract

| Device class | Viewport target | Layout behavior |
|---|---:|---|
| Compact mobile | 320–639px | One content column, bottom-safe padding, touch-sized actions, horizontally scrollable seat canvases and data tables. |
| Tablet | 640–1023px | Two-column forms where useful, compact horizontal navigation, and denser event/cards layouts without fixed sidebars. |
| Laptop | 1024–1439px | Persistent sidebars, multi-column content grids, and adjacent summaries when enough width is available. |
| Wide desktop | 1440px+ | Centered max-width content with comfortable gutters; tables and dashboards use available width without stretched text blocks. |

Shared customer navigation must retain both the header and mobile bottom bar without covering final actions. Administration and counter areas use a compact horizontal navigation strip on narrow devices and regain the persistent sidebar at large breakpoints. Tables receive explicit scroll containers and minimum readable widths; dialogs cap their height and scroll internally. The checkout progress strip can wrap, the attendee review cards become a single column on phones, and the seat map remains readable through a dedicated horizontal viewport rather than shrinking targets below a safe touch size.

## Verification Standard

Every public, checkout, account, organizer, administrator, and counter route will be checked at 375px, 768px, 1024px, and 1440px. The acceptance standard is no page-level horizontal overflow, no obscured fixed navigation, no inaccessible action button, readable table escape routes, and no seat or form control reduced below practical touch use.
