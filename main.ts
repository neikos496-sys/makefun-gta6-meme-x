// GTA 6 meme maker — make.fun bounty gta6-meme-x-01.
// Node 22, standard library only. No network, no wall clock, no randomness
// outside one fixed seed, so two runs write the same bytes.
//
// What it does:
//   1. Draws a Vice City sunset meme, 1080x1080, with make.fun's white ghost
//      mascot (sparkle eyes, magenta star coin) in front of a synthwave sun.
//      Caption: "WAITED 13 YEARS / FOR GTA 6" ... "MY AGENT EARNED IT /
//      ON MAKE.FUN".
//   2. Writes the picture to <OUTPUT_DIR>/meme.png (PNG, RGB, hand-encoded).
//   3. Copies POST.json from the repository root to <OUTPUT_DIR>/POST.json,
//      which is what the bounty gate reads.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1080;
const H = 1080;

// ---------------------------------------------------------------------------
// Raster: a plain RGB buffer with a few drawing primitives.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const buf = new Uint8Array(W * H * 3);

function px(x: number, y: number): number {
  return (y * W + x) * 3;
}

function set(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = px(xi, yi);
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
}

// Paint with an alpha blend over what is already there (0 = transparent).
function blend(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = px(xi, yi);
  buf[o] = Math.round(buf[o] * (1 - a) + c[0] * a);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - a) + c[1] * a);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - a) + c[2] * a);
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      set(x, y, c);
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// A thick line drawn as a chain of filled discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  const r = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillDisc(x0 + dx * t, y0 + dy * t, r, c);
  }
}

function fillDisc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) set(x, y, c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(x, y, c);
    }
  }
}

// Scanline polygon fill. pts is a flat [x0,y0,x1,y1,...] list.
function fillPolygon(pts: number[], c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (let i = 1; i < pts.length; i += 2) {
    minY = Math.min(minY, pts[i]);
    maxY = Math.max(maxY, pts[i]);
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x0 = pts[i];
      const y0 = pts[i + 1];
      const x1 = pts[(i + 2) % pts.length];
      const y1 = pts[(i + 3) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        set(x, y, c);
      }
    }
  }
}

// Fixed-seed deterministic pseudo-random (mulberry32). No wall clock, no
// Math.random: the picture must be byte-identical on every run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (only the glyphs the captions need).
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '3': ['11111', '00001', '00001', '01110', '00001', '00001', '11111'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawTextRaw(text: string, cx: number, y: number, scale: number, c: RGB): void {
  const w = textWidth(text, scale);
  let x = cx - w / 2;
  for (const ch of text) {
    if (ch === ' ') {
      x += 6 * scale;
      continue;
    }
    const glyph = FONT[ch];
    if (!glyph) {
      x += 6 * scale;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          fillRect(x + col * scale, y + row * scale, x + (col + 1) * scale, y + (row + 1) * scale, c);
        }
      }
    }
    x += 6 * scale;
  }
}

// Meme caption: white letters with a thick black outline, centred on cx.
function drawCaption(text: string, cx: number, y: number, scale: number): void {
  const black: RGB = [0, 0, 0];
  const white: RGB = [255, 255, 255];
  const o = Math.max(2, Math.round(scale * 0.32));
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]] as const) {
    drawTextRaw(text, cx + dx, y + dy, scale, black);
  }
  drawTextRaw(text, cx, y, scale, white);
}

// ---------------------------------------------------------------------------
// The scene: a Vice City synthwave sunset.
// ---------------------------------------------------------------------------

const PURPLE: RGB = [26, 8, 46];
const MAGENTA: RGB = [255, 46, 136];
const ORANGE: RGB = [255, 122, 26];
const YELLOW: RGB = [255, 214, 64];
const CREAM: RGB = [255, 236, 170];
const DARK: RGB = [13, 4, 24];
const CYAN: RGB = [0, 229, 255];

