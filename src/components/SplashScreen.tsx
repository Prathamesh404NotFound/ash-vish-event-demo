import React, { useState, useEffect } from 'react';

/**
 * SplashScreen — renders a branded loading screen while the app initializes.
 * Fades out gracefully after a minimum display time + app readiness.
 */
export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Minimum display time 600ms, then fade
    const minTimer = setTimeout(() => {
      setFading(true);
      // After fade animation completes, remove from DOM
      const removeTimer = setTimeout(() => {
        setVisible(false);
        onComplete();
      }, 200);
      return () => clearTimeout(removeTimer);
    }, 300);

    return () => clearTimeout(minTimer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070707] transition-opacity duration-200 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#D4AF37]/[0.04] rounded-full blur-[120px]" />
      </div>

      {/* Logo */}
      <div className="relative mb-6">
        <div className="absolute -inset-3 bg-gradient-to-r from-[#F3E5AB]/10 via-[#D4AF37]/10 to-[#C5A059]/10 rounded-2xl blur-lg animate-pulse" />
        <div className="relative w-20 h-20 rounded-2xl bg-[#141417] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center">
          <img
            src="/ashvish-logo.png"
            alt="Ash-vish Events"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src.includes('ashvish-logo.png')) {
                target.src = '/favicon-192.png';
              }
            }}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Brand Name */}
      <h1 className="font-heading font-bold text-2xl text-white tracking-tight mb-1">
        Ash-vish <span className="text-[#D4AF37]">Events</span>
      </h1>
      <p className="text-xs text-gray-500 tracking-wider uppercase">Loading your experience</p>

      {/* Loading bar */}
      <div className="mt-8 w-32 h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#D4AF37]/50 to-[#D4AF37] rounded-full animate-[loadingBar_1.2s_ease-in-out_infinite]" />
      </div>

      <style>{`
        @keyframes loadingBar {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
};
