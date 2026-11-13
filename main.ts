// make.fun cutest-picture-01 entry #2 (Node 22, standard library only).
//
// A program that DRAWS the cutest picture it can, in code — built after
// studying the live leaderboard's top 10 (all 12-0, all 1024x1024): every
// winner is a FULL-BODY sitting animal HUGGING a tiny chick/duckling, most
// wear a knitted scarf, all have huge glossy eyes, pink paw pads and a soft
// warm bokeh background. Entry #1 (a flat face-only kitten at 512px) ranked
// 1837/2757 — this entry copies the winning COMPOSITION with original art:
// a chubby cream kitten in a mint knitted scarf, hugging a tiny yellow
// chick, pink toe beans, a daisy behind one ear, warm bokeh + vignette.
//
// Every pixel is computed from shapes with 2x2 supersampling, fur texture
// from deterministic hash noise, then encoded as a PNG with a small pure-JS
// encoder (zlib + CRC32). No image assets, no network, no randomness: two
// runs write byte-identical files.
//
// Run locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------- colour helpers ----------
function rgb(r, g, b, a = 1) {
  return [r, g, b, a];
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 1];
}
function over(top, bottom) {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}
function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
// Deterministic hash noise in [0,1) — fur speckle, no randomness.
function hashNoise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- palette ----------
const SKY_TOP = rgb(255, 243, 224); // warm cream
const SKY_BOTTOM = rgb(255, 226, 214); // soft peach
const FUR = rgb(255, 248, 236); // cream-white fur
const FUR_SHADE = rgb(238, 214, 180); // warm rim shade
const FUR_DEEP = rgb(222, 190, 152);
const EAR_INNER = rgb(255, 196, 210);
const EYE_RIM = rgb(43, 32, 26);
const IRIS = rgb(47, 94, 167); // deep blue iris
const IRIS_DARK = rgb(28, 58, 110);
const WHITE = rgb(255, 255, 255);
const BLUSH = rgb(255, 150, 180);
const NOSE = rgb(243, 120, 152);
const MOUTH = rgb(150, 95, 70);
const WHISKER = rgb(198, 158, 130, 0.8);
const SCARF = rgb(143, 214, 189); // mint knit
const SCARF_DARK = rgb(104, 183, 155);
const SCARF_LIGHT = rgb(178, 232, 211);
const CHICK = rgb(255, 219, 88); // chick yellow
const CHICK_SHADE = rgb(245, 188, 60);
const BEAK = rgb(244, 141, 60);
const PAD = rgb(255, 155, 178); // toe beans
const DAISY = rgb(255, 255, 255);
const DAISY_C = rgb(255, 205, 80);

// ---------- shape tests ----------
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function ellDist(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}
function inEllipse(x, y, cx, cy, rx, ry) {
  return ellDist(x, y, cx, cy, rx, ry) <= 1;
}
function inHeart(x, y, cx, cy, s) {
  const u = (x - cx) / s;
  const v = (y - cy) / s;
  const a = u * u + v * v - 1;
  return a * a * a - u * u * v * v * v <= 0;
}
function inSparkle(x, y, cx, cy, r) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  return Math.sqrt(dx) + Math.sqrt(dy) <= Math.sqrt(r);
}
function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const w1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
  const w2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
  const w3 = 1 - w1 - w2;
  return w1 >= 0 && w2 >= 0 && w3 >= 0;
}
function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
  t = clamp01(t);
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function inArcStroke(x, y, cx, cy, r, width, a0deg, a1deg) {
  const dx = x - cx;
  const dy = y - cy;
  if (Math.abs(Math.hypot(dx, dy) - r) > width / 2) return false;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  return ang >= a0deg && ang <= a1deg;
}
// Soft radial disc: alpha falls off smoothly from 1 at r0 to 0 at r1.
function softDisc(x, y, cx, cy, r0, r1) {
  const d = Math.hypot(x - cx, y - cy);
  return 1 - smoothstep(r0, r1, d);
}
// Soft ellipse falloff for blush / bokeh.
function softEllipse(x, y, cx, cy, rx, ry) {
  const d = ellDist(x, y, cx, cy, rx, ry);
  return 1 - smoothstep(0.35, 1, d);
}

// ---------- fur shading: radial gradient + speckle ----------
function furShade(x, y, cx, cy, r, base, shade, deep) {
  const d = Math.hypot(x - cx, y - cy) / r;
  let c = lerpColor(base, shade, smoothstep(0.45, 1, d));
  c = lerpColor(c, deep, smoothstep(0.85, 1.05, d) * 0.5);
  const n = hashNoise(Math.floor(x / 2), Math.floor(y / 2)) - 0.5;
  const f = 1 + n * 0.055;
  return [c[0] * f, c[1] * f, c[2] * f, 1];
}

