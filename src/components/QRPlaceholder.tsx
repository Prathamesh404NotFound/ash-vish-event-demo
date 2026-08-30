import React from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Ticket as TicketIcon } from 'lucide-react';

interface QRPlaceholderProps {
  value: string;
  size?: number;
  showScanLine?: boolean;
  showScreenHelp?: boolean;
  id?: string;
}

export const QRPlaceholder: React.FC<QRPlaceholderProps> = ({
  value,
  size = 220,
  showScanLine = false,
  showScreenHelp = false,
  id,
}) => {
  const qrValue = value || 'ASHVISH-EMPTY-TICKET';
  // Use the requested size directly — the parent controls the container.
  // Previously Math.max(220, size) forced QR to 220px minimum, causing
  // overflow when embedded in small containers (e.g. ticket card QR = 56px).
  const displaySize = Math.max(48, size);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex flex-col items-center justify-center bg-white rounded-xl shadow-xl overflow-hidden select-none border border-black/10"
        style={{ width: displaySize, height: displaySize, padding: Math.max(2, Math.round(displaySize * 0.08)) }}
      >
        <QRCodeSVG
          value={qrValue}
          size={displaySize - 32}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="H"
          includeMargin={true}
        />

        {/* Hidden High-Resolution Canvas for crisp and reliable PDF Generation */}
        <div style={{ display: 'none', width: 0, height: 0, overflow: 'hidden' }}>
          {id && (
            <QRCodeCanvas
              id={`qr-highres-canvas-${id}`}
              value={qrValue}
              size={1024}
              bgColor="#FFFFFF"
              fgColor="#000000"
              level="H"
              includeMargin={true}
            />
          )}
        </div>

        {/* Center Branding Logo Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-[#D4AF37] rounded shadow-md text-black font-extrabold flex items-center border border-white"
            style={{ padding: Math.max(1, Math.round(displaySize * 0.02)) }}>
            <TicketIcon style={{ width: Math.max(8, Math.round(displaySize * 0.06)), height: Math.max(8, Math.round(displaySize * 0.06)) }} strokeWidth={2.5} />
          </div>
        </div>

        {/* Animated Laser Scan Line */}
        {showScanLine && (
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent shadow-[0_0_12px_#D4AF37] animate-[bounce_2s_infinite] top-1/2" />
        )}
      </div>

      {showScreenHelp && (
        <p className="text-[11px] text-gray-400 mt-2 text-center max-w-xs leading-tight">
          Having trouble? Lower your screen brightness to ~80% and turn your phone slightly.
        </p>
      )}
    </div>
  );
};
