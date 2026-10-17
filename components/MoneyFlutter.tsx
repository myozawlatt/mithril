import type { CSSProperties } from "react";

/**
 * 10,000 kyat notes (front and back scans in `public/notes/`) and ledgers,
 * still, tilted as if caught mid-fall. Part of the galaxy backdrop; nothing
 * animates.
 *
 * Two layouts: a phone one, and a wide one (≥ md) that frames the centred app
 * column from the side gutters. Sizes are random but drawn from a fixed seed,
 * so the prerendered shell and the client always match.
 */

type Kind = "front" | "back" | "ledger" | "ledger-open";
// left / top in % of the viewport; rz = spin, rx / ry = tilt in the air (deg).
type Spot = [kind: Kind, left: number, top: number, rz: number, rx?: number, ry?: number];

// A few big pieces rather than many small ones; most hang off an edge.
const PHONE: Spot[] = [
  ["front", -12, 5, -14, 25, -20],
  ["back", 50, 22, -24, 20, 30],
  ["ledger-open", -2, 44, -14, 35],
  ["ledger", 74, 55, 20, 0, 30],
  ["front", -22, 66, 22, 35, 10],
  ["back", 42, 84, 18, 30, -15],
];

const WIDE: Spot[] = [
  ["front", -3, 5, -16, 25, -20],
  ["ledger", 21, 30, 22, 0, 30],
  ["back", -6, 56, 28, 20, 35],
  ["ledger-open", 12, 82, -16, 40],
  ["back", 72, 2, 18, 30, 15],
  ["ledger-open", 74, 34, 14, 35],
  ["front", 76, 58, -22, 25, -30],
  ["ledger", 67, 86, -24, 20],
];

// Width range per kind, in units of --u (1rem on phones, up to 1.5rem on wide
// screens). Wide ranges so the random sizes clearly differ.
const WIDTH: Record<Kind, [number, number]> = {
  front: [9, 16],
  back: [9, 16],
  ledger: [4, 7.5],
  "ledger-open": [6, 11],
};