// ---------- head group (tilted) ----------
const HEAD_CX = 512;
const HEAD_CY = 420;
const TILT = -4 * (Math.PI / 180);
function toHead(x, y) {
  const dx = x - HEAD_CX;
  const dy = y - HEAD_CY;
  const cos = Math.cos(-TILT);
  const sin = Math.sin(-TILT);
  return [HEAD_CX + dx * cos - dy * sin, HEAD_CY + dx * sin + dy * cos];
}

function headColor(hx, hy) {
  // Whiskers first: they extend past the head edge, so they must be
  // checked before the head-radius test below.
  const whiskers = [
    [300, 470, 190, 440],
    [300, 495, 190, 500],
    [304, 520, 200, 560],
    [724, 470, 834, 440],
    [724, 495, 834, 500],
    [720, 520, 824, 560],
  ];
  for (const [ax, ay, bx, by] of whiskers) {
    if (distToSegment(hx, hy, ax, ay, bx, by) <= 2.6) return rgb(198, 158, 130);
  }

  // Ears: pointed cat ears (triangles), inner pink first, then outer fur.
  if (inTriangle(hx, hy, 348, 316, 428, 300, 352, 196)) return EAR_INNER;
  if (inTriangle(hx, hy, 676, 316, 596, 300, 672, 196)) return EAR_INNER;
  if (inTriangle(hx, hy, 322, 340, 448, 316, 330, 168)) {
    return furShade(hx, hy, 380, 280, 130, FUR, FUR_SHADE, FUR_DEEP);
  }
  if (inTriangle(hx, hy, 702, 340, 576, 316, 694, 168)) {
    return furShade(hx, hy, 644, 280, 130, FUR, FUR_SHADE, FUR_DEEP);
  }

  // Head: soft radial fur.
  const dHead = Math.hypot(hx - HEAD_CX, hy - HEAD_CY);
  if (dHead > 218) return null;
  let c = furShade(hx, hy, HEAD_CX, HEAD_CY - 20, 218, FUR, FUR_SHADE, FUR_DEEP);

  // Muzzle: lighter patch around nose and mouth.
  const m = softEllipse(hx, hy, 512, 500, 130, 78);
  if (m > 0) c = over(rgb(255, 253, 246, 0.55 * m), c);

  // Whiskers are drawn at the top of headColor (they extend past the head).

  // Blush cheeks, soft falloff.
  for (const bx of [372, 652]) {
    const b = softEllipse(hx, hy, bx, 500, 52, 30);
    if (b > 0) c = over(rgb(BLUSH[0], BLUSH[1], BLUSH[2], 0.6 * b), c);
  }

  // Big glossy eyes: dark rim, blue iris, pupil, layered highlights.
  for (const ex of [424, 600]) {
    if (inEllipse(hx, hy, ex, 398, 46, 62)) c = EYE_RIM;
    if (inEllipse(hx, hy, ex, 398, 41, 57)) {
      const id = ellDist(hx, hy, ex, 398, 41, 57);
      c = lerpColor(IRIS, IRIS_DARK, smoothstep(0.2, 1, id));
    }
    if (inEllipse(hx, hy, ex, 400, 21, 30)) c = rgb(18, 14, 12);
    if (inCircle(hx, hy, ex - 13, 378, 15)) c = WHITE;
    if (inCircle(hx, hy, ex + 10, 420, 7)) c = WHITE;
    if (inCircle(hx, hy, ex - 13, 378, 6)) c = rgb(255, 255, 255);
  }

  // Tiny nose with a shine dot, and a little omega mouth.
  if (inEllipse(hx, hy, 512, 472, 17, 12)) c = NOSE;
  if (inCircle(hx, hy, 506, 468, 5)) c = WHITE;
  if (inArcStroke(hx, hy, 494, 490, 20, 6, 10, 170)) c = MOUTH;
  if (inArcStroke(hx, hy, 530, 490, 20, 6, 10, 170)) c = MOUTH;

  return c;
}

