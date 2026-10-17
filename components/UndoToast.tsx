"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
};

const DURATION_MS = 5000;
const TICK_MS = 200;

/** Bottom toast beside the FAB with a visible countdown. Remount (via `key`) to restart. */
export default function UndoToast({ message, onUndo, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(DURATION_MS / 1000);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    // Measure against the clock, not tick count, so a throttled tab stays accurate.
    const start = Date.now();
    const timer = setInterval(() => {
      const remaining = DURATION_MS - (Date.now() - start);
      if (remaining <= 0) {
        clearInterval(timer);
        dismissRef.current();
      } else {
        setSecondsLeft(Math.ceil(remaining / 1000));
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-5 pb-safe">
      <div
        role="status"
        aria-live="polite"
        className="animate-toast pointer-events-auto mr-19 mb-2 flex h-16 items-center gap-3 rounded-[22px] bg-[#2a2440]/92 pr-2 pl-3 text-white shadow-xl shadow-violet-900/25 backdrop-blur-md"
      >
        {/* Hidden from screen readers so the live region doesn't re-announce every second. */}
        <span className="relative grid size-8 shrink-0 place-items-center" aria-hidden>
          <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
            <circle cx="16" cy="16" r="13" fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="3" />
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              stroke="#c4b5fd"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              className="animate-countdown"
              style={{ animationDuration: `${DURATION_MS}ms` }}
            />
          </svg>
          <span className="text-xs font-semibold tabular-nums">{secondsLeft}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-violet-300 active:bg-white/10"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
