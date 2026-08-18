import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className, size = 'md' }) => {
  const [imgSrc, setImgSrc] = useState<string>('/av-logo.png');
  const [hasFailedAll, setHasFailedAll] = useState<boolean>(false);

  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg text-xs',
    md: 'w-10 h-10 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-xl text-base',
  }[size];

  const handleError = () => {
    if (imgSrc === '/av-logo.png') {
      setImgSrc('/favicon-192.png');
    } else if (imgSrc === '/favicon-192.png') {
      setImgSrc('/favicon-512.png');
    } else {
      setHasFailedAll(true);
    }
  };

  if (hasFailedAll) {
    return (
      <div
        className={`${sizeClasses} bg-gradient-to-br from-[#F3E5AB] via-[#D4AF37] to-[#C5A059] text-black font-extrabold flex items-center justify-center shadow-lg shadow-[#D4AF37]/30 shrink-0 ${className || ''}`}
        aria-label="Ash-vish Events Logo"
      >
        AV
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt="Ash-vish Events Logo"
      loading="eager"
      decoding="async"
      onError={handleError}
      className={`${sizeClasses} object-cover shadow-lg shadow-[#D4AF37]/30 shrink-0 ${className || ''}`}
    />
  );
};

export default BrandLogo;