// Sky: deep purple at the top, magenta, then orange, then warm yellow at
// the horizon (y = 640).
function skyColor(y: number): RGB {
  const stops: [number, RGB][] = [
    [0, [24, 6, 54]],
    [260, [94, 18, 94]],
    [440, [196, 38, 110]],
    [560, [255, 110, 60]],
    [640, [255, 196, 90]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [y0, c0] = stops[i];
    const [y1, c1] = stops[i + 1];
    if (y >= y0 && y <= y1) return mix(c0, c1, (y - y0) / (y1 - y0));
  }
  return stops[stops.length - 1][1];
}

for (let y = 0; y < 660; y++) {
  fillRect(0, y, W, y + 1, skyColor(y));
}

// Sun glow, then the sun itself (centre 540, 420, radius 185).
for (let r = 260; r > 185; r -= 4) {
  const a = 0.05 * (1 - (r - 185) / 75);
  for (let ang = 0; ang < Math.PI * 2; ang += 0.01) {
    blend(540 + Math.cos(ang) * r, 420 + Math.sin(ang) * r, YELLOW, a);
  }
}
for (let y = 420 - 185; y <= 420 + 185; y++) {
  const dy = y - 420;
  const half = Math.sqrt(185 * 185 - dy * dy);
  const t = (y - (420 - 185)) / 370;
  fillRect(540 - half, y, 540 + half, y + 1, mix(YELLOW, ORANGE, t));
}
// Synthwave slats: sky-coloured bars across the sun's lower half.
let slatY = 470;
let slatH = 6;
while (slatY < 605) {
  fillRect(540 - 200, slatY, 540 + 200, slatY + slatH, skyColor(slatY));
  slatY += slatH + 14;
  slatH += 4;
}

// Skyline silhouette with lit windows (fixed seed, so it never changes).
const rand = mulberry32(1337);
let bx = 0;
while (bx < W) {
  const bw = 46 + Math.floor(rand() * 90);
  const bh = 60 + Math.floor(rand() * 130);
  fillRect(bx, 660 - bh, bx + bw, 660, DARK);
  for (let wy = 660 - bh + 10; wy < 650; wy += 18) {
    for (let wx = bx + 8; wx < bx + bw - 8; wx += 16) {
      if (rand() < 0.45) fillRect(wx, wy, wx + 6, wy + 8, [255, 196, 90]);
    }
  }
  bx += bw + 6;
}

// Floor: dark ground with a neon perspective grid, horizon at y = 660.
fillRect(0, 660, W, H, [16, 5, 31]);
for (let i = -8; i <= 8; i++) {
  const xTop = 540 + i * 34;
  const xBot = 540 + i * 190;
  thickLine(xTop, 660, xBot, H, 3, i % 2 === 0 ? MAGENTA : CYAN);
}
let gy = 660;
let gap = 14;
while (gy < H) {
  thickLine(0, gy, W, gy, 3, MAGENTA);
  gy += gap;
  gap = Math.round(gap * 1.35);
}

// Palm trees, left and right, in silhouette.
function palm(xBase: number, yBase: number, s: number, lean: number): void {
  const trunk: number[] = [];
  for (let t = 0; t <= 10; t++) {
    const f = t / 10;
    trunk.push(xBase + lean * f * f * 60, yBase - f * 260 * s);
  }
  for (let i = 0; i < trunk.length - 1; i++) {
    thickLine(trunk[i * 2], trunk[i * 2 + 1], trunk[i * 2 + 2], trunk[i * 2 + 3], 16 * s, DARK);
  }
  const topX = xBase + lean * 60;
  const topY = yBase - 260 * s;
  for (let k = 0; k < 5; k++) {
    const ang = Math.PI * (0.12 + (k * 0.19));
    const dir = k % 2 === 0 ? 1 : -1;
    const ex = topX + dir * Math.cos(ang) * 140 * s;
    const ey = topY - Math.sin(ang) * 60 * s + 100 * s;
    const mx = (topX + ex) / 2;
    const my = (topY + ey) / 2 - 12 * s;
    thickLine(topX, topY, mx, my, 11 * s, DARK);
    thickLine(mx, my, ex, ey, 9 * s, DARK);
  }
}
palm(110, 700, 1.15, -1);
palm(985, 700, 1.0, 1);

// ---------------------------------------------------------------------------
// make.fun's ghost mascot: white sheet ghost, sparkle eyes, magenta star coin.
// ---------------------------------------------------------------------------

const GHOST_CX = 540;
const GHOST_TOP = 330;
const GHOST_W = 300;
const GHOST_H = 380;

// Soft shadow behind the ghost: one flat dark ellipse, mostly hidden
// behind the body, just a sliver showing under the hem.
fillEllipse(GHOST_CX, GHOST_TOP + GHOST_H - 6, 150, 14, [8, 2, 16]);

// Body: dome top, straight sides, wavy bottom (three scallops).
const ghostPts: number[] = [];
ghostPts.push(GHOST_CX - GHOST_W / 2, GHOST_TOP + GHOST_H - 46);
ghostPts.push(GHOST_CX - GHOST_W / 2, GHOST_TOP + 150);
for (let a = Math.PI; a <= Math.PI * 2; a += 0.06) {
  ghostPts.push(GHOST_CX + Math.cos(a) * (GHOST_W / 2), GHOST_TOP + 150 + Math.sin(a) * 150);
}
ghostPts.push(GHOST_CX + GHOST_W / 2, GHOST_TOP + GHOST_H - 46);
for (let s = 0; s < 3; s++) {
  const x0 = GHOST_CX + GHOST_W / 2 - (s * GHOST_W) / 3;
  const x1 = GHOST_CX + GHOST_W / 2 - ((s + 1) * GHOST_W) / 3;
  const mid = (x0 + x1) / 2;
  ghostPts.push(x0 - (x0 - mid) * 0.3, GHOST_TOP + GHOST_H - 12);
  ghostPts.push(mid, GHOST_TOP + GHOST_H);
  ghostPts.push(x1 + (mid - x1) * 0.3, GHOST_TOP + GHOST_H - 12);
  ghostPts.push(x1, GHOST_TOP + GHOST_H - 34);
}
fillPolygon(ghostPts, [255, 255, 255]);

// Light lavender shading on the ghost's right side.
for (let y = GHOST_TOP + 60; y < GHOST_TOP + GHOST_H - 40; y++) {
  const t = (y - GHOST_TOP) / GHOST_H;
  const half = GHOST_W / 2 - 12;
  for (let x = GHOST_CX + half * 0.45; x < GHOST_CX + half; x++) {
    blend(x, y, [214, 196, 255], 0.22 * t + 0.05);
  }
}

// Eyes: tall black ovals with a white sparkle in each.
fillEllipse(GHOST_CX - 58, GHOST_TOP + 190, 24, 36, [10, 6, 20]);
fillEllipse(GHOST_CX + 58, GHOST_TOP + 190, 24, 36, [10, 6, 20]);
function sparkle(cx: number, cy: number, r: number): void {
  fillPolygon([cx, cy - r, cx + r * 0.28, cy - r * 0.28, cx + r, cy, cx + r * 0.28, cy + r * 0.28, cx, cy + r, cx - r * 0.28, cy + r * 0.28, cx - r, cy, cx - r * 0.28, cy - r * 0.28], [255, 255, 255]);
}
sparkle(GHOST_CX - 52, GHOST_TOP + 176, 9);
sparkle(GHOST_CX + 64, GHOST_TOP + 176, 9);

// Smile.
for (let a = Math.PI * 0.15; a <= Math.PI * 0.85; a += 0.08) {
  fillDisc(GHOST_CX + Math.cos(a) * 34, GHOST_TOP + 258 + Math.sin(a) * 26, 5, [10, 6, 20]);
}

// Magenta star coin, held up at the ghost's right.
const STAR_CX = GHOST_CX + 176;
const STAR_CY = GHOST_TOP + 300;
fillDisc(STAR_CX, STAR_CY, 46, [255, 255, 255]);
const starPts: number[] = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 === 0 ? 42 : 17;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  starPts.push(STAR_CX + Math.cos(a) * r, STAR_CY + Math.sin(a) * r);
}
fillPolygon(starPts, MAGENTA);
fillDisc(STAR_CX - 10, STAR_CY - 12, 7, [255, 120, 180]);

// ---------------------------------------------------------------------------
// Captions.
// ---------------------------------------------------------------------------

drawCaption('WAITED 13 YEARS', 540, 52, 10);
drawCaption('FOR GTA 6', 540, 142, 10);
drawCaption('MY AGENT EARNED IT', 540, 872, 8);
drawCaption('ON MAKE.FUN', 540, 962, 8);

// ---------------------------------------------------------------------------
// PNG encoding (RGB, 8-bit, filter 0) and output.
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
