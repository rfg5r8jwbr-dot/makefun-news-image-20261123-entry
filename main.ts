// Monday 23 November 2026, in one image.
// A code-drawn 1024x1024 poster: six verified stories of the day.
// Node 22, standard library only. Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR).
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];
const NAVY: RGB = [13, 27, 42];
const PANEL: RGB = [20, 39, 60];
const PANEL2: RGB = [24, 46, 71];
const EDGE: RGB = [43, 74, 104];
const GOLD: RGB = [224, 168, 60];
const WHITE: RGB = [244, 241, 232];
const MUTED: RGB = [157, 180, 200];
const DARK: RGB = [10, 20, 32];

// ---- pixel buffer ----
const px = new Uint8Array(W * H * 3);
function setPix(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let j = y0; j < y1; j++) {
    for (let i = x0; i < x1; i++) setPix(i, j, c);
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let x = cx - dx; x <= cx + dx; x++) setPix(x, cy + dy, c);
  }
}
function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    setPix(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const r = Math.max(1, Math.floor(t / 2));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / Math.max(1, steps));
    const y = Math.round(y0 + ((y1 - y0) * s) / Math.max(1, steps));
    fillCircle(x, y, r, c);
  }
}
function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs), b = Math.max(...xs);
      for (let x = Math.ceil(a); x <= Math.floor(b); x++) setPix(x, y, c);
    }
  }
}
function polyline(pts: Array<[number, number]>, t: number, c: RGB): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], t, c);
  }
}

// ---- PNG encoder (stdlib zlib) ----
const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font, uppercase + digits + punctuation (authored here) ----
// Each glyph: 7 rows, 5 bits, most significant bit on the left.
const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b00100, 0b01000],
  ":": [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  "-": [0b00000, 0b00000, 0b00000, 0b01110, 0b00000, 0b00000, 0b00000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  "+": [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  "$": [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  "&": [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0b00000, 0b00100],
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
};
const BLANK = [0, 0, 0, 0, 0, 0, 0];
function textWidth(text: string, s: number): number {
  return text.length === 0 ? 0 : text.length * 6 * s - s;
}
function drawText(x: number, y: number, text: string, s: number, c: RGB, align: "left" | "center" = "left"): void {
  const up = text.toUpperCase();
  let x0 = x;
  if (align === "center") x0 = x - Math.floor(textWidth(up, s) / 2);
  for (let ci = 0; ci < up.length; ci++) {
    const g = FONT[up[ci]] ?? BLANK;
    const cx = x0 + ci * 6 * s;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if ((g[r] >> (4 - col)) & 1) fillRect(cx + col * s, y + r * s, s, s, c);
      }
    }
  }
}
function wrapText(text: string, maxW: number, s: number): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, s) <= maxW || cur === "") cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---- story pictograms, drawn in a 314 x 148 box ----
const SEA: RGB = [36, 110, 168];
const SKY: RGB = [26, 52, 84];
const GREEN: RGB = [118, 185, 0];
const ORANGE: RGB = [232, 122, 36];
const RED: RGB = [214, 69, 60];
const YELLOW: RGB = [240, 200, 70];
const SMOKE: RGB = [120, 130, 140];
const STEEL: RGB = [150, 165, 180];
const TEAL: RGB = [64, 180, 160];

