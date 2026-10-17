// Renders the PWA icons into public/icons and public/favicon.ico. Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = new URL("../public/icons/", import.meta.url);
await mkdir(out, { recursive: true });

const C = 256;
const at = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

const ink = `stroke="#151a2e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
/** Glyphs cut into the tablets, centred on (x, y). */
const CARVINGS = [
  (x, y) => `<circle cx="${x}" cy="${y}" r="9" ${ink}/><circle cx="${x}" cy="${y}" r="2.5" fill="#151a2e"/>`,
  (x, y) => `<path d="M${x - 9} ${y + 8} L${x} ${y - 9} L${x + 9} ${y + 8}" ${ink}/>`,
  (x, y) => `<path d="M${x - 9} ${y - 7} h18 M${x - 9} ${y} h18 M${x - 9} ${y + 7} h18" ${ink}/>`,
];

/** Carved stone tablets around the vault door, like a sun dial. */
function tablets() {
  let s = "";
  for (let i = 0; i < 12; i++) {
    const deg = i * 30;
    s += `<g transform="rotate(${deg} ${C} ${C})">
      <rect x="${C - 19}" y="${C - 176}" width="38" height="52" rx="10" fill="url(#stone)" stroke="#5b6585" stroke-width="3"/>
      ${CARVINGS[i % CARVINGS.length](C, C - 150)}
    </g>`;
  }
  return s;
}

/** A pile of coins inside the door, lit from within. */
function hoard() {
  const coins = [
    // [x, y, r] back to front
    [196, 286, 24], [256, 276, 24], [316, 286, 24],
    [168, 306, 26], [226, 300, 26], [286, 300, 26], [344, 306, 26],
    [152, 330, 28], [204, 324, 28], [256, 322, 28], [308, 324, 28], [360, 330, 28],
    [178, 352, 30], [234, 348, 30], [290, 348, 30], [340, 354, 30],
  ];
  return coins
    .map(
      ([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.42}" fill="url(#coin)" stroke="#9a6614" stroke-width="3"/>
        <ellipse cx="${x}" cy="${y - 2}" rx="${r * 0.62}" ry="${r * 0.24}" fill="none" stroke="#fff3c4" stroke-width="2" opacity="0.55"/>`,
    )
    .join("");
}

/** Sparkle: a four-point star. */
const star = (x, y, r, o) =>
  `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="#fff7d6" opacity="${o}"/>`;

/** Outer radius of the white rim: the edge of the whole mark at scale 1. */
const EDGE = 236;

/**
 * The vault door in a white rim, centred on a 512 canvas, scaled by `s`.
 * `detail: false` drops the carvings and sparkles for favicon sizes.
 */
function glyph(s, detail) {
  const [gx, gy] = at(0, 0);
  return `
    <g transform="translate(${C} ${C}) scale(${s}) translate(${-C} ${-C})">
      <circle cx="${C}" cy="${C}" r="${EDGE}" fill="#fff"/>
      <circle cx="${C}" cy="${C}" r="${EDGE - 1}" fill="none" stroke="#d9dde8" stroke-width="2"/>
      <circle cx="${C}" cy="${C}" r="196" fill="url(#stone)"/>
      <circle cx="${C}" cy="${C}" r="196" fill="none" stroke="url(#bronze)" stroke-width="22"/>
      <circle cx="${C}" cy="${C}" r="184" fill="none" stroke="#3a2412" stroke-width="2" opacity="0.6"/>
      ${detail ? tablets() : ""}
      <circle cx="${C}" cy="${C}" r="118" fill="none" stroke="url(#rim)" stroke-width="16"/>
      <circle cx="${C}" cy="${C}" r="110" fill="url(#glow)"/>
      <g clip-path="url(#inside)">
        ${hoard()}
        <circle cx="${gx}" cy="${gy + 36}" r="38" fill="url(#coin)" stroke="#9a6614" stroke-width="4"/>
        <circle cx="${gx}" cy="${gy + 36}" r="23" fill="url(#gem)" stroke="#e9b949" stroke-width="4"/>
        <ellipse cx="${gx - 7}" cy="${gy + 28}" rx="7" ry="5" fill="#fff" opacity="0.75"/>
      </g>
      ${detail ? star(212, 206, 16, 0.9) + star(304, 222, 9, 0.7) : ""}
    </g>`;
}

/** `background`: a fill for platforms that need an opaque square, else transparent. */
function svg({ background, scale, detail = true }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="stone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3d4766"/>
        <stop offset="1" stop-color="#1e2540"/>
      </linearGradient>
      <linearGradient id="bronze" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e2a564"/>
        <stop offset="0.5" stop-color="#a8682f"/>
        <stop offset="1" stop-color="#5e3517"/>
      </linearGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6b7496"/>
        <stop offset="1" stop-color="#2b3250"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.78" r="0.8">
        <stop offset="0" stop-color="#ffd977"/>
        <stop offset="0.4" stop-color="#b8741c"/>
        <stop offset="1" stop-color="#2a1708"/>
      </radialGradient>
      <linearGradient id="coin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe08a"/>
        <stop offset="1" stop-color="#d1931f"/>
      </linearGradient>
      <radialGradient id="gem" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#8ec3ff"/>
        <stop offset="0.5" stop-color="#2652d9"/>
        <stop offset="1" stop-color="#0b1a66"/>
      </radialGradient>
      <clipPath id="inside"><circle cx="${C}" cy="${C}" r="110"/></clipPath>
    </defs>
    ${background ? `<rect width="512" height="512" fill="${background}"/>` : ""}
    ${glyph(scale, detail)}
  </svg>`);
}

// Fills the canvas, with a hair of margin for anti-aliasing.
const FULL = 254 / EDGE;

const jobs = [
  // Browser tabs and the "any" manifest icons: the round mark alone, no tile.
  { file: "icon-192.png", size: 192, scale: FULL },
  { file: "icon-512.png", size: 512, scale: FULL },
  // Maskable: full-bleed white, mark inside the 80% safe zone (radius 204).
  { file: "icon-maskable-512.png", size: 512, background: "#fff", scale: 200 / EDGE },
  // iOS rounds corners itself and needs an opaque square.
  { file: "apple-touch-icon.png", size: 180, background: "#fff", scale: 226 / EDGE },
];

for (const j of jobs) {
  await sharp(svg(j)).resize(j.size, j.size).png().toFile(fileURLToPath(new URL(j.file, out)));
  console.log("wrote", j.file);
}

// favicon.ico: PNG entries (16, 32, 48) in an ICO container, same mark as above.
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((n) => sharp(svg({ scale: FULL, detail: n > 32 })).resize(n, n).png().toBuffer()),
);
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2); // type: icon
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n, e);
  head.writeUInt8(n, e + 1);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
await writeFile(fileURLToPath(new URL("../favicon.ico", out)), Buffer.concat([head, ...pngs]));
console.log("wrote favicon.ico");
