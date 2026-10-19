"use client";

import { useId, useMemo } from "react";
import type { Label } from "@/lib/db";
import { LABEL_MAX, labelKey } from "@/lib/labels";
import type { LabelIndex } from "@/lib/repo";
import CharCount from "./CharCount";

type Props = {
  value: string;
  onChange: (name: string) => void;
  labels: LabelIndex;
};

/**
 * Type any label or tap a recent one. Saving upserts by normalised name, so
 * "coffee" and "Coffee " reuse the same label instead of creating a duplicate.
 */
export default function LabelPicker({ value, onChange, labels }: Props) {
  const key = labelKey(value);
  const countId = useId();

  const { matches, exact } = useMemo(() => {
    const all = [...labels.byId.values()];
    // A deleted label reads as new; saving brings it back.
    const exact = key ? all.find((l) => l.key === key && !l.deletedAt) : undefined;
    // While the field holds a known label, show every option; otherwise filter.
    const matches: Label[] =
      !key || exact ? labels.suggestions : labels.suggestions.filter((l) => l.key.includes(key));
    return { matches, exact };
  }, [labels, key]);

  const isNew = !!key && !exact;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Label, e.g. Coffee"
          maxLength={LABEL_MAX}
          enterKeyHint="done"
          autoCapitalize="words"
          aria-label="Label"
          aria-describedby={countId}
          className="h-12 w-full rounded-2xl bg-accent-soft/70 px-4 text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted focus:ring-2 focus:ring-violet-300"
        />
        {isNew && (
          <span className="pointer-events-none absolute -top-2 left-3 rounded-full bg-white px-1.5 text-[11px] leading-4 font-semibold text-accent-ink">
            New label
          </span>
        )}
        <CharCount id={countId} length={value.length} max={LABEL_MAX} />
      </div>

      {matches.length > 0 && (
        <div role="listbox" aria-label="Recent labels" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
          {matches.map((l) => {
            const active = l.key === key;
            return (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(l.name)}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition ${
                  active ? "bg-accent text-white shadow-md shadow-violet-500/25" : "bg-accent-soft text-ink active:bg-violet-200"
                }`}
              >
                <span className="size-2 rounded-full" style={{ background: active ? "#fff" : l.color }} />
                {l.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
