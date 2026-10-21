"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useUser } from "./auth";
import * as clock from "./clock";
import {
  applyRemote,
  getSyncCursor,
  healFutureStamps,
  latestLocalChange,
  pendingChanges,
  setSyncCursor,
  type SyncBatch,
  type SyncBudget,
  type SyncExpense,
  type SyncLabel,
} from "./repo";
import { labelKey } from "./labels";
import { isSupabaseConfigured, revokeLeftoverSessions, supabase } from "./supabase";

/**
 * Two-way sync with the `mithril` schema in Supabase (supabase/schema.sql),
 * while the vault is unlocked. The app only ever reads IndexedDB; this keeps
 * it and the server in step.
 *
 * - Pull: rows the server stamped (`synced_at`) since the last pull, minus a
 *   margin for commits still in flight, are handed to `applyRemote`.
 * - Push: local rows with `updatedAt` since the last push (minus a margin) are
 *   upserted. The server ignores a write whose `updated_at` isn't newer, so the
 *   newest edit wins and sending a row twice is harmless.
 *
 * Runs on unlock, when the app comes back online or into view, every few
 * minutes, and shortly after any local write (push only). A full run also
 * measures the server's clock for `updatedAt` stamps (`lib/clock.ts`) and ends
 * sessions signed out of while offline (`revokeLeftoverSessions`).
 */

const PAGE = 1000;
const CHUNK = 500;
const PULL_MARGIN_MS = 30_000;
const PUSH_MARGIN_MS = 5_000;
const PUSH_DELAY_MS = 1_500;
const INTERVAL_MS = 5 * 60_000;

export type SyncState = "idle" | "syncing" | "offline" | "error" | "off";
export type SyncStatus = {
  state: SyncState;
  /** When the last sync this session finished. */
  lastSyncedAt: number | null;
  /** This device has pulled at least once (or the first try this session ended), so "no data" is real. */
  ready: boolean;
  /** Why the last run failed, while `state` is "error". */
  error: string | null;
};

const INITIAL: SyncStatus = { state: "idle", lastSyncedAt: null, ready: false, error: null };
let status: SyncStatus = INITIAL;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const cb of listeners) cb();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => INITIAL,
  );
}

// Server rows (snake_case). bigint columns arrive as JSON numbers.
type LabelRecord = { id: string; name: string; color: string; use_count: number; last_used_at: number; created_at: number; updated_at: number; deleted_at: number | null };
type ExpenseRecord = { id: string; amount: number; note: string; label_id: string; date: string; created_at: number; updated_at: number; deleted_at: number | null };
type PrefRecord = { key: string; value: SyncBudget["value"]; updated_at: number; deleted_at: number | null };
type Stamped = { synced_at: string };

const fromLabel = (r: LabelRecord): SyncLabel => ({
  id: r.id,
  name: r.name,
  color: r.color,
  useCount: r.use_count,
  lastUsedAt: r.last_used_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
});

const fromExpense = (r: ExpenseRecord): SyncExpense => ({
  id: r.id,
  amount: r.amount,
  note: r.note,
  labelId: r.label_id,
  date: r.date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
});

const fromPref = (r: PrefRecord): SyncBudget => ({
  key: r.key,
  value: r.value,
  updatedAt: r.updated_at,
  ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
});

/**
 * Stamps as the server's bigint columns take them. Rows stamped before the clock
 * offset was rounded can hold fractions; rounding up keeps an edit newer than
 * what it replaced, and the next pull brings the whole value back to this device.
 */
const ms = (t: number) => Math.ceil(t);
const msOrNull = (t: number | undefined) => (t != null ? Math.ceil(t) : null);

const toLabel = (userId: string, l: SyncLabel) => ({
  id: l.id,
  user_id: userId,
  name: l.name,
  key: labelKey(l.name),
  color: l.color,
  use_count: l.useCount,
  last_used_at: ms(l.lastUsedAt),
  created_at: ms(l.createdAt),
  updated_at: ms(l.updatedAt),
  deleted_at: msOrNull(l.deletedAt),
});

