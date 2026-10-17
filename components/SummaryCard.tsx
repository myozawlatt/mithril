"use client";

import { formatNumber } from "@/lib/format";
import type { Label } from "@/lib/db";
import { MASK, useAmountsHidden } from "@/lib/privacy";
import EyeToggle from "./EyeToggle";
import FitNumber from "./FitNumber";
import LabelBar, { type Slice } from "./LabelBar";

type Props = {
  total: number;
  budget: number | null;
  slices: Slice[];
  labels: Map<string, Label>;
  onEditBudget: () => void;
  onOpenSummary: () => void;
};

export default function SummaryCard({ total, budget, slices, labels, onEditBudget, onOpenSummary }: Props) {
  const hidden = useAmountsHidden();
  const ratio = budget ? total / budget : 0;
  const over = budget !== null && total > budget;

  return (
    <section className="glass rounded-[28px] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="@container min-w-0 flex-1">
          <div className="-my-1.5 flex items-center gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Spent · MMK</p>
            {/* The one switch: masks both spent and budget. */}
            <EyeToggle />
          </div>
          {hidden ? (
            // Same height as the number, so revealing it doesn't shift the card.
            <p className="mt-1.5 flex h-9 items-center text-2xl font-semibold tracking-[0.2em] text-ink" aria-label="Spent amount hidden">
              {MASK}
            </p>
          ) : (
            <FitNumber text={formatNumber(total)} maxRem={2.25} className="mt-1.5" />
          )}

          {budget === null ? (
            <button
              type="button"
              onClick={onEditBudget}
              className="mt-3 -ml-1 rounded-lg px-1 py-0.5 text-left text-sm font-medium text-muted transition active:bg-white/60"
            >
              + Set a budget for this month
            </button>
          ) : (
            // One compact block: the "Spent · MMK" heading already names the currency.
            <button
              type="button"
              onClick={onEditBudget}
              className="mt-2.5 -ml-1 block rounded-lg px-1 py-0.5 text-left text-[13px] leading-snug transition active:bg-white/60"
            >
              <span className="block truncate text-muted">
                Budget{" "}
                <span className="text-ink" aria-label={hidden ? "hidden" : undefined}>
                  {hidden ? MASK : formatNumber(budget)}
                </span>
              </span>
              <span className={`block truncate ${over ? "text-rose-800" : "text-muted"}`}>
                {over
                  ? `Over by ${hidden ? MASK : formatNumber(total - budget)}`
                  : `${hidden ? MASK : formatNumber(budget - total)} left`}
              </span>
            </button>
          )}
        </div>

        {budget !== null && (
          <button type="button" onClick={onEditBudget} aria-label="Edit budget" className="shrink-0">
            <Ring ratio={ratio} over={over} />
          </button>
        )}
      </div>

      {slices.length > 0 && (
        <>
          <LabelBar slices={slices} total={total} labels={labels} />
          <button
            type="button"
            onClick={onOpenSummary}
            className="mt-4 -mb-1 flex h-11 w-full items-center justify-between border-t border-violet-100/80 pt-1 text-sm font-semibold text-accent-ink transition active:opacity-60"
          >
            Summary
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}

function Ring({ ratio, over }: { ratio: number; over: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const progress = Math.min(ratio, 1);
  const pct = Math.round(ratio * 100);

  return (
    <div className="relative grid size-18 place-items-center">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <circle cx="38" cy="38" r={r} fill="none" stroke="#ede4ff" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={over ? "#f43f5e" : "url(#ring)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.2,0.9,0.25,1)" }}
        />
      </svg>
      <span className={`text-[13px] font-semibold ${over ? "text-rose-800" : "text-ink"}`}>{pct}%</span>
    </div>
  );
}
