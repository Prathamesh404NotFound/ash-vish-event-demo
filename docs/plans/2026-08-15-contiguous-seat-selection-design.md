# Contiguous Multi-Seat Selection Design

The chosen approach is a small pure selection helper consumed by the existing `SeatMap` component. This keeps seat availability and atomic hold ownership in their current places: the live projection remains display authority, and the checkout continues to create or adjust the reservation only when the buyer proceeds. No seat-map schema or API contract changes are required.

Three implementation directions were considered. Free-form client selection with a warning is insufficient because it still permits unsellable singleton gaps. A server-enforced adjacency rule would duplicate availability logic, add round trips to an interaction that already has live client-side availability, and worsen perceived responsiveness. The selected pure-helper approach validates an anchor against the current row, gives deterministic window selection, and is straightforward to test independently.

For multi-ticket quantities, the helper treats an aisle as a row boundary, finds the available run containing the clicked anchor, and evaluates every group-sized window that includes it. It first minimizes singleton pockets on either side, then keeps the anchor close to the selected block’s centre, then chooses the block closest to the row centre. A selected seat clears the entire group. Choosing another available anchor replaces the temporary local group in one state update. Single-ticket selection retains the existing one-seat click behavior.

The component precomputes invalid anchors for visual disabling. If real-time availability invalidates one seat in a multi-seat block, it clears the entire temporary selection rather than leaving a partial group. The regression script covers exact fits, larger runs on both and one side, rejected anchors, single tickets, aisle boundaries, and whole-block deselection.

Local interactive browser validation could not continue because the sandbox browser navigated away from the local page after a storage-access security error. The deterministic regression script, TypeScript check, and production build remain the validation basis for this change; a production visual check will follow after deployment.
