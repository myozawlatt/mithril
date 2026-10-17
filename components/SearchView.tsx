"use client";

import { useDeferredValue, useState } from "react";
import ExpenseList from "./ExpenseList";
import type { Expense, Label } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { useSearch } from "@/lib/repo";

type Props = {
  labels: Map<string, Label>;
  onClose: () => void;
  onSelect: (e: Expense) => void;
  onDelete: (e: Expense) => void;
};

/** Search every month by note, label or amount. Results stay live while editing. */
export default function SearchView({ labels, onClose, onSelect, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = useSearch(deferred);
  const q = query.trim();
  const total = results?.reduce((sum, e) => sum + e.amount, 0) ?? 0;

  return (
    <>
      <div className="sticky top-2 z-30 flex items-center gap-2">
        <label className="glass flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl pr-1.5 pl-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (query) setQuery("");
              else onClose();
            }}
            placeholder="Note, label or amount"
            enterKeyHint="search"
            aria-label="Search expenses"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted active:bg-white/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </label>
        <button type="button" onClick={onClose} className="h-12 shrink-0 px-2 text-sm font-semibold text-accent-ink">
          Cancel
        </button>
      </div>

      {!q ? (
        <p className="pt-10 text-center text-sm text-muted">Search all months by note, label or amount.</p>
      ) : results === undefined ? null : results.length === 0 ? (
        <p className="pt-10 text-center text-sm text-muted">No expenses match “{q}”.</p>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            <span className="font-semibold text-ink">{results.length}</span> {results.length === 1 ? "expense" : "expenses"} ·{" "}
            <span className="font-semibold text-ink">{formatMoney(total)}</span>
          </p>
          <ExpenseList expenses={results} labels={labels} onSelect={onSelect} onDelete={onDelete} />
        </>
      )}
    </>
  );
}