const toExpense = (userId: string, e: SyncExpense) => ({
  id: e.id,
  user_id: userId,
  amount: e.amount,
  note: e.note,
  label_id: e.labelId,
  date: e.date,
  created_at: ms(e.createdAt),
  updated_at: ms(e.updatedAt),
  deleted_at: msOrNull(e.deletedAt),
});

const toPref = (userId: string, p: SyncBudget) => ({
  user_id: userId,
  key: p.key,
  value: p.value,
  updated_at: ms(p.updatedAt),
  deleted_at: msOrNull(p.deletedAt),
});

/** Thrown for a failed request, so a label-name clash can be told apart. */
class SyncError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Every row of one table stamped at or after `since`, paged by (synced_at, pk). */
async function pullTable<T extends Stamped>(table: string, userId: string, since: string, pk: string, onlyBudgets = false): Promise<T[]> {
  const rows: T[] = [];
  let after: { at: string; pk: string } | null = null;
  for (;;) {
    let q = supabase().from(table).select("*").eq("user_id", userId).gte("synced_at", since);
    if (onlyBudgets) q = q.like("key", "budget:%");
    if (after) q = q.or(`synced_at.gt."${after.at}",and(synced_at.eq."${after.at}",${pk}.gt."${after.pk}")`);
    const { data, error } = await q.order("synced_at").order(pk).limit(PAGE);
    if (error) throw new SyncError(error.message, error.code);
    const page = data as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
    const last = page[page.length - 1] as T & Record<string, string>;
    after = { at: last.synced_at, pk: last[pk] };
  }
}

async function pull(userId: string): Promise<void> {
  const pulledAt = await getSyncCursor(userId, "pulledAt");
  const since = new Date(Math.max(0, pulledAt - PULL_MARGIN_MS)).toISOString();
  // Labels first, so pulled expenses find their labels.
  const labels = await pullTable<LabelRecord & Stamped>("labels", userId, since, "id");
  const expenses = await pullTable<ExpenseRecord & Stamped>("expenses", userId, since, "id");
  const prefs = await pullTable<PrefRecord & Stamped>("prefs", userId, since, "key", true);
  const batch: SyncBatch = { labels: labels.map(fromLabel), expenses: expenses.map(fromExpense), prefs: prefs.map(fromPref) };
  await applyRemote(userId, batch);
  // The cursor is the server's clock, never this device's.
  const newest = [...labels, ...expenses, ...prefs].reduce((max, r) => Math.max(max, Date.parse(r.synced_at)), pulledAt);
  if (newest > pulledAt) await setSyncCursor(userId, "pulledAt", newest);
}

async function upsert(table: string, rows: object[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase().from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new SyncError(error.message, error.code);
  }
}

/** Rows stamped this far ahead of the server get re-stamped; see `healFutureStamps`. */
async function alignClock(userId: string): Promise<void> {
  const sent = Date.now();
  const { data, error } = await supabase().rpc("server_time");
  const received = Date.now();
  if (error || typeof data !== "number") {
    // PGRST202: the project predates `mithril.server_time()`; stamps use this device's clock.
    if (error?.code !== "PGRST202") console.warn("Couldn’t read the server clock", error);
    return;
  }
  const serverNow = data + (received - sent) / 2;
  clock.setServerOffset(serverNow - received);
  await healFutureStamps(userId, Math.round(serverNow));
}

async function push(userId: string): Promise<void> {
  const upTo = clock.now();
  const pushedAt = await getSyncCursor(userId, "pushedAt");
  const batch = await pendingChanges(userId, pushedAt - PUSH_MARGIN_MS);
  // Labels before the expenses that use them.
  await upsert("labels", batch.labels.map((l) => toLabel(userId, l)), "id");
  await upsert("expenses", batch.expenses.map((e) => toExpense(userId, e)), "id");
  await upsert("prefs", batch.prefs.map((p) => toPref(userId, p)), "user_id,key");
  await setSyncCursor(userId, "pushedAt", upTo);
}

