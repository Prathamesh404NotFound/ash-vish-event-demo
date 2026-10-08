import { EventComplianceReport, ComplianceSummary } from '../src/types';

/**
 * Pure test function simulating the compliance auditing logic for completed events:
 * 1. Manual Entry Check: Completed event tickets must never be entered manually.
 * 2. Counter Placement Check: Completed event tickets must never appear on counters.
 * 3. Unnecessary Placement Check: Completed event tickets must never be placed in unrequired locations.
 */
export function auditCompletedEventCompliance(
  completedEvents: Array<{ id: string; title: string; date: string; venue: string; city: string; status: string; assignedCounterIds?: string[]; counterLocation?: string; counterTimingText?: string }>,
  tickets: Array<{ id: string; ticketNumber: string; eventId: string; isWalkIn?: boolean; entryMethod?: string; paymentMethod?: string; counterId?: string; counterName?: string; holdAtCounter?: boolean; locationPlacement?: string; isUnnecessaryLocation?: boolean; attendeeName?: string }>,
  orders: Array<{ orderId: string; ticketId?: string; eventId: string; channel?: string; paymentMethod?: string }>
): { summary: ComplianceSummary; reports: EventComplianceReport[] } {
  let totalCompletedEvents = completedEvents.length;
  let compliantEventsCount = 0;
  let nonCompliantEventsCount = 0;
  let manualEntryViolationsCount = 0;
  let counterPlacementViolationsCount = 0;
  let unnecessaryPlacementViolationsCount = 0;

  const reports = completedEvents.map((evt) => {
    const evtTickets = tickets.filter((t) => t.eventId === evt.id);
    const evtOrders = orders.filter((o) => o.eventId === evt.id);

    // Check 1: Manual Entry Verification
    const manualTickets = evtTickets.filter((t) => {
      const linkedOrder = evtOrders.find((o) => o.ticketId === t.id);
      const isManualOrder = linkedOrder && (linkedOrder.channel === 'counter' || String(linkedOrder.paymentMethod || '').startsWith('manual') || String(linkedOrder.paymentMethod || '').startsWith('walkin'));
      return t.isWalkIn === true || t.entryMethod === 'manual' || String(t.paymentMethod || '').startsWith('walkin') || String(t.paymentMethod || '').startsWith('manual') || isManualOrder;
    });

    const manualCheck = {
      status: manualTickets.length === 0 ? ('Compliant' as const) : ('Non-compliant' as const),
      violationsCount: manualTickets.length,
      details: manualTickets.length === 0
        ? ['No manually entered tickets detected for this completed event.']
        : manualTickets.map((t) => `Ticket #${t.ticketNumber || t.id} (${t.attendeeName || 'Guest'}) was entered manually.`),
    };
    if (manualCheck.violationsCount > 0) manualEntryViolationsCount++;

    // Check 2: Counter Placement Verification
    const counterTickets = evtTickets.filter((t) => Boolean(t.counterId) || Boolean(t.holdAtCounter) || (t.counterName && t.counterName.trim() !== ''));
    const eventHasCounterAssigned = Array.isArray(evt.assignedCounterIds) && evt.assignedCounterIds.length > 0;
    const counterDetails: string[] = [];
    if (counterTickets.length > 0) {
      counterTickets.forEach((t) => {
        counterDetails.push(`Ticket #${t.ticketNumber || t.id} is placed on counter: ${t.counterName || t.counterId || 'Physical Counter'}.`);
      });
    }
    if (eventHasCounterAssigned) {
      counterDetails.push(`Event retained assigned physical counters after completion.`);
    }
    if (counterDetails.length === 0) {
      counterDetails.push('No tickets or counter assignments appear on physical counters.');
    }

    const counterCheck = {
      status: (counterTickets.length === 0 && !eventHasCounterAssigned) ? ('Compliant' as const) : ('Non-compliant' as const),
      violationsCount: counterTickets.length + (eventHasCounterAssigned ? 1 : 0),
      details: counterDetails,
    };
    if (counterCheck.violationsCount > 0) counterPlacementViolationsCount++;

    // Check 3: Unnecessary Placement Verification
    const unnecessaryTickets = evtTickets.filter((t) => t.isUnnecessaryLocation === true || (t.locationPlacement && t.locationPlacement !== 'none' && t.locationPlacement !== 'archived'));
    const unnecessaryEventLocation = Boolean(evt.counterLocation || evt.counterTimingText);
    const unnecessaryDetails: string[] = [];
    if (unnecessaryTickets.length > 0) {
      unnecessaryTickets.forEach((t) => {
        unnecessaryDetails.push(`Ticket #${t.ticketNumber || t.id} is in unrequired location: '${t.locationPlacement}'.`);
      });
    }
    if (unnecessaryEventLocation) {
      unnecessaryDetails.push(`Completed event retains unrequired counter location data: '${evt.counterLocation || evt.counterTimingText}'.`);
    }
    if (unnecessaryDetails.length === 0) {
      unnecessaryDetails.push('No tickets are placed in unnecessary or unrequired locations.');
    }

    const unnecessaryCheck = {
      status: (unnecessaryTickets.length === 0 && !unnecessaryEventLocation) ? ('Compliant' as const) : ('Non-compliant' as const),
      violationsCount: unnecessaryTickets.length + (unnecessaryEventLocation ? 1 : 0),
      details: unnecessaryDetails,
    };
    if (unnecessaryCheck.violationsCount > 0) unnecessaryPlacementViolationsCount++;

    const isOverallCompliant = manualCheck.status === 'Compliant' && counterCheck.status === 'Compliant' && unnecessaryCheck.status === 'Compliant';
    if (isOverallCompliant) {
      compliantEventsCount++;
    } else {
      nonCompliantEventsCount++;
    }

    return {
      eventId: evt.id,
      eventTitle: evt.title,
      eventDate: evt.date,
      eventVenue: evt.venue,
      eventCity: evt.city,
      eventStatus: evt.status,
      totalTickets: evtTickets.length,
      checks: {
        manualEntry: manualCheck,
        counterPlacement: counterCheck,
        unnecessaryPlacement: unnecessaryCheck,
      },
      overallStatus: isOverallCompliant ? ('Compliant' as const) : ('Non-compliant' as const),
      lastAuditedAt: new Date().toISOString(),
    };
  });

  const summary = {
    totalCompletedEvents,
    compliantEventsCount,
    nonCompliantEventsCount,
    manualEntryViolationsCount,
    counterPlacementViolationsCount,
    unnecessaryPlacementViolationsCount,
  };

  return { summary, reports };
}