// ---------- scarf (screen coords, wraps the neck) ----------
function scarfColor(x, y) {
  // Main band across the neck, clipped to the body silhouette.
  let inBand = false;
  if (y >= 556 && y <= 640 && inEllipse(x, y, 512, 598, 218, 44) && inEllipse(x, y, 512, 690, 242, 232)) inBand = true;
  // Knot.
  if (inCircle(x, y, 632, 618, 32)) inBand = true;
  // Two hanging ends, right of the chick.
  if (x >= 606 && x <= 656 && y >= 626 && y <= 776) inBand = true;
  if (x >= 660 && x <= 704 && y >= 628 && y <= 740) inBand = true;
  if (!inBand) return null;
  // Knit texture: soft horizontal rows + vertical ribs (low contrast so
  // the scarf reads as fabric, not checkerboard).
  const row = 0.5 + 0.5 * Math.sin(y * Math.PI / 9);
  const rib = 0.5 + 0.5 * Math.sin(x * Math.PI / 11);
  let c = lerpColor(SCARF, SCARF_DARK, row * 0.28 + rib * 0.2);
  if (y > 636 && y < 648) c = lerpColor(c, SCARF_LIGHT, 0.5); // band edge light
  // Fringe at the bottom of the hanging ends.
  if ((x >= 606 && x <= 656 && y > 764) || (x >= 660 && x <= 704 && y > 728)) {
    if (Math.floor((x - 606) / 9) % 2 === 0) c = SCARF_DARK;
  }
  return c;
}

// ---------- chick (screen coords) ----------
function chickColor(x, y) {
  const cx = 512;
  const cy = 716;
  // Wings behind the body.
  if (inEllipse(x, y, 424, 730, 34, 52)) return CHICK_SHADE;
  if (inEllipse(x, y, 600, 730, 34, 52)) return CHICK_SHADE;
  // Body: round, radial yellow.
  const d = Math.hypot(x - cx, y - cy);
  if (d > 104) return null;
  let c = lerpColor(rgb(255, 232, 130), CHICK, smoothstep(0, 0.7, d / 104));
  c = lerpColor(c, CHICK_SHADE, smoothstep(0.75, 1, d / 104) * 0.6);
  const n = hashNoise(Math.floor(x / 2), Math.floor(y / 2)) - 0.5;
  const f = 1 + n * 0.04;
  c = [c[0] * f, c[1] * f, c[2] * f, 1];
  // Head tuft.
  if (inTriangle(x, y, 496, 622, 508, 622, 502, 596)) c = CHICK_SHADE;
  if (inTriangle(x, y, 510, 620, 522, 620, 516, 594)) c = CHICK_SHADE;
  // Closed happy eyes (upward arcs) + blush.
  if (inArcStroke(x, y, 478, 706, 16, 6, 180, 360)) c = rgb(120, 74, 20);
  if (inArcStroke(x, y, 546, 706, 16, 6, 180, 360)) c = rgb(120, 74, 20);
  for (const bx of [462, 562]) {
    const b = softEllipse(x, y, bx, 730, 18, 11);
    if (b > 0) c = over(rgb(255, 150, 140, 0.55 * b), c);
  }
  // Tiny beak.
  if (inTriangle(x, y, 498, 716, 526, 716, 512, 734)) c = BEAK;
  return c;
}

// ---------- background ----------
const BOKEH = [
  [120, 150, 70, rgb(255, 255, 255, 0.20)],
  [900, 120, 55, rgb(255, 205, 120, 0.22)],
  [80, 600, 60, rgb(255, 180, 200, 0.18)],
  [950, 550, 75, rgb(255, 255, 255, 0.16)],
  [200, 890, 45, rgb(255, 205, 120, 0.18)],
  [850, 890, 50, rgb(255, 180, 200, 0.16)],
  [150, 350, 35, rgb(255, 255, 255, 0.20)],
  [880, 350, 40, rgb(255, 205, 120, 0.16)],
  [512, 88, 30, rgb(255, 255, 255, 0.22)],
  [300, 120, 25, rgb(255, 180, 200, 0.20)],
  [720, 100, 28, rgb(255, 255, 255, 0.18)],
  [60, 800, 40, rgb(255, 205, 120, 0.14)],
  [970, 800, 45, rgb(255, 255, 255, 0.14)],
];

function backgroundColor(x, y) {
  let c = lerpColor(SKY_TOP, SKY_BOTTOM, y / (H - 1));
  for (const [bx, by, br, col] of BOKEH) {
    const a = softDisc(x, y, bx, by, br * 0.3, br);
    if (a > 0) c = over(rgb(col[0], col[1], col[2], col[3] * a), c);
  }
  // Floating hearts + sparkles, kept to the edges.
  const hearts = [
    [150, 210, 20],
    [880, 210, 16],
    [120, 760, 15],
    [905, 780, 18],
  ];
  for (const [hx, hy, hs] of hearts) {
    if (inHeart(x, y, hx, hy, hs)) c = over(rgb(255, 143, 171, 0.85), c);
  }
  const sparks = [
    [250, 180, 14],
    [770, 180, 12],
    [90, 470, 12],
    [940, 470, 14],
  ];
  for (const [sx, sy, sr] of sparks) {
    if (inSparkle(x, y, sx, sy, sr)) c = over(rgb(255, 209, 102, 0.95), c);
  }
  // Soft vignette.
  const v = Math.hypot(x - 512, y - 512) / 724;
  c = lerpColor(c, rgb(245, 205, 185), smoothstep(0.75, 1.15, v) * 0.35);
  return c;
}

