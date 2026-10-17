"use client";

import { PIN_LENGTH } from "@/lib/vault";

type Props = {
  value: string;
  onChange: (pin: string) => void;
  /** Called once all digits are in. */
  onComplete?: (pin: string) => void;
  label: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
};

/** A masked, digits-only PIN field on the numeric keypad. */
export default function PinInput({ value, onChange, onComplete, label, autoFocus, disabled, className = "" }: Props) {
  return (
    <input
      type="password"
      value={value}
      onChange={(e) => {
        const pin = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        onChange(pin);
        if (pin.length === PIN_LENGTH && pin !== value) onComplete?.(pin);
      }}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={PIN_LENGTH}
      placeholder={"•".repeat(PIN_LENGTH)}
      aria-label={label}
      autoFocus={autoFocus}
      disabled={disabled}
      className={`h-14 w-full rounded-2xl text-center text-2xl font-semibold tracking-[0.5em] text-ink outline-none placeholder:text-violet-200 focus:ring-2 focus:ring-violet-300 disabled:opacity-60 ${className}`}
    />
  );
}
