"use client";

import { useSyncStatus } from "@/lib/sync";

type Props = {
  isCurrentMonth: boolean;
  /** No expenses anywhere yet. */
  isFirstRun: boolean;
};

export default function EmptyState({ isCurrentMonth, isFirstRun }: Props) {
  // On a new device, the first pull may still be bringing the user's data in.
  const { ready } = useSyncStatus();

  return (
    <div className="flex flex-col items-center px-8 pt-10 text-center">
      <div className="glass mb-4 grid size-16 place-items-center rounded-3xl text-2xl" aria-hidden>
        🪙
      </div>
      <p className="font-semibold">{isCurrentMonth ? "Nothing spent yet" : "No expenses this month"}</p>
      <p className="mt-1 text-sm text-muted">
        {isCurrentMonth ? "Tap + to log your first expense. It works offline, too." : "Pick another month or add one here."}
      </p>
      {isFirstRun && !ready && <p className="mt-6 text-xs text-muted">Looking for your synced expenses…</p>}
    </div>
  );
}