// ---------- tail: fat bezier curl on the right (precomputed) ----------
const TAIL_PTS = [];
for (let i = 0; i <= 10; i++) {
  const t = i / 10;
  const mt = 1 - t;
  TAIL_PTS.push([
    mt * mt * 720 + 2 * mt * t * 880 + t * t * 880,
    mt * mt * 830 + 2 * mt * t * 800 + t * t * 620,
  ]);
}

function pixelColor(x, y) {
  let c = backgroundColor(x, y);

  // Ground shadow.
  const sh = softEllipse(x, y, 512, 896, 290, 34);
  if (sh > 0) c = over(rgb(226, 178, 170, 0.4 * sh), c);

  // Tail (bbox-guarded): one smooth gradient across the whole tail so the
  // overlapping circles don't show seams.
  if (x > 660 && x < 940 && y > 560 && y < 890) {
    let inTail = false;
    for (const [tx, ty] of TAIL_PTS) {
      if (inCircle(x, y, tx, ty, 46)) {
        inTail = true;
        break;
      }
    }
    if (inTail) c = furShade(x, y, 830, 720, 230, FUR, FUR_SHADE, FUR_DEEP);
  }

  // Body: chubby ellipse.
  if (inEllipse(x, y, 512, 690, 242, 232)) {
    c = furShade(x, y, 512, 640, 260, FUR, FUR_SHADE, FUR_DEEP);
  }

  // Hind feet with toe beans (bbox-guarded).
  if (y > 780 && y < 920 && ((x > 280 && x < 500) || (x > 520 && x < 740))) {
    for (const fx of [392, 632]) {
      if (inEllipse(x, y, fx, 852, 92, 58)) {
        c = furShade(x, y, fx, 852, 92, FUR, FUR_SHADE, FUR_DEEP);
        // Big pad + three toe beans.
        if (inEllipse(x, y, fx, 866, 30, 20)) c = PAD;
        if (inCircle(x, y, fx - 24, 838, 10)) c = PAD;
        if (inCircle(x, y, fx, 830, 10)) c = PAD;
        if (inCircle(x, y, fx + 24, 838, 10)) c = PAD;
      }
    }
  }

  // Head group (tilted, bbox-guarded; wide enough for the whiskers).
  if (x > 180 && x < 850 && y > 130 && y < 660) {
    const [hx, hy] = toHead(x, y);
    const hc = headColor(hx, hy);
    if (hc) c = hc;
  }

  // Daisy behind the right ear.
  if (x > 670 && x < 745 && y > 170 && y < 250) {
    const daisyCx = 706;
    const daisyCy = 208;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      const px = daisyCx + Math.cos(a) * 16;
      const py = daisyCy + Math.sin(a) * 16;
      if (inCircle(x, y, px, py, 11)) c = DAISY;
    }
    if (inCircle(x, y, daisyCx, daisyCy, 10)) c = DAISY_C;
  }

  // Scarf over the neck (bbox-guarded).
  if (x > 250 && x < 775 && y > 545 && y < 785) {
    const sc = scarfColor(x, y);
    if (sc) c = sc;
  }

  // Chick, held in front of the body (bbox-guarded).
  if (x > 395 && x < 630 && y > 585 && y < 830) {
    const cc = chickColor(x, y);
    if (cc) c = cc;
  }

  // Hugging front paws over the chick's sides (bbox-guarded).
  if (y > 630 && y < 820 && ((x > 350 && x < 475) || (x > 550 && x < 675))) {
    for (const [px0, py0] of [
      [412, 726],
      [612, 726],
    ]) {
      if (inEllipse(x, y, px0, py0, 50, 80)) {
        c = furShade(x, y, px0, py0, 80, FUR, FUR_SHADE, FUR_DEEP);
      }
    }
  }

  return c;
}

// ---------- render with 2x2 supersampling ----------
const px = Buffer.alloc(W * H * 4);
const offsets = [0.25, 0.75];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const oy of offsets) {
      for (const ox of offsets) {
        const c = pixelColor(x + ox, y + oy);
        r += c[0];
        g += c[1];
        b += c[2];
      }
    }
    const i = (y * W + x) * 4;
    px[i] = Math.min(255, Math.max(0, Math.round(r / 4)));
    px[i + 1] = Math.min(255, Math.max(0, Math.round(g / 4)));
    px[i + 2] = Math.min(255, Math.max(0, Math.round(b / 4)));
    px[i + 3] = 255;
  }
}

// ---------- minimal PNG encoder (RGBA8, filter 0, zlib level 9) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'entry.png'), png);
console.log(`wrote ${png.length} bytes to ${join(OUT, 'entry.png')}`);
