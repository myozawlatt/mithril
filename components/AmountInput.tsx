"use client";

import { forwardRef } from "react";
import { formatNumber, parseAmount } from "@/lib/format";

type Props = {
  value: string;
  onChange: (formatted: string) => void;
  label: string;
  autoFocus?: boolean;
};

/** Width in `ch`: a tabular digit is exactly 1ch; a comma is about half that. */
function inputWidth(value: string): number {
  const digits = value.replace(/\D/g, "").length || 1;
  const commas = (value.match(/,/g) ?? []).length;
  return digits * 1 + commas * 0.52 + 0.2;
}

/** Big centred MMK amount field that grows with its digits. */
const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { value, onChange, label, autoFocus },
  ref,
) {
  return (
    <label className="flex items-baseline justify-center gap-2">
      <span className="text-lg font-medium text-muted">MMK</span>
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          const n = parseAmount(e.target.value);
          onChange(n ? formatNumber(n) : "");
        }}
        inputMode="numeric"
        enterKeyHint="done"
        placeholder="0"
        aria-label={label}
        style={{ width: `${inputWidth(value)}ch` }}
        className={`max-w-[78vw] bg-transparent text-left font-semibold ${value.length > 12 ? "text-3xl" : value.length > 9 ? "text-4xl" : "text-5xl"} tracking-tight text-ink outline-none placeholder:text-muted`}
      />
    </label>
  );
});

export default AmountInput;
