import React from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Ticket as TicketIcon } from 'lucide-react';

interface QRPlaceholderProps {
  value: string;
  size?: number;
  showScanLine?: boolean;
  id?: string;
}

export const QRPlaceholder: React.FC<QRPlaceholderProps> = ({ value, size = 180, showScanLine = false, id }) => {
  const qrValue = value || 'ASHVISH-EMPTY-TICKET';

  return (
    <div
      className="relative flex flex-col items-center justify-center p-3.5 bg-white rounded-2xl shadow-xl overflow-hidden select-none border border-black/10"
      style={{ width: size, height: size }}
    >
      <QRCodeSVG
        value={qrValue}
        size={size - 28}
        bgColor="#FFFFFF"
        fgColor="#000000"
        level="H"
        includeMargin={false}
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
        <div className="p-1 bg-[#D4AF37] rounded-md shadow-md text-black font-extrabold text-[10px] flex items-center gap-0.5 border border-white">
          <TicketIcon className="w-3 h-3 stroke-[2.5]" />
        </div>
      </div>

      {/* Animated Laser Scan Line */}
      {showScanLine && (
        <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent shadow-[0_0_12px_#D4AF37] animate-[bounce_2s_infinite] top-1/2" />
      )}
    </div>
  );
};
