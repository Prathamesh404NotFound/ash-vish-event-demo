import React, { useState } from 'react';

/**
 * Deterministic palette — same name always gets the same color across renders
 * and page reloads. Designed for dark UIs: muted backgrounds, high-contrast text.
 */
const AVATAR_COLORS: { bg: string; text: string }[] = [
  { bg: '#7C3AED', text: '#EDE9FE' }, // violet
  { bg: '#0F766E', text: '#CCFBF1' }, // teal
  { bg: '#B45309', text: '#FEF3C7' }, // amber
  { bg: '#0369A1', text: '#E0F2FE' }, // sky
  { bg: '#BE185D', text: '#FCE7F3' }, // pink
  { bg: '#047857', text: '#D1FAE5' }, // emerald
  { bg: '#6D28D9', text: '#EDE9FE' }, // purple
  { bg: '#D97706', text: '#FEF3C7' }, // orange
  { bg: '#0E7490', text: '#CFFAFE' }, // cyan
  { bg: '#B91C1C', text: '#FEE2E2' }, // red
  { bg: '#4338CA', text: '#E0E7FF' }, // indigo
  { bg: '#065F46', text: '#D1FAE5' }, // dark green
];

/**
 * Returns initials for a given name.
 * - "Prathamesh Jadhav" → "PJ"
 * - "Aishwarya"         → "A"
 * - "  "                → "?"
 */
export function getInitials(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Picks a stable color from the palette using the name string as a seed.
 * Same input always returns the same color.
 */
export function getAvatarColor(name: string | null | undefined): { bg: string; text: string } {
  const seed = (name || '').trim().toLowerCase();
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  /** The user's name — used to generate initials and deterministic color */
  name: string | null | undefined;
  /** URL of the user's profile photo. If absent or fails to load, falls back to initials */
  src?: string | null;
  /** Tailwind size class, e.g. "w-9 h-9" (default), "w-7 h-7", "w-28 h-28" */
  size?: string;
  /** Extra classes for the outer container (border, ring, etc.) */
  className?: string;
  /** Alt text — defaults to name */
  alt?: string;
}

/**
 * Reusable avatar component.
 * Renders the user's profile image when available.
 * Falls back to a deterministic initials-based avatar when the image is absent or fails to load.
 * Never shows a generic placeholder icon.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  src,
  size = 'w-9 h-9',
  className = '',
  alt,
}) => {
  const [imgError, setImgError] = useState(false);

  const showImage = src && !imgError;
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  const altText = alt || name || 'User';

  const base = `${size} rounded-full flex-shrink-0 overflow-hidden ${className}`;

  if (showImage) {
    return (
      <img
        src={src}
        alt={altText}
        className={`${base} object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center select-none`}
      style={{ backgroundColor: color.bg }}
      role="img"
      aria-label={altText}
    >
      <span
        className="font-bold leading-none"
        style={{
          color: color.text,
          fontSize: 'clamp(10px, 35%, 18px)',
        }}
      >
        {initials}
      </span>
    </div>
  );
};