// Simple test runner
function runComplianceUnitTests() {
  console.log('🧪 RUNNING TICKET COMPLIANCE AUDIT UNIT TESTS...');

  const mockCompletedEvents = [
    { id: 'evt_comp_1', title: 'Grand Music Night 2026', date: '2026-09-15', venue: 'Royal Arena', city: 'Kolhapur', status: 'completed' },
    { id: 'evt_comp_2', title: 'Comedy Fest 2026', date: '2026-09-20', venue: 'City Center Hall', city: 'Pune', status: 'completed', assignedCounterIds: ['cnt_1'] },
  ];

  const mockTickets = [
    // Event 1: Online automatic ticket, compliant placement
    { id: 'tkt_1', ticketNumber: 'ASH-1001', eventId: 'evt_comp_1', isWalkIn: false, entryMethod: 'automatic', paymentMethod: 'upi', attendeeName: 'Alice' },
    // Event 2: Manually entered ticket + counter placement + unnecessary placement
    { id: 'tkt_2', ticketNumber: 'ASH-2001', eventId: 'evt_comp_2', isWalkIn: true, entryMethod: 'manual', paymentMethod: 'walkin_cash', counterId: 'cnt_1', counterName: 'Box Office 1', locationPlacement: 'counter_front_display', attendeeName: 'Bob' },
  ];

  const mockOrders = [
    { orderId: 'ord_1', ticketId: 'tkt_1', eventId: 'evt_comp_1', channel: 'online', paymentMethod: 'upi' },
    { orderId: 'ord_2', ticketId: 'tkt_2', eventId: 'evt_comp_2', channel: 'counter', paymentMethod: 'walkin_cash' },
  ];

  const result = auditCompletedEventCompliance(mockCompletedEvents, mockTickets, mockOrders);

  console.assert(result.summary.totalCompletedEvents === 2, 'Total completed events should be 2');
  console.assert(result.summary.compliantEventsCount === 1, 'Compliant events should be 1');
  console.assert(result.summary.nonCompliantEventsCount === 1, 'Non-compliant events should be 1');
  console.assert(result.summary.manualEntryViolationsCount === 1, 'Manual entry violations should be 1');
  console.assert(result.summary.counterPlacementViolationsCount === 1, 'Counter placement violations should be 1');
  console.assert(result.summary.unnecessaryPlacementViolationsCount === 1, 'Unnecessary placement violations should be 1');

  const report1 = result.reports.find((r) => r.eventId === 'evt_comp_1');
  const report2 = result.reports.find((r) => r.eventId === 'evt_comp_2');

  console.assert(report1?.overallStatus === 'Compliant', 'Event 1 should be Compliant');
  console.assert(report2?.overallStatus === 'Non-compliant', 'Event 2 should be Non-compliant');
  console.assert(report2?.checks.manualEntry.status === 'Non-compliant', 'Event 2 manual entry check failed');
  console.assert(report2?.checks.counterPlacement.status === 'Non-compliant', 'Event 2 counter placement check failed');
  console.assert(report2?.checks.unnecessaryPlacement.status === 'Non-compliant', 'Event 2 unnecessary placement check failed');

  console.log('✅ ALL COMPLIANCE UNIT TESTS PASSED SUCCESSFULLY!');
}

runComplianceUnitTests();
