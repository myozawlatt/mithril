"use client";

import { setAmountsHidden, useAmountsHidden } from "@/lib/privacy";

/** The one switch that masks or reveals every spent and budget amount. */
export default function EyeToggle({ className = "" }: { className?: string }) {
  const hidden = useAmountsHidden();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setAmountsHidden(!hidden);
      }}
      aria-pressed={!hidden}
      aria-label={hidden ? "Show amounts" : "Hide amounts"}
      className={`grid size-8 shrink-0 place-items-center rounded-full text-muted transition active:bg-white/70 ${className}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {hidden ? (
          <>
            <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.4 3.3M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.4 9.4 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
          </>
        ) : (
          <>
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
