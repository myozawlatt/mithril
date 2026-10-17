"use client";

import { useEffect, useRef, useState } from "react";
import { compareToBudget, formatPct, type BudgetResult } from "@/lib/budget";
import { currentMonth, formatCompact, formatMoney, formatNumber, monthLabel, monthShortLabel, type MonthKey } from "@/lib/format";
import { MASK, useAmountsHidden } from "@/lib/privacy";
import { useLabels, useMonthsSummary, useYearByLabel, type MonthSummary } from "@/lib/repo";
import EyeToggle from "./EyeToggle";
import FitNumber from "./FitNumber";
import LabelBar from "./LabelBar";

type Props = {
  /** The month open in the tracker; the report starts on its year. */
  month: MonthKey;
  onPick: (m: MonthKey) => void;
  onBack: () => void;
};

/** One year at a glance (totals, budget, top labels), then its months. Tap a month to open it. */
export default function MonthsSummaryView({ month, onPick, onBack }: Props) {
  const months = useMonthsSummary();
  const hidden = useAmountsHidden();
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));

  // Only years with expenses or budgets are offered, plus this year (and the one opened on).
  // (The months list fills gaps with empty months, so count only months with something in them.)
  const withData = new Set(months?.filter((m) => m.count || m.budget !== null).map((m) => Number(m.month.slice(0, 4))));
  const thisYear = Number(currentMonth().slice(0, 4));
  const years = [...new Set([...withData, thisYear, year])].sort((a, b) => a - b);
  const yearMonths = months?.filter((m) => m.month.startsWith(`${year}-`)) ?? [];

  return (
    <>
      <div className="flex h-11 items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to expenses"
          className="-ml-2 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-sm font-semibold text-accent-ink active:bg-white/60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Summary</h1>
        {/* The report's one switch: masks every amount on this screen (and app-wide). */}
        <span className="flex w-16 justify-end">
          <EyeToggle />
        </span>
      </div>

      {!months ? (
        <div className="glass h-40 animate-pulse rounded-[28px]" />
      ) : (
        <>
          <YearPicker year={year} years={years} months={months} hidden={hidden} onChange={setYear} />

          {/* Report body renders at Ramabhadra's real weight (no synthesized bold). */}
          {yearMonths.length === 0 ? (
            <p className="glass rounded-[28px] p-6 text-center text-sm text-muted">No expenses or budgets in {year}.</p>
          ) : (
            <div className="no-fake-bold flex flex-col gap-3">
              <YearCard year={String(year)} months={yearMonths} hidden={hidden} />
              <h2 className="mt-2 pl-1 text-xs font-medium uppercase tracking-[0.12em] text-muted">Months in {year}</h2>
              <ul className="flex flex-col gap-3">
                {yearMonths.map((m) => (
                  <li key={m.month}>
                    <MonthRow summary={m} hidden={hidden} onPick={onPick} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** ‹ 2026 › — arrows step through `years` (ascending); the year opens a menu to jump, like the month menu. */
function YearPicker({
  year,
  years,
  months,
  hidden,
  onChange,
}: {
  year: number;
  years: number[];
  months: MonthSummary[];
  hidden: boolean;
  onChange: (y: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const i = years.indexOf(year);
  const prev = years[i - 1];
  const next = years[i + 1];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (y: number) => {
    setOpen(false);
    onChange(y);
  };

  return (
    // The menu sits outside the glass bar: its backdrop blur would trap the
    // fixed backdrop, and the cards below would paint over the menu.
    <div className="relative z-30">
      <div className="glass flex h-12 items-center justify-between rounded-2xl px-1">
        <StepButton label="Previous year" dir="left" disabled={prev === undefined} onClick={() => onChange(prev)} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${year}, choose year`}
          className="flex h-10 items-center gap-1.5 rounded-xl px-4 transition active:bg-white/60"
        >
          <span className="text-lg font-semibold tabular-nums tracking-tight">{year}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <StepButton label="Next year" dir="right" disabled={next === undefined} onClick={() => onChange(next)} />
      </div>

      {/* Catches the outside tap so it closes the menu without also hitting the card beneath. */}
      {open && <div className="fixed inset-0" aria-hidden onClick={() => setOpen(false)} />}
      {open && <YearMenu year={year} years={years} months={months} hidden={hidden} onPick={pick} />}
    </div>
  );
}

/** Newest year first; each row shows what was spent and a budget dot, like the month menu. */
function YearMenu({
  year,
  years,
  months,
  hidden,
  onPick,
}: {
  year: number;
  years: number[];
  months: MonthSummary[];
  hidden: boolean;
  onPick: (y: number) => void;
}) {
  const now = Number(currentMonth().slice(0, 4));
  const listRef = useRef<HTMLUListElement>(null);

  // Bring the selected year into view when the menu opens.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div className="animate-fade absolute top-full left-1/2 z-10 mt-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl shadow-violet-900/15 backdrop-blur-xl">
      <ul ref={listRef} role="menu" aria-label="Choose year" className="max-h-[min(60vh,22rem)] overflow-y-auto py-1.5">
        {[...years].reverse().map((y) => {
          const selected = y === year;
          const inYear = months.filter((m) => m.month.startsWith(`${y}-`));
          const spent = inYear.reduce((sum, m) => sum + m.spent, 0);
          const budgeted = inYear.filter((m) => m.budget !== null);
          const result = compareToBudget(
            budgeted.reduce((sum, m) => sum + m.spent, 0),
            budgeted.reduce((sum, m) => sum + (m.budget ?? 0), 0) || null,
          );
          const dot =
            result.kind === "over" ? "bg-rose-500" : result.kind === "none" ? "bg-slate-300" : "bg-emerald-500";
          return (
            <li key={y}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => onPick(y)}
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
                <span className={`min-w-0 flex-1 truncate whitespace-nowrap tabular-nums ${selected ? "font-semibold" : "font-medium"}`}>
                  {y}
                  {y === now && <span className="ml-1.5 text-xs font-medium text-muted">· now</span>}
                </span>
                <span className="text-xs text-muted tabular-nums">{!spent ? "—" : hidden ? "•••" : formatCompact(spent)}</span>
                <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StepButton({ label, dir, disabled, onClick }: { label: string; dir: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full text-accent-ink transition active:bg-white/60 disabled:text-violet-200"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

/**
 * The year's report. Budget is compared only over months that had one, so a
 * month without a budget never counts as money saved.
 */
function YearCard({ year, months, hidden }: { year: string; months: MonthSummary[]; hidden: boolean }) {
  const byLabel = useYearByLabel(year);
  const labels = useLabels();
  const amount = (n: number) => (hidden ? MASK : formatNumber(n));

  const spent = months.reduce((s, m) => s + m.spent, 0);
  const budgeted = months.filter((m) => m.budget !== null);
  const budget = budgeted.reduce((s, m) => s + (m.budget ?? 0), 0);
  const result = compareToBudget(
    budgeted.reduce((s, m) => s + m.spent, 0),
    budget || null,
  );
  const overCount = budgeted.filter((m) => m.spent > (m.budget ?? 0)).length;
  const average = months.length ? Math.round(spent / months.length) : 0;
  const highest = months.reduce<MonthSummary | null>((top, m) => (m.spent > (top?.spent ?? 0) ? m : top), null);
  const inProgress = currentMonth().startsWith(year);

  return (
    // Same layout as the tracker's SummaryCard, without its budget ring.
    <section aria-label={`${year} summary`} className="glass rounded-[28px] p-5">
      <div className="@container min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Spent in {year} · MMK
          {inProgress && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-accent-ink">
              So far
            </span>
          )}
        </p>
        {hidden ? (
          // Same height as the number, so revealing it doesn't shift the card.
          <p className="fake-bold mt-1.5 flex h-9 items-center text-2xl font-semibold tracking-[0.2em] text-ink" aria-label="Spent amount hidden">
            {MASK}
          </p>
        ) : (
          <FitNumber text={formatNumber(spent)} maxRem={2.25} className="fake-bold mt-1.5 tabular-nums" />
        )}

        {result.kind === "none" ? (
          <p className="mt-2.5 text-[13px] text-muted">No budgets set in {year}</p>
        ) : (
          // Budget counts only the months that had one.
          <p className="mt-2.5 text-[13px] leading-snug">
            <span className="block truncate text-muted">
              Budget{" "}
              <span className="text-ink" aria-label={hidden ? "hidden" : undefined}>
                {amount(budget)}
              </span>
              {budgeted.length < months.length && ` · ${budgeted.length} of ${months.length} months`}
            </span>
            <span className={`block truncate ${result.kind === "over" ? "text-rose-800" : "text-muted"}`}>
              {result.kind === "over"
                ? `Over by ${amount(result.amount)}`
                : result.kind === "under"
                  ? `${amount(result.amount)} left`
                  : "Exactly on budget"}
            </span>
          </p>
        )}
      </div>

      {byLabel && labels && byLabel.length > 0 && <LabelBar slices={byLabel} total={spent} labels={labels.byId} />}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-violet-100/80 pt-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Avg / month</dt>
          <dd className="truncate font-semibold tabular-nums">{amount(average)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Highest</dt>
          <dd className="truncate font-semibold tabular-nums">
            {highest ? `${monthShortLabel(highest.month)} · ${amount(highest.spent)}` : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Over budget</dt>
          <dd className={`truncate font-semibold ${!budgeted.length ? "" : overCount ? "text-rose-800" : "text-emerald-800"}`}>
            {budgeted.length ? `${overCount} of ${budgeted.length} mo` : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MonthRow({ summary, hidden, onPick }: { summary: MonthSummary; hidden: boolean; onPick: (m: MonthKey) => void }) {
  const { month, spent, budget, count } = summary;
  const result = compareToBudget(spent, budget);
  const inProgress = month === currentMonth();

  return (
    <button
      type="button"
      onClick={() => onPick(month)}
      aria-label={`${monthLabel(month)}: ${describe(result, spent, hidden)}. Open month.`}
      className="glass flex w-full flex-col gap-3 rounded-3xl p-4 text-left transition active:scale-[0.99]"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold whitespace-nowrap">
            {monthLabel(month)}
            {inProgress && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">In progress</span>
            )}
          </span>
          <span className="block text-xs text-muted">
            {count ? `${count} ${count === 1 ? "expense" : "expenses"}` : "No expenses"}
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>

      {/* Spans only: a button may hold phrasing content, not div/dl/p. */}
      <span className="grid w-full grid-cols-2 gap-3 text-sm">
        <span className="min-w-0">
          <span className="block text-xs text-muted">Budget</span>
          <span className="block truncate font-semibold tabular-nums">{!budget ? "—" : hidden ? `MMK ${MASK}` : formatMoney(budget)}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted">Spent</span>
          <span className="block truncate font-semibold tabular-nums">{hidden ? `MMK ${MASK}` : formatMoney(spent)}</span>
        </span>
      </span>

      {result.kind !== "none" && (
        // Meter: track is a lighter step of the fill's ramp; fill turns rose once over.
        <span className="block h-2 w-full overflow-hidden rounded-full bg-accent-soft">
          <span
            className={`block h-full rounded-full ${result.kind === "over" ? "bg-rose-500" : "bg-violet-500"}`}
            style={{ width: `${Math.min(1, result.used) * 100}%` }}
          />
        </span>
      )}

      <Status result={result} inProgress={inProgress} hidden={hidden} />
    </button>
  );
}

/** Status colour always rides with an arrow and words, never colour alone. */
function Status({ result, inProgress, hidden }: { result: BudgetResult; inProgress: boolean; hidden: boolean }) {
  if (result.kind === "none") return <span className="text-sm text-muted">No budget set</span>;
  if (result.kind === "even") return <span className="text-sm font-semibold text-ink">Exactly on budget</span>;

  const over = result.kind === "over";
  return (
    <span
      className={`flex w-full items-baseline justify-between gap-2 text-sm font-semibold ${
        over ? "text-rose-800" : "text-emerald-800"
      }`}
    >
      <span>
        {over ? "▲ Over" : "▼ Under"} by {hidden ? `MMK ${MASK}` : formatMoney(result.amount)}
        {inProgress && !over && <span className="font-medium text-muted"> so far</span>}
      </span>
      <span className="tabular-nums">{formatPct(result.pct)}</span>
    </span>
  );
}

function describe(result: BudgetResult, spent: number, hidden: boolean): string {
  const spentText = hidden ? "spent amount hidden" : `spent ${formatMoney(spent)}`;
  if (result.kind === "none") return `${spentText}, no budget`;
  if (result.kind === "even") return `${spentText}, exactly on budget`;
  const gap = hidden ? "" : ` by ${formatMoney(result.amount)}`;
  return `${spentText}, ${result.kind} budget${gap} (${formatPct(result.pct)})`;
}
