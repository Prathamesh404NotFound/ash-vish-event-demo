import React, { useState } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Ticket as TicketIcon } from 'lucide-react';

interface QRPlaceholderProps {
  value: string;
  size?: number;
  showScanLine?: boolean;
  showScreenHelp?: boolean;
  id?: string;
  /**
   * Optional sponsor logo URL. When provided, the logo is rendered as a
   * small badge overlay in the center of the QR code alongside the ticket
   * icon. The overlay occupies ≤ 12 % of the QR area — well within the
   * 30 % recovery budget of error-correction level H.
   */
  sponsorLogoUrl?: string;
}

export const QRPlaceholder: React.FC<QRPlaceholderProps> = ({
  value,
  size = 220,
  showScanLine = false,
  showScreenHelp = false,
  id,
  sponsorLogoUrl,
}) => {
  const qrValue = value || 'ASHVISH-EMPTY-TICKET';
  const displaySize = Math.max(48, size);

  // Track logo load error so we gracefully fall back to icon-only.
  const [logoError, setLogoError] = useState(false);

  // Badge dimensions — capped at ~12 % of QR area to preserve scannability.
  const badgeSize   = Math.max(8, Math.round(displaySize * 0.12));
  const iconSize    = Math.max(8, Math.round(displaySize * 0.06));
  const padding     = Math.max(1, Math.round(displaySize * 0.02));
  const logoSize    = Math.max(6, Math.round(badgeSize * 0.75));

  const showLogo = Boolean(sponsorLogoUrl) && !logoError;

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

        {/* Center Badge Overlay — ticket icon + optional sponsor logo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="bg-[#D4AF37] rounded shadow-md text-black font-extrabold flex items-center justify-center gap-0.5 border border-white"
            style={{ padding, minWidth: badgeSize, minHeight: badgeSize }}
          >
            {/* Ticket icon (always present) */}
            <TicketIcon
              style={{ width: iconSize, height: iconSize, flexShrink: 0 }}
              strokeWidth={2.5}
            />

            {/* Sponsor logo — only when a URL is supplied and loaded successfully */}
            {showLogo && (
              <img
                src={sponsorLogoUrl}
                alt="sponsor"
                onError={() => setLogoError(true)}
                style={{
                  width: logoSize,
                  height: logoSize,
                  objectFit: 'contain',
                  borderRadius: 2,
                  background: '#fff',
                  flexShrink: 0,
                }}
              />
            )}
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
