"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { currentUserId, useUser } from "./auth";
import { db } from "./db";

const KEY = "privacy";

/** Fixed length, so a mask doesn't leak how many digits it hides. */
export const MASK = "•••••";

/**
 * Whether spent and budget amounts are masked. One switch for all of them,
 * remembered per user on this device. Masked by default — also while it loads.
 */
export function useAmountsHidden(): boolean {
  const userId = useUser().id;
  const row = useLiveQuery(() => db.prefs.get([userId, KEY]), [userId]);
  if (!row) return true;
  const v = row.value as { hidden?: boolean; spent?: boolean; budget?: boolean };
  // Older saves kept spent/budget separately; stay masked if either was.
  return v.hidden ?? (v.spent !== false || v.budget !== false);
}

export async function setAmountsHidden(hidden: boolean): Promise<void> {
  await db.prefs.put({ userId: currentUserId(), key: KEY, value: { hidden }, updatedAt: Date.now() });
}