/** mulberry32: a tiny seeded PRNG, so "random" sizes are the same everywhere. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Item = { kind: Kind; style: CSSProperties };

function place(spots: Spot[], seed: number): Item[] {
  const random = seeded(seed);
  return spots.map(([kind, left, top, rz, rx = 0, ry = 0]) => {
    const [min, max] = WIDTH[kind];
    const size = random();
    return {
      kind,
      style: {
        left: `${left}%`,
        top: `${top}%`,
        "--w": (min + size * (max - min)).toFixed(2),
        // Smaller reads as farther away, so it is fainter too.
        "--o": (0.32 + size * 0.2).toFixed(2),
        "--rz": `${rz}deg`,
        "--rx": `${rx}deg`,
        "--ry": `${ry}deg`,
      } as CSSProperties,
    };
  });
}

// Seeds picked so the sizes come out well mixed (small next to big).
const PHONE_ITEMS = place(PHONE, 11008);
const WIDE_ITEMS = place(WIDE, 20648);

export default function MoneyFlutter() {
  return (
    <div className="money">
      <LedgerSymbols />
      <div className="absolute inset-0 md:hidden">
        <Items items={PHONE_ITEMS} />
      </div>
      <div className="absolute inset-0 hidden md:block">
        <Items items={WIDE_ITEMS} />
      </div>
    </div>
  );
}

function Items({ items }: { items: Item[] }) {
  return items.map(({ kind, style }, i) =>
    kind === "front" || kind === "back" ? (
      <span key={i} className={`money-item note note-${kind}`} style={style} />
    ) : (
      <span key={i} className="money-item" style={style}>
        <svg viewBox={kind === "ledger" ? "0 0 120 160" : "0 0 220 150"}>
          <use href={`#mithril-${kind}`} />
        </svg>
      </span>
    ),
  );
}

function LedgerSymbols() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        {/* Closed hardcover ledger with a blank label plate. */}
        <symbol id="mithril-ledger" viewBox="0 0 120 160">
          <rect x="8" y="6" width="108" height="150" rx="4" fill="#f6f1ff" stroke="#c9b8f2" />
          <g stroke="#d9ccf7">
            <line x1="111" y1="10" x2="111" y2="152" />
            <line x1="113.5" y1="10" x2="113.5" y2="152" />
          </g>
          <rect x="2" y="2" width="106" height="152" rx="5" fill="#b39ce9" stroke="#7c5cc4" />
          <rect x="2" y="2" width="20" height="152" rx="5" fill="#8467cf" />
          <g stroke="#e9e0ff" strokeWidth="1.5">
            <line x1="4" y1="22" x2="22" y2="22" />
            <line x1="4" y1="134" x2="22" y2="134" />
          </g>
          <polygon points="108,2 108,22 88,2" fill="#6d4fc0" />
          <polygon points="108,154 108,134 88,154" fill="#6d4fc0" />
          <rect x="36" y="40" width="60" height="36" rx="3" fill="#f6f1ff" stroke="#7c5cc4" />
          <line x1="46" y1="54" x2="86" y2="54" stroke="#8467cf" strokeWidth="3" strokeLinecap="round" />
          <line x1="50" y1="64" x2="82" y2="64" stroke="#b39ce9" strokeWidth="2" strokeLinecap="round" />
        </symbol>

        {/* Open ledger: ruled rows, rose money columns, pencilled entries. */}
        <symbol id="mithril-ledger-open" viewBox="0 0 220 150">
          <path d="M110 22 Q 58 10 2 16 L 2 148 Q 58 140 110 150 Q 162 140 218 148 L 218 16 Q 162 10 110 22 Z" fill="#9d84e0" />
          <path d="M110 18 Q 60 8 8 14 L 8 142 Q 60 136 110 146 Z" fill="#fbf8ff" stroke="#b9a5ee" />
          <path d="M110 18 Q 160 8 212 14 L 212 142 Q 160 136 110 146 Z" fill="#fbf8ff" stroke="#b9a5ee" />
          <g stroke="#d6c8f6" strokeWidth="0.8">
            {[40, 52, 64, 76, 88, 100, 112, 124].map((y) => (
              <g key={y}>
                <line x1="12" y1={y} x2="106" y2={y} />
                <line x1="114" y1={y} x2="208" y2={y} />
              </g>
            ))}
          </g>
          <g stroke="#8a6fd1" strokeWidth="1.4">
            <line x1="12" y1="28" x2="106" y2="28" />
            <line x1="114" y1="28" x2="208" y2="28" />
          </g>
          <g stroke="#e4a3c6" strokeWidth="0.9">
            <line x1="28" y1="22" x2="28" y2="134" />
            <line x1="76" y1="22" x2="76" y2="134" />
            <line x1="130" y1="22" x2="130" y2="134" />
            <line x1="178" y1="22" x2="178" y2="134" />
          </g>
          <g stroke="#b9a5ee" strokeWidth="2" strokeLinecap="round">
            <line x1="32" y1="36" x2="60" y2="36" />
            <line x1="32" y1="48" x2="68" y2="48" />
            <line x1="32" y1="60" x2="54" y2="60" />
            <line x1="134" y1="36" x2="166" y2="36" />
            <line x1="134" y1="48" x2="158" y2="48" />
          </g>
          <g stroke="#8a6fd1" strokeWidth="2" strokeLinecap="round">
            <line x1="86" y1="36" x2="102" y2="36" />
            <line x1="82" y1="48" x2="102" y2="48" />
            <line x1="84" y1="60" x2="102" y2="60" />
            <line x1="184" y1="36" x2="204" y2="36" />
            <line x1="190" y1="48" x2="204" y2="48" />
          </g>
          <line x1="110" y1="18" x2="110" y2="146" stroke="#c4b3f0" />
        </symbol>
      </defs>
    </svg>
  );
}
