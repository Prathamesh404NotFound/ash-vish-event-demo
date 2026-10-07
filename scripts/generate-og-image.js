/**
 * Generates public/og-image.jpg — the static link-preview (og:image) plate
 * read by social scrapers (WhatsApp, Facebook, Twitter/X, Slack) that never
 * run JavaScript and therefore cannot see the client-side og:image override.
 *
 * The plate is brand-owned (Ash-vish Events logo + wordmark on the site's
 * dark/gold theme) so the shared link preview never shows a stale event
 * poster. Regenerate with:  npm run og:image  (or: node scripts/generate-og-image.js)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontDir = path.join(root, 'scripts', 'assets', 'fonts');
const outPath = path.join(root, 'public', 'og-image.jpg');
const logoPath = path.join(root, 'public', 'ash-vish-events-logo.png');

const WIDTH = 1200;
const HEIGHT = 630;
const GOLD = '#D4AF37';

// Pango (used by librsvg inside sharp) resolves fonts through fontconfig.
// Minimal environments ship no default config, so point fontconfig at the
// fonts bundled with this repo BEFORE sharp is loaded.
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-fontcache-'));
const fontConfigPath = path.join(cacheDir, 'fonts.conf');
fs.writeFileSync(
  fontConfigPath,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`
);
process.env.FONTCONFIG_FILE = fontConfigPath;

const { default: sharp } = await import('sharp');

const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0D0D0D"/>
      <stop offset="1" stop-color="#070707"/>
    </linearGradient>
    <radialGradient id="glowTL" cx="22%" cy="12%" r="65%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBR" cx="88%" cy="95%" r="60%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="31%" r="34%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="${GOLD}" stroke-width="1"/>
    </pattern>
    <radialGradient id="gridFade" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridMask">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#gridFade)"/>
    </mask>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#base)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" opacity="0.10" mask="url(#gridMask)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowTL)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glowBR)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#halo)"/>
  <rect x="26" y="26" width="${WIDTH - 52}" height="${HEIGHT - 52}" rx="30"
        fill="none" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="2"/>
  <rect x="38" y="38" width="${WIDTH - 76}" height="${HEIGHT - 76}" rx="22"
        fill="none" stroke="${GOLD}" stroke-opacity="0.16" stroke-width="1"/>
</svg>`;

const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <text x="${WIDTH / 2}" y="410" text-anchor="middle"
        font-family="Space Grotesk" font-weight="700" font-size="76" letter-spacing="1">
    <tspan fill="#FFFFFF">Ash-vish</tspan><tspan fill="${GOLD}"> Events</tspan>
  </text>
  <text x="${WIDTH / 2}" y="464" text-anchor="middle"
        font-family="Inter" font-weight="600" font-size="24" letter-spacing="6"
        fill="#C9C9C9">LIVE EVENTS &#8226; INSTANT QR ENTRY &#8226; ASHVISH.EVENTS.COM</text>
</svg>`;

const [background, logo, text] = await Promise.all([
  sharp(Buffer.from(backgroundSvg)).png().toBuffer(),
  sharp(logoPath).resize(240, 240, { fit: 'contain' }).png().toBuffer(),
  sharp(Buffer.from(textSvg)).png().toBuffer(),
]);

// `screen` blend drops the logo's black background so only the mark shows.
await sharp(background)
  .composite([
    { input: logo, blend: 'screen', left: (WIDTH - 240) / 2, top: 84 },
    { input: text, left: 0, top: 0 },
  ])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(outPath);

const meta = await sharp(outPath).metadata();
console.log(
  `Wrote ${path.relative(root, outPath)} — ${meta.width}x${meta.height} ${meta.format}, ` +
    `${fs.statSync(outPath).size} bytes`
);
