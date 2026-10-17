import type { Label } from "./db";

/**
 * Categorical slots, assigned to labels in creation order and never cycled.
 * Validated for colour-vision deficiency (adjacent ΔE ≥ 8.9) on the card surface;
 * several are < 3:1 contrast, so label names always appear as text beside them.
 */
export const LABEL_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#6366f1",
  "#f43f5e",
  "#14b8a6",
];

/** Labels past the eighth share one neutral; their names carry identity. */
export const EXTRA_LABEL_COLOR = "#64748b";

export function labelColorAt(index: number): string {
  return LABEL_COLORS[index] ?? EXTRA_LABEL_COLOR;
}

/** Trim and collapse inner whitespace; keeps the user's casing. */
export function cleanLabelName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 32);
}

/** Identity used for upserts: "  coffee " and "Coffee" are the same label. */
export function labelKey(name: string): string {
  return cleanLabelName(name).toLowerCase();
}

const FALLBACK: Pick<Label, "name" | "color"> = { name: "Unlabelled", color: "#94a3b8" };

export function labelOrFallback(labels: Map<string, Label> | undefined, id: string) {
  return labels?.get(id) ?? FALLBACK;
}

/**
 * One or two letters for the avatar: "Phone top-up" → "PT", "Coffee" → "Co".
 * Non-Latin names take their first letter with all the marks that follow it
 * (Burmese "ကော်ဖီ" → "ကော်"). Unicode grapheme rules split Myanmar syllables
 * mid-vowel, so the marks are matched directly instead.
 */
export function labelInitials(name: string): string {
  if (!/^\p{Script=Latin}/u.test(name)) {
    return name.match(/^\P{M}\p{M}*/u)?.[0] ?? "";
  }
  const words = name.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}
