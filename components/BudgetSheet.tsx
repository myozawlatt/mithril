"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet";
import { DEFAULT_BUDGET_LINE_NAME, type BudgetLine } from "@/lib/budget";
import { formatNumber, monthLabel, parseAmount, type MonthKey } from "@/lib/format";
import { newId, setBudget } from "@/lib/repo";

type Props = {
  open: boolean;
  onClose: () => void;
  month: MonthKey;
  /** The month's saved lines; `[]` when it has no budget. */
  lines: BudgetLine[];
};

export default function BudgetSheet({ open, onClose, month, lines }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={`Budget · ${monthLabel(month)}`}>
      {open && <BudgetForm key={month} month={month} saved={lines} onDone={onClose} />}
    </Sheet>
  );
}

/** A line as typed: the amount stays formatted text until save. */
type Draft = { id: string; name: string; amount: string };

function BudgetForm({ month, saved, onDone }: { month: MonthKey; saved: BudgetLine[]; onDone: () => void }) {
  // First setup starts with one line under the default name.
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    saved.length
      ? saved.map((l) => ({ id: l.id, name: l.name, amount: formatNumber(l.amount) }))
      : [{ id: newId(), name: DEFAULT_BUDGET_LINE_NAME, amount: "" }],
  );
  // Which input to focus after render: the first amount on open, a new line's name after adding.
  // useRef evaluates this on every render, and lines can all be removed, so guard drafts[0].
  const focus = useRef<{ id: string; field: "name" | "amount" } | null>(
    saved.length || !drafts[0] ? null : { id: drafts[0].id, field: "amount" },
  );
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const target = focus.current;
    if (!target) return;
    focus.current = null;
    // Wait for the slide-in so iOS keeps the sheet in view.
    const t = setTimeout(() => {
      listRef.current?.querySelector<HTMLInputElement>(`[data-line="${target.id}"][data-field="${target.field}"]`)?.focus();
    }, 120);
    return () => clearTimeout(t);
  }, [drafts.length]);

  const total = drafts.reduce((s, d) => s + parseAmount(d.amount), 0);

  const edit = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  // Removing the only line of a month with no budget leaves nothing to set up, so close.
  // With a saved budget, an empty list stays open to offer "Remove budget".
  function remove(id: string) {
    const rest = drafts.filter((d) => d.id !== id);
    if (!rest.length && !saved.length) return onDone();
    setDrafts(rest);
  }

  function add() {
    const id = newId();
    focus.current = { id, field: "name" };
    setDrafts((ds) => [...ds, { id, name: "", amount: "" }]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await setBudget(
      month,
      drafts.map((d) => ({ id: d.id, name: d.name, amount: parseAmount(d.amount) })),
    );
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <ul ref={listRef} className="-mx-1 flex max-h-[45vh] flex-col gap-2 overflow-y-auto px-1 py-1">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <input
              data-line={d.id}
              data-field="name"
              value={d.name}
              onChange={(e) => edit(d.id, { name: e.target.value })}
              placeholder="e.g. New extra"
              maxLength={32}
              enterKeyHint="next"
              autoCapitalize="words"
              aria-label="Budget name"
              className="h-12 min-w-0 flex-1 rounded-2xl bg-accent-soft/70 px-4 text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted focus:ring-2 focus:ring-violet-300"
            />
            <label className="flex h-12 w-36 shrink-0 items-center gap-1.5 rounded-2xl bg-accent-soft/70 px-3 focus-within:ring-2 focus-within:ring-violet-300">
              <span className="text-xs font-medium text-muted">MMK</span>
              <input
                data-line={d.id}
                data-field="amount"
                value={d.amount}
                onChange={(e) => {
                  const n = parseAmount(e.target.value);
                  edit(d.id, { amount: n ? formatNumber(n) : "" });
                }}
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="0"
                aria-label={`${d.name || "Budget"} amount in MMK`}
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-semibold tabular-nums text-ink outline-none placeholder:text-muted"
              />
            </label>
            <button
              type="button"
              onClick={() => remove(d.id)}
              aria-label={`Remove ${d.name || "line"}`}
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition active:bg-accent-soft"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="-mt-1 h-11 rounded-2xl border border-dashed border-violet-300 text-sm font-semibold text-accent-ink transition active:bg-accent-soft"
      >
        + Add line
      </button>

      <div className="flex items-baseline justify-between border-t border-violet-100/80 px-1 pt-3">
        <span className="text-sm font-medium text-muted">Total</span>
        <span className="text-lg font-semibold tabular-nums text-ink">MMK {formatNumber(total)}</span>
      </div>

      <button
        type="submit"
        disabled={!total && !saved.length}
        className="h-14 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98] disabled:bg-accent-soft disabled:text-muted disabled:shadow-none"
      >
        {total || !saved.length ? "Save budget" : "Remove budget"}
      </button>
    </form>
  );
}
