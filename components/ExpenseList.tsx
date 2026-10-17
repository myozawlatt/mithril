import type { Expense, Label } from "@/lib/db";
import { dayLabel, formatMoney, formatNumber } from "@/lib/format";
import { labelInitials, labelOrFallback } from "@/lib/labels";
import SwipeRow from "./SwipeRow";

type Props = {
  expenses: Expense[];
  labels: Map<string, Label>;
  onSelect: (e: Expense) => void;
  onDelete: (e: Expense) => void;
};

export default function ExpenseList({ expenses, labels, onSelect, onDelete }: Props) {
  const groups: { date: string; items: Expense[]; total: number }[] = [];
  for (const e of expenses) {
    const last = groups[groups.length - 1];
    if (last?.date === e.date) {
      last.items.push(e);
      last.total += e.amount;
    } else {
      groups.push({ date: e.date, items: [e], total: e.amount });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.date}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            {/* Ink, not muted: these sit on the drifting smoke and must stay ≥7:1 as it moves. */}
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">{dayLabel(g.date)}</h3>
            <span className="text-xs font-medium text-ink">{formatNumber(g.total)}</span>
          </div>
          <ul className="glass no-fake-bold overflow-hidden rounded-3xl">
            {g.items.map((e, i) => {
              const l = labelOrFallback(labels, e.labelId);
              return (
                <li key={e.id} className={i > 0 ? "border-t border-violet-100/70" : undefined}>
                  <SwipeRow onTap={() => onSelect(e)} onDelete={() => onDelete(e)}>
                    {/* Colour lives in the tint; the initials stay ink so they always read. */}
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-2xl text-[13px] font-bold text-ink"
                      style={{ background: `${l.color}38` }}
                      aria-hidden
                    >
                      {labelInitials(l.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{e.note || l.name}</span>
                      {e.note && <span className="block truncate text-xs text-muted">{l.name}</span>}
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMoney(e.amount)}</span>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