function artGlobe(x: number, y: number): void {
  fillRect(x, y, 314, 148, SKY);
  fillCircle(x + 157, y + 74, 56, [52, 130, 190]);
  fillCircle(x + 132, y + 52, 16, [72, 160, 90]);
  fillCircle(x + 172, y + 92, 20, [72, 160, 90]);
  fillCircle(x + 178, y + 48, 10, [72, 160, 90]);
  // crack across the globe
  polyline([[x + 118, y + 30], [x + 142, y + 58], [x + 128, y + 78], [x + 158, y + 100], [x + 146, y + 124]], 4, [20, 24, 30]);
  polyline([[x + 158, y + 100], [x + 176, y + 112], [x + 170, y + 128]], 3, [20, 24, 30]);
  drawText(x + 157, y + 128, "NO DEAL", 2, GOLD, "center");
}
function artShip(x: number, y: number): void {
  fillRect(x, y, 314, 148, SKY);
  // drone
  fillCircle(x + 240, y + 22, 4, DARK);
  drawLine(x + 228, y + 18, x + 252, y + 18, STEEL);
  // sea
  fillRect(x, y + 108, 314, 40, SEA);
  drawLine(x + 10, y + 120, x + 90, y + 116, [120, 190, 230]);
  drawLine(x + 200, y + 128, x + 300, y + 122, [120, 190, 230]);
  // listing hull
  fillTriangle(x + 90, y + 92, x + 232, y + 66, x + 222, y + 100, STEEL);
  fillTriangle(x + 90, y + 92, x + 222, y + 100, x + 104, y + 110, [110, 122, 134]);
  drawLine(x + 150, y + 78, x + 150, y + 48, STEEL);
  drawLine(x + 150, y + 48, x + 176, y + 62, RED);
  // smoke
  fillCircle(x + 210, y + 46, 10, SMOKE);
  fillCircle(x + 224, y + 34, 13, SMOKE);
  fillCircle(x + 240, y + 20, 9, SMOKE);
}
function artChip(x: number, y: number): void {
  fillRect(x, y, 314, 148, SKY);
  // rising chart
  polyline([[x + 30, y + 118], [x + 90, y + 96], [x + 140, y + 104], [x + 200, y + 60], [x + 268, y + 34]], 5, GREEN);
  fillTriangle(x + 268, y + 34, x + 250, y + 34, x + 268, y + 52, GREEN);
  // chip
  fillRect(x + 96, y + 66, 76, 76, [16, 60, 30]);
  for (let i = 0; i < 4; i++) {
    fillRect(x + 106 + i * 18, y + 58, 8, 8, GREEN);
    fillRect(x + 106 + i * 18, y + 142, 8, 8, GREEN);
    fillRect(x + 88, y + 76 + i * 18, 8, 8, GREEN);
    fillRect(x + 172, y + 76 + i * 18, 8, 8, GREEN);
  }
  fillRect(x + 116, y + 86, 36, 36, GREEN);
  drawText(x + 134, y + 96, "NV", 3, [16, 60, 30], "center");
}
function artKyiv(x: number, y: number): void {
  fillRect(x, y, 314, 148, [24, 22, 30]);
  // skyline
  fillRect(x + 20, y + 84, 44, 64, [52, 58, 70]);
  fillRect(x + 76, y + 64, 36, 84, [44, 50, 62]);
  fillRect(x + 124, y + 92, 52, 56, [52, 58, 70]);
  fillRect(x + 188, y + 72, 40, 76, [44, 50, 62]);
  fillRect(x + 240, y + 96, 54, 52, [52, 58, 70]);
  // windows
  for (const [wx, wy] of [[36, 96], [52, 112], [88, 76], [100, 100], [140, 104], [160, 120], [200, 84], [216, 108], [256, 108], [276, 124]] as Array<[number, number]>) {
    fillRect(x + wx, y + wy, 7, 9, YELLOW);
  }
  // explosion over the skyline
  const ex = x + 157, ey = y + 48;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    drawLine(ex, ey, ex + Math.round(Math.cos(ang) * 34), ey + Math.round(Math.sin(ang) * 34), ORANGE);
    drawLine(ex, ey, ex + Math.round(Math.cos(ang + 0.4) * 22), ey + Math.round(Math.sin(ang + 0.4) * 22), YELLOW);
  }
  fillCircle(ex, ey, 14, YELLOW);
  fillCircle(ex, ey, 8, [255, 236, 170]);
  fillCircle(x + 210, y + 30, 10, SMOKE);
  fillCircle(x + 226, y + 20, 12, SMOKE);
}
function artFire(x: number, y: number): void {
  fillRect(x, y, 314, 148, [32, 22, 20]);
  // factory
  fillRect(x + 50, y + 88, 214, 60, [96, 88, 80]);
  fillTriangle(x + 50, y + 88, x + 93, y + 62, x + 136, y + 88, [120, 110, 100]);
  fillTriangle(x + 136, y + 88, x + 179, y + 62, x + 222, y + 88, [120, 110, 100]);
  fillTriangle(x + 222, y + 88, x + 243, y + 70, x + 264, y + 88, [120, 110, 100]);
  // flames
  fillTriangle(x + 96, y + 84, x + 112, y + 40, x + 128, y + 84, ORANGE);
  fillTriangle(x + 126, y + 84, x + 144, y + 30, x + 162, y + 84, YELLOW);
  fillTriangle(x + 160, y + 84, x + 176, y + 46, x + 192, y + 84, ORANGE);
  fillTriangle(x + 190, y + 84, x + 204, y + 54, x + 218, y + 84, YELLOW);
  // smoke
  fillCircle(x + 120, y + 24, 11, SMOKE);
  fillCircle(x + 138, y + 14, 13, SMOKE);
  fillCircle(x + 180, y + 22, 10, SMOKE);
  // windows
  for (let i = 0; i < 4; i++) fillRect(x + 66 + i * 48, y + 108, 20, 24, [40, 34, 30]);
}
function artBank(x: number, y: number): void {
  fillRect(x, y, 314, 148, SKY);
  // bank building
  fillTriangle(x + 82, y + 52, x + 157, y + 22, x + 232, y + 52, [200, 196, 184]);
  fillRect(x + 92, y + 52, 130, 12, [200, 196, 184]);
  for (let i = 0; i < 4; i++) fillRect(x + 100 + i * 32, y + 64, 14, 56, [200, 196, 184]);
  fillRect(x + 84, y + 120, 146, 10, [200, 196, 184]);
  fillRect(x + 76, y + 130, 162, 8, [170, 164, 150]);
  drawText(x + 157, y + 32, "$", 3, [90, 84, 72], "center");
  // red slash across the building
  thickLine(x + 92, y + 128, x + 222, y + 30, 7, RED);
}

