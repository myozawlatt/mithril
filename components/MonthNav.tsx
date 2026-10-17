"use client";

import { useEffect, useRef, useState } from "react";
import { compareToBudget } from "@/lib/budget";
import { currentMonth, formatCompact, monthLabel, shiftMonth, type MonthKey } from "@/lib/format";
import { useAmountsHidden } from "@/lib/privacy";
import { useMonthsSummary } from "@/lib/repo";

type Props = {
  month: MonthKey;
  onMonthChange: (m: MonthKey) => void;
  /** Adds a "Summary" entry at the foot of the menu. */
  onOpenSummary?: () => void;
};

/** ‹ October 2026 › — the name opens a menu of every month to jump to. */
export default function MonthNav({ month, onMonthChange, onOpenSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [name, year] = monthLabel(month).split(" ");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (m: MonthKey) => {
    setOpen(false);
    onMonthChange(m);
  };

  return (
    <div className="relative flex items-center">
      <NavButton label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))} dir="left" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${monthLabel(month)}, choose month`}
        className="min-w-26 rounded-xl px-1 text-left transition active:bg-white/60"
      >
        <span className="block text-lg font-semibold leading-tight tracking-tight">{name}</span>
        <span className="flex items-center gap-1 text-xs font-medium text-muted">
          {year}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <NavButton label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))} dir="right" />

      {/* Catches the outside tap so it closes the menu without also hitting the row beneath. */}
      {open && <div className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />}
      {open && (
        <MonthMenu
          month={month}
          onPick={pick}
          onOpenSummary={
            onOpenSummary &&
            (() => {
              setOpen(false);
              onOpenSummary();
            })
          }
        />
      )}
    </div>
  );
}

function MonthMenu({
  month,
  onPick,
  onOpenSummary,
}: {
  month: MonthKey;
  onPick: (m: MonthKey) => void;
  onOpenSummary?: () => void;
}) {
  const months = useMonthsSummary();
  const hidden = useAmountsHidden();
  const now = currentMonth();
  const listRef = useRef<HTMLUListElement>(null);

  // Bring the selected month into view when the menu opens.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
  }, [months]);

  return (
    <div className="animate-fade absolute top-full left-0 z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl shadow-violet-900/15 backdrop-blur-xl">
      <ul ref={listRef} role="menu" aria-label="Choose month" className="max-h-[min(60vh,22rem)] overflow-y-auto py-1.5">
        {months?.map((s) => {
          const selected = s.month === month;
          const result = compareToBudget(s.spent, s.budget);
          const dot =
            result.kind === "over" ? "bg-rose-500" : result.kind === "none" ? "bg-slate-300" : "bg-emerald-500";
          return (
            <li key={s.month}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => onPick(s.month)}
                className={`flex h-11 w-full items-center gap-3 px-4 text-left text-sm transition active:bg-violet-50 ${
                  selected ? "bg-accent-soft/70" : ""
                }`}
              >
                <span className="w-4 shrink-0 text-accent-ink" aria-hidden>
                  {selected && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </span>
                <span className={`min-w-0 flex-1 truncate whitespace-nowrap ${selected ? "font-semibold" : "font-medium"}`}>
                  {monthLabel(s.month)}
                  {s.month === now && <span className="ml-1.5 text-xs font-medium text-muted">· now</span>}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {!s.spent ? "—" : hidden ? "•••" : formatCompact(s.spent)}
                </span>
                <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {onOpenSummary && (
        <button
          type="button"
          onClick={onOpenSummary}
          className="flex h-12 w-full items-center gap-3 border-t border-violet-100 px-4 text-sm font-semibold text-accent-ink active:bg-violet-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          Summary
        </button>
      )}
    </div>
  );
}

function NavButton({ label, onClick, dir }: { label: string; onClick: () => void; dir: "left" | "right" }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full text-muted transition active:bg-white/60"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
