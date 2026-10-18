"use client";

import { useSyncExternalStore } from "react";
import AccountButton from "./AccountButton";
import MonthNav from "./MonthNav";
import type { MonthKey } from "@/lib/format";

type Props = {
  month: MonthKey;
  onMonthChange: (m: MonthKey) => void;
  onSearch: () => void;
  onOpenSummary: () => void;
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export default function Header({ month, onMonthChange, onSearch, onOpenSummary }: Props) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  return (
    <header className="flex items-center justify-between gap-2">
      <MonthNav month={month} onMonthChange={onMonthChange} onOpenSummary={onOpenSummary} />

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Search expenses"
          onClick={onSearch}
          className="grid size-11 place-items-center rounded-full text-muted transition active:bg-white/60"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        {/* Offline shows as a dot on the avatar: a pill here pushed the avatar past the edge on phones. */}
        <AccountButton offline={!online} />
      </div>
    </header>
  );
}
