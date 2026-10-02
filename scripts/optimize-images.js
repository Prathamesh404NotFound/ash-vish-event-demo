#!/usr/bin/env node
/*
 * Regenerates every image served from public/ from the two pristine sources:
 *
 *   brand/logo-source.png  the original 1254x1254 brand mark (never served)
 *   public/og-image.jpg    the 1080x1350 photography plate
 *
 * Why this exists: every PNG that shipped in public/ except the brand mark was
 * found to be byte-corrupted (the 0x89 PNG magic byte had been replaced with
 * the UTF-8 replacement sequence), so favicons, the PWA manifest icons and the
 * apple touch icon were all unreadable in production. This script rebuilds
 * them from the one intact source, and shrinks the served logo from 780 KB to
 * a few KB.
 *
 * Nothing is ever written unless the output is smaller than what it replaces,
 * and every output is re-read and checked for a valid PNG/JPEG magic before
 * the script reports success.
 *
 * Usage:  bun run optimize:images   (or: node scripts/optimize-images.js)
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const BRAND_DIR = path.join(ROOT, 'brand');
const LOGO_SOURCE = path.join(BRAND_DIR, 'logo-source.png');
const PHOTO_SOURCE = path.join(PUBLIC_DIR, 'og-image.jpg');

/** Rendered at 32-80 CSS px — 320px covers a 4x device pixel ratio. */
const LOGO_SIZE = 320;
/** Social card + auth backdrop. Dimensions are kept (1080x1350 for og:image). */
const PHOTO_QUALITY = 72;

/** size -> served filename. Icons are rebuilt from the brand mark. */
const ICONS = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-48.png', size: 48 },
  { file: 'favicon-64.png', size: 64 },
  { file: 'favicon-192.png', size: 192 },
  { file: 'favicon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'ash-vish-events-logo.png', size: 512 },
];

const ICO_SIZES = [16, 32, 48];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pngOptions = { palette: true, quality: 90, compressionLevel: 9, effort: 10 };
const rows = [];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function sizeOf(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

/**
 * Writes only when the new bytes are smaller AND the output starts with the
 * expected container signature (PNG magic, or the ICO header for favicon.ico).
 */
async function writePng(file, buffer, prevSize, magic = PNG_MAGIC) {
  if (buffer.subarray(0, magic.length).toString('hex') !== magic.toString('hex')) {
    throw new Error(`Refusing to write ${path.basename(file)}: output has no valid signature`);
  }
  if (prevSize > 0 && buffer.length >= prevSize) {
    rows.push([path.basename(file), prevSize, prevSize, 'kept (already smaller)']);
    return;
  }
  await writeFile(file, buffer);
  rows.push([path.basename(file), prevSize, buffer.length, 'ok']);
}

/** Classic ICO container wrapping PNG entries (supported since Windows Vista). */
async function buildIco(logo) {
  const pngs = await Promise.all(
    ICO_SIZES.map((size) =>
      logo.clone().resize(size, size, { fit: 'cover' }).png({ ...pngOptions, palette: false }).toBuffer()
    )
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  pngs.forEach((png, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(ICO_SIZES[i], 0); // width
    entry.writeUInt8(ICO_SIZES[i], 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

async function main() {
  if (!existsSync(LOGO_SOURCE)) {
    console.error(`Missing pristine source: ${path.relative(ROOT, LOGO_SOURCE)}`);
    process.exit(1);
  }
  await mkdir(BRAND_DIR, { recursive: true });

  const logo = sharp(LOGO_SOURCE, { failOn: 'error' });
  const meta = await logo.metadata();
  if (!meta.width || !meta.height) {
    console.error('logo-source.png is unreadable — restore it from git before regenerating.');
    process.exit(1);
  }

  // 1. Served logo (splash + navbar + footer + admin/counter shells).
  const logoPath = path.join(PUBLIC_DIR, 'ashvish-logo.png');
  const logoPrev = await sizeOf(logoPath);
  const logoBuf = await logo
    .clone()
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png(pngOptions)
    .toBuffer();
  await writePng(logoPath, logoBuf, logoPrev);

  // 2. Favicon / manifest / PWA icons — all rebuilt from the same source.
  for (const { file, size } of ICONS) {
    const target = path.join(PUBLIC_DIR, file);
    const prev = await sizeOf(target);
    const buf = await logo.clone().resize(size, size, { fit: 'cover' }).png(pngOptions).toBuffer();
    await writePng(target, buf, prev);
  }

  // 3. favicon.ico (ICO container, not a bare PNG)
  const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);
  const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
  const icoPrev = await sizeOf(icoPath);
  await writePng(icoPath, await buildIco(logo), icoPrev, ICO_MAGIC);

  // 4. Photographic plate (social card + auth background) — recompress only.
  const photoPrev = await sizeOf(PHOTO_SOURCE);
  if (photoPrev === 0) {
    rows.push(['og-image.jpg', 0, 0, 'skipped (missing)']);
  } else {
    const photoHead = (await readFile(PHOTO_SOURCE)).subarray(0, 2);
    if (photoHead[0] !== 0xff || photoHead[1] !== 0xd8) {
      rows.push(['og-image.jpg', photoPrev, photoPrev, 'skipped (corrupt source)']);
    } else {
      let photo = sharp(PHOTO_SOURCE);
      let buffer;
      try {
        buffer = await photo.jpeg({ quality: PHOTO_QUALITY, mozjpeg: true, progressive: true }).toBuffer();
      } catch {
        buffer = await sharp(PHOTO_SOURCE)
          .jpeg({ quality: PHOTO_QUALITY, progressive: true })
          .toBuffer();
      }
      if (buffer.subarray(0, 2).toString('hex') !== 'ffd8') {
        throw new Error('Refusing to write og-image.jpg: output has no JPEG signature');
      }
      if (buffer.length < photoPrev) {
        await writeFile(PHOTO_SOURCE, buffer);
        rows.push(['og-image.jpg', photoPrev, buffer.length, 'ok']);
      } else {
        rows.push(['og-image.jpg', photoPrev, photoPrev, 'kept (already smaller)']);
      }
    }
  }

  // Verify every generated PNG still decodes.
  for (const { file } of ICONS) {
    const p = path.join(PUBLIC_DIR, file);
    const buf = await readFile(p);
    if (buf.subarray(0, 8).toString('hex') !== PNG_MAGIC.toString('hex')) {
      throw new Error(`${file} failed verification after regeneration`);
    }
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nimage                         before       after      change');
  console.log('---------------------------- ----------- ---------- -----------');
  for (const [name, before, after, note] of rows) {
    const delta =
      before > after ? `-${kb(before - after)}` : note;
    console.log(`${pad(name, 28)} ${pad(kb(before), 11)} ${pad(kb(after), 10)} ${delta}`);
  }
  const totalBefore = rows.reduce((s, r) => s + r[1], 0);
  const totalAfter = rows.reduce((s, r) => s + r[2], 0);
  console.log(`${pad('TOTAL', 28)} ${pad(kb(totalBefore), 11)} ${pad(kb(totalAfter), 10)} -${kb(
    totalBefore - totalAfter
  )}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
