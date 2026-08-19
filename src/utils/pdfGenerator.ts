import { Ticket, EventItem } from '../types';

export const generateTicketPDF = async (
  ticket: Ticket,
  event?: EventItem,
  signedToken?: string
): Promise<void> => {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Color Palette
  const gold = [212, 175, 55]; // #D4AF37
  const darkBg = [18, 18, 18]; // Sleek Dark Charcoal Background
  const cardBg = [24, 24, 24]; // Sleek Matte-black card background
  const containerBg = [31, 31, 31]; // Bento box container background
  const emerald = [16, 185, 129]; // Clean Success color

  // 1. Dark Canvas / Outer Background
  doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
  doc.rect(0, 0, 210, 297, 'F');

  // 2. Ticket Outer Matte-Black Box (x:15, y:15, w:180, h:267)
  doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
  doc.roundedRect(15, 15, 180, 267, 8, 8, 'F');

  // 3. Double-Pinstripe Luxury Gold Border
  // Outer Border Line
  doc.setDrawColor(153, 117, 30); // Dark gold
  doc.setLineWidth(0.4);
  doc.roundedRect(15, 15, 180, 267, 8, 8, 'D');

  // Inner Inset Border Line
  doc.setDrawColor(gold[0], gold[1], gold[2]); // Bright gold
  doc.setLineWidth(0.6);
  doc.roundedRect(16.5, 16.5, 177, 264, 7, 7, 'D');

  // 4. Header Luxury Branding Section
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ASH & VISH', 105, 29, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text('P R E M I U M   E V E N T S   P A S S', 105, 34, { align: 'center' });

  // Thin separator gold line below header branding
  doc.setDrawColor(gold[0], gold[1], gold[2]);
  doc.setLineWidth(0.3);
  doc.line(35, 38, 175, 38);

  // 5. High-Visibility seat category badge
  const categoryBadgeText = `${ticket.tierName.toUpperCase()} PASS`;
  const badgeWidth = categoryBadgeText.length * 2.4 + 8;
  const badgeX = 105 - badgeWidth / 2;
  const badgeY = 42;
  const badgeHeight = 9;

  // Draw Category Badge Rounded Rect
  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1.5, 1.5, 'F');

  // Text inside Category Badge
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(categoryBadgeText, 105, badgeY + 6.2, { align: 'center' });

  // 6. Large Elegant Event Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  const titleText = event?.title || ticket.eventTitle || 'Live Event';
  doc.text(titleText, 105, 64, { align: 'center' });

  // Venue Sub-branding line
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(gold[0], gold[1], gold[2]);
  const locationText = `${ticket.venue || event?.venue || 'Main Concert Hall'} • ${ticket.city || event?.city || 'Live'}`;
  doc.text(locationText, 105, 71, { align: 'center' });

  // 7. Tear-off Ticket Detachable Stub Cutline (y: 78)
  doc.setDrawColor(gold[0], gold[1], gold[2]);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([2.5, 3], 0); // Dotted line effect
  doc.line(16.5, 78, 193.5, 78);
  doc.setLineDashPattern([], 0); // Reset dash style

  // Muted stub guidelines label
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text('DETACHABLE ENTRY STUB (SCAN AND REDEEM AT GATE)', 105, 77, { align: 'center' });

  // 8. Grid Details - Organized Bento-Style Containers (y: 84 to 148)
  // Left Box Container - Attendee Details
  doc.setFillColor(containerBg[0], containerBg[1], containerBg[2]);
  doc.roundedRect(23, 84, 78, 62, 3, 3, 'F');
  doc.setDrawColor(55, 55, 55);
  doc.setLineWidth(0.3);
  doc.roundedRect(23, 84, 78, 62, 3, 3, 'D');

  // Left Box Banner Heading
  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.rect(23, 84, 78, 6.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PASSENGER / ATTENDEE', 62, 88.5, { align: 'center' });

  // Left Box Information Fields
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ATTENDEE NAME', 28, 97);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(ticket.attendeeName, 28, 101.5);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('CONTACT PHONE', 28, 110.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(ticket.attendeePhone || 'N/A', 28, 115);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('EMAIL ADDRESS', 28, 124);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text(ticket.attendeeEmail || 'N/A', 28, 128.5);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PASS CATEGORY', 28, 137.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(ticket.tierName.toUpperCase(), 28, 142);

  // Right Box Container - Event Details
  doc.setFillColor(containerBg[0], containerBg[1], containerBg[2]);
  doc.roundedRect(109, 84, 78, 62, 3, 3, 'F');
  doc.setDrawColor(55, 55, 55);
  doc.setLineWidth(0.3);
  doc.roundedRect(109, 84, 78, 62, 3, 3, 'D');

  // Right Box Banner Heading
  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.rect(109, 84, 78, 6.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('EVENT SCHEDULE & SEAT', 148, 88.5, { align: 'center' });

  // Right Box Information Fields
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('DATE & TIME', 114, 97);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${ticket.date} @ ${ticket.time}`, 114, 101.5);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('SEAT NUMBER', 114, 110.5);
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(ticket.seatNumber, 114, 115);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TICKET SERIAL NO.', 114, 124);
  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text(ticket.ticketNumber, 114, 128.5);

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('TOTAL AMOUNT PAID', 114, 137.5);
  doc.setTextColor(emerald[0], emerald[1], emerald[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`INR ${ticket.totalPaid}`, 114, 142);

  // 9. Luxurious Security QR Code Container Portal Box (y: 152 to 240)
  doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
  doc.roundedRect(23, 152, 164, 88, 5, 5, 'F');
  doc.setDrawColor(55, 55, 55);
  doc.setLineWidth(0.4);
  doc.roundedRect(23, 152, 164, 88, 5, 5, 'D');

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DIGITAL SIGNATURE & GATEPASS SCANNER', 105, 162, { align: 'center' });

  // Viewfinder Corner target effect around QR Code
  // QR Position: x=80, y=168, size=50 (>= 35mm requirement) with crisp pure white background box
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(76, 164, 58, 58, 2, 2, 'F');

  doc.setDrawColor(gold[0], gold[1], gold[2]);
  doc.setLineWidth(1.2);
  // Top-left
  doc.line(74, 162, 80, 162);
  doc.line(74, 162, 74, 168);
  // Top-right
  doc.line(136, 162, 130, 162);
  doc.line(136, 162, 136, 168);
  // Bottom-left
  doc.line(74, 224, 80, 224);
  doc.line(74, 224, 74, 218);
  // Bottom-right
  doc.line(136, 224, 130, 224);
  doc.line(136, 224, 136, 218);

  // Render the crisp high-resolution QR image
  try {
    const qrCanvas = document.getElementById(`qr-highres-canvas-${ticket.id}`) as HTMLCanvasElement;
    if (qrCanvas) {
      const dataUrl = qrCanvas.toDataURL('image/png', 1.0);
      doc.addImage(dataUrl, 'PNG', 80, 168, 50, 50, undefined, 'FAST');
    } else {
      // Fallback selector
      const fallbackCanvas = document.querySelector(`#qr-canvas-${ticket.id} canvas`) as HTMLCanvasElement;
      if (fallbackCanvas) {
        const dataUrl = fallbackCanvas.toDataURL('image/png', 1.0);
        doc.addImage(dataUrl, 'PNG', 80, 168, 50, 50, undefined, 'FAST');
      } else {
        // Draw elegant high-contrast placeholder
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(80, 168, 50, 50, 3, 3, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('QR CODE SECURED', 105, 190, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text('SCAN AT THE VENUE', 105, 196, { align: 'center' });
        doc.setFontSize(5.5);
        doc.text(ticket.ticketNumber, 105, 202, { align: 'center' });
      }
    }
  } catch (e) {
    console.warn('PDF QR rendering failed, using placeholder:', e);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(80, 168, 50, 50, 3, 3, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text('SECURE QR PASS', 105, 193, { align: 'center' });
  }

  // Token String signature box inside QR portal
  doc.setFillColor(15, 15, 15);
  doc.rect(28, 224, 154, 11, 'F');

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(6.5);
  doc.setFont('courier', 'normal');
  const tokenDisplay = signedToken || `HMAC_SHA256_${ticket.id}_${ticket.qrCodeValue}`;
  doc.text(`SECURE AUTH-TOKEN: ${tokenDisplay.slice(0, 78)}...`, 105, 229, { align: 'center' });
  doc.text(`SIGNATURE HASH: ${tokenDisplay.slice(-40)}`, 105, 232.5, { align: 'center' });

  // 10. Terms & Security Regulations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text('TERMS OF ADMISSION & VENUE REGULATIONS:', 23, 248);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 180, 180);
  doc.text('• Gate closes 30 minutes prior to event start. Re-entry is strictly prohibited unless authorized.', 23, 253);
  doc.text('• Sharing duplicate prints or digital snapshots of this pass will trigger automatic ticket blacklisting.', 23, 258);
  doc.text('• A valid matching Photo ID must be presented upon entry for wristband exchange and seat allocation.', 23, 263);

  // 11. Luxury Gold Footer Band
  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.rect(15, 272, 180, 10, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('POWERED BY ASH & VISH TICKETING PROTOCOL • VERIFIED DIGITAL ACCESS • WWW.ASHVISHEVENTS.COM', 105, 278.5, { align: 'center' });

  // Save PDF Document
  doc.save(`Ticket_${ticket.ticketNumber}_${ticket.attendeeName.replace(/\s+/g, '_')}.pdf`);
};