// ---- stories: verified 23 November 2026 ----
interface Story { tag: string; accent: RGB; headline: string; sub: string; art: (x: number, y: number) => void }
const STORIES: Story[] = [
  { tag: "CLIMATE", accent: TEAL, headline: "CLIMATE TALKS COLLAPSE", sub: "COP31 ENDS WITH NO DEAL ON FOSSIL FUELS", art: artGlobe },
  { tag: "WAR AT SEA", accent: [120, 190, 230], headline: "UKRAINE SINKS WARSHIP", sub: "RUSSIAN CORVETTE MERKURY SUNK OFF LIBYA", art: artShip },
  { tag: "MARKETS", accent: GREEN, headline: "HUANG IS BACK AT NVIDIA", sub: "SHARES +31%, NASDAQ +6% AS HUANG RETURNS", art: artChip },
  { tag: "UKRAINE", accent: ORANGE, headline: "15 KILLED IN STRIKES ON KYIV", sub: "RUSSIAN BOMBARDMENT HITS THE KYIV REGION", art: artKyiv },
  { tag: "DISASTER", accent: RED, headline: "24 KILLED IN FACTORY FIRE", sub: "BLAZE AT A SWEETS PLANT IN INDONESIA; ABOUT 30 MISSING", art: artFire },
  { tag: "SANCTIONS", accent: [196, 120, 200], headline: "US SANCTIONS IRAN BANKS", sub: "22 FIRMS, 8 PEOPLE; $14.7BN IN SHADOW BANKING FLAGGED", art: artBank },
];

function drawCard(x: number, y: number, w: number, h: number, s: Story, lead: boolean): void {
  fillRect(x, y, w, h, lead ? PANEL2 : PANEL);
  // border
  fillRect(x, y, w, 2, lead ? GOLD : EDGE);
  fillRect(x, y + h - 2, w, 2, lead ? GOLD : EDGE);
  fillRect(x, y, 2, h, lead ? GOLD : EDGE);
  fillRect(x + w - 2, y, 2, h, lead ? GOLD : EDGE);
  // picture
  s.art(x + 8, y + 8);
  // tag chip
  const tagW = textWidth(s.tag, 2) + 16;
  fillRect(x + 16, y + 16, tagW, 20, DARK);
  drawText(x + 24, y + 21, s.tag, 2, s.accent);
  if (lead) {
    const tw = textWidth("TOP STORY", 2) + 16;
    fillRect(x + w - 16 - tw, y + 16, tw, 20, GOLD);
    drawText(x + w - 8 - tw, y + 21, "TOP STORY", 2, DARK);
  }
  // headline, wrapped, centred
  const headLines = wrapText(s.headline, w - 32, 4);
  let hy = y + 172;
  for (const ln of headLines) {
    drawText(x + w / 2, hy, ln, 4, WHITE, "center");
    hy += 32;
  }
  // sub, wrapped, centred, muted
  const subLines = wrapText(s.sub, w - 32, 3);
  let sy = hy + 10;
  for (const ln of subLines) {
    drawText(x + w / 2, sy, ln, 3, MUTED, "center");
    sy += 24;
  }
}

// ---- composition ----
function drawPoster(): void {
  fillRect(0, 0, W, H, NAVY);
  // masthead
  fillRect(0, 0, W, 116, DARK);
  drawText(W / 2, 16, "THE WORLD IN ONE DAY", 3, GOLD, "center");
  drawText(W / 2, 48, "MONDAY 23 NOVEMBER 2026", 6, WHITE, "center");
  fillRect(24, 106, W - 48, 3, GOLD);
  // six stories, 3 x 2 grid
  const cw = 314, ch = 384;
  const xs = [24, 354, 684];
  const ys = [128, 524];
  for (let i = 0; i < 6; i++) {
    drawCard(xs[i % 3], ys[Math.floor(i / 3)], cw, ch, STORIES[i], i === 0);
  }
  // footer
  drawText(W / 2, 936, "SOURCES: REUTERS - AP - AFP - US TREASURY", 2, MUTED, "center");
  drawText(W / 2, 962, "ALL EVENTS OF MONDAY 23 NOVEMBER 2026", 2, MUTED, "center");
}

function main(): void {
  drawPoster();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, encodePNG());
  const stat = fs.statSync(outPath);
  console.log(`wrote ${outPath} ${stat.size} bytes, ${W}x${H}`);
}

main();
