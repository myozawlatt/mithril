import type { Label } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { labelOrFallback } from "@/lib/labels";

export type Slice = { labelId: string; amount: number };

const MAX_SLICES = 5;
const OTHER = { name: "Other", color: "#cbd5e1" };

function percent(part: number, total: number): string {
  const p = (part / total) * 100;
  return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

/** One stacked bar + compact legend. Top labels by spend, the rest folded into "Other". */
export default function LabelBar({
  slices,
  total,
  labels,
}: {
  slices: Slice[];
  total: number;
  labels: Map<string, Label>;
}) {
  const head = slices.slice(0, MAX_SLICES).map((s) => ({ key: s.labelId, amount: s.amount, ...labelOrFallback(labels, s.labelId) }));
  const restAmount = slices.slice(MAX_SLICES).reduce((sum, s) => sum + s.amount, 0);
  const rows = restAmount > 0 ? [...head, { key: "__other", amount: restAmount, ...OTHER }] : head;

  return (
    <div className="mt-5">
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" role="img" aria-label="Spending by label">
        {rows.map((r) => (
          <div
            key={r.key}
            className="h-full rounded-full transition-[flex-grow] duration-500"
            style={{ flexGrow: r.amount, flexBasis: 0, minWidth: 6, background: r.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="max-w-[9rem] truncate font-medium text-ink">{r.name}</span>
            <span>{percent(r.amount, total)}</span>
            <span className="sr-only">, {formatNumber(r.amount)} MMK</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