/** A short reason for the Account sheet, with the PostgREST/Postgres code when there is one. */
function describe(err: unknown): string {
  if (err instanceof SyncError) return err.code ? `${err.message} (${err.code})` : err.message;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

let running: Promise<void> | null = null;
/** A sync asked for while one was running; `pull` if any of those wanted a pull. */
let queued: { userId: string; pull: boolean } | null = null;

/** Sync now, or right after the one in progress. Never throws; see `useSyncStatus()`. */
export function syncNow(userId: string, opts: { pull: boolean } = { pull: true }): Promise<void> {
  if (running) {
    queued = { userId, pull: opts.pull || (queued?.userId === userId && queued.pull) };
    return running;
  }
  running = run(userId, opts.pull).finally(() => {
    running = null;
    const next = queued;
    queued = null;
    if (next) void syncNow(next.userId, { pull: next.pull });
  });
  return running;
}

async function run(userId: string, withPull: boolean): Promise<void> {
  if (!isSupabaseConfigured) return setStatus({ state: "off", ready: true, error: null });
  if (!navigator.onLine) return setStatus({ state: "offline", error: null });
  setStatus({ state: "syncing" });
  try {
    const { data } = await supabase().auth.getSession();
    // No live session: offline with an expired token, or signed in as someone else.
    if (data.session?.user.id !== userId) return setStatus({ state: navigator.onLine ? "idle" : "offline", ready: true, error: null });
    const exclusive = async () => {
      if (withPull) {
        await alignClock(userId);
        await revokeLeftoverSessions(userId).catch((err) => console.warn("Couldn’t end a signed-out session", err));
        await pull(userId);
      }
      try {
        await push(userId);
      } catch (err) {
        // Another device saved a label with the same name first: pull merges it, then retry.
        if (!(err instanceof SyncError && err.code === "23505") || withPull) throw err;
        await pull(userId);
        await push(userId);
      }
    };
    if (navigator.locks) await navigator.locks.request(`mithril-sync:${userId}`, exclusive);
    else await exclusive();
    setStatus({ state: "idle", lastSyncedAt: Date.now(), ready: status.ready || withPull, error: null });
  } catch (err) {
    // Locked mid-sync: the keys are gone; the next unlock syncs again.
    if (err instanceof Error && err.message === "Locked") return setStatus({ state: "idle", error: null });
    // "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError …" (Firefox).
    const offline = !navigator.onLine || (err instanceof TypeError && /fetch|load failed|network/i.test(err.message));
    if (!offline) console.warn("Sync failed", err);
    setStatus({ state: offline ? "offline" : "error", ready: true, error: offline ? null : describe(err) });
  }
}

/** Keeps the signed-in user's data in sync while the tracker is on screen (unlocked). */
export function useSync(): void {
  const userId = useUser().id;
  const latest = useLiveQuery(() => latestLocalChange(userId), [userId]);
  const seen = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setStatus(INITIAL);
    getSyncCursor(userId, "pulledAt").then((at) => {
      if (alive && at > 0) setStatus({ ready: true });
    });
    void syncNow(userId);

    const full = () => void syncNow(userId);
    const onVisible = () => {
      if (document.visibilityState === "visible") full();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") full();
    }, INTERVAL_MS);
    window.addEventListener("online", full);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", full);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // Push shortly after local writes. The first value is what was there on unlock.
  useEffect(() => {
    if (latest === undefined) return;
    if (seen.current === undefined || latest <= seen.current) {
      seen.current = Math.max(seen.current ?? 0, latest);
      return;
    }
    seen.current = latest;
    const t = setTimeout(() => void syncNow(userId, { pull: false }), PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [userId, latest]);
}
