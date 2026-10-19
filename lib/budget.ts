/** One named part of a month's budget ("Monthly budget", "New extra"). A month's budget is their sum. */
export type BudgetLine = { id: string; name: string; /** Whole MMK, > 0. */ amount: number };

/** Name of the first line when a month's budget is set up. */
export const DEFAULT_BUDGET_LINE_NAME = "Monthly budget";

/** Longest name a budget line can have. */
export const BUDGET_NAME_MAX = 32;

/** A stored `budget:YYYY-MM` value as lines; anything malformed is dropped. */
export function asLines(value: unknown): BudgetLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (l): l is BudgetLine =>
      !!l && typeof l.id === "string" && typeof l.name === "string" && Number.isInteger(l.amount) && l.amount > 0,
  );
}

/** Sum of the lines; `null` when there's no budget. */
export function budgetTotal(lines: BudgetLine[]): number | null {
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  return sum > 0 ? sum : null;
}

export type BudgetResult =
  | { kind: "none" }
  | { kind: "over" | "under" | "even"; amount: number; /** of the budget, 0–∞ */ pct: number; used: number };

/** Over/under a budget as an amount and a percentage of that budget. */
export function compareToBudget(spent: number, budget: number | null): BudgetResult {
  if (!budget) return { kind: "none" };
  const diff = spent - budget;
  const used = spent / budget;
  if (diff === 0) return { kind: "even", amount: 0, pct: 0, used };
  return { kind: diff > 0 ? "over" : "under", amount: Math.abs(diff), pct: Math.abs(diff) / budget, used };
}

export function formatPct(fraction: number): string {
  const p = fraction * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}
