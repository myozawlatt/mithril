import Dexie, { type EntityTable, type Table } from "dexie";
import { DEFAULT_BUDGET_LINE_NAME } from "./budget";
import { uuid, type Box, type Wrapped } from "./crypto";
import { currentMonth, monthOf, shiftMonth, type MonthKey } from "./format";
import { labelColorAt, labelKey } from "./labels";

/**
 * Local-first records. Shaped so a future Supabase table can mirror them 1:1:
 * UUID ids, an owning `userId` (→ `user_id` + RLS), integer amounts,
 * `updatedAt` for incremental sync, and soft deletes.
 */

/** Owner of rows written before sign-in existed; claimed by the first user to sign in. */
export const UNOWNED = "";

export type Expense = {
  id: string;
  userId: string;
  /** Whole MMK, no decimals. */
  amount: number;
  labelId: string;
  note: string;
  /** YYYY-MM-DD in the user's local time. */
  date: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

/** A reusable, user-created tag. Upserted by `key` (normalised name) on save. */
export type Label = {
  id: string;
  userId: string;
  name: string;
  /** Lower-cased, whitespace-collapsed name. Unique per user. */
  key: string;
  color: string;
  useCount: number;
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * How an expense is stored: `amount` and `note` sealed in `box` (see `lib/crypto.ts`).
 * Rows from before encryption keep them in plain until the owner next unlocks.
 */
export type ExpenseRow = Omit<Expense, "amount" | "note"> & { box?: Box; amount?: number; note?: string };

/**
 * How a label is stored: `name` sealed in `box`, and `key` replaced by its blind
 * index so per-user uniqueness still works. Rows from before encryption keep a
 * plain `name` and `key` until the owner next unlocks.
 */
export type LabelRow = Omit<Label, "name"> & { box?: Box; name?: string };

/**
 * A per-user setting (budgets, privacy, auto-lock, sync cursors). Keyed by `[userId, key]`.
 * Budgets are sealed in `box`; other settings aren't sensitive and stay in `value`.
 * Only budgets sync, so a cleared budget stays as a tombstone (`deletedAt`, no box).
 */
export type Pref = {
  userId: string;
  key: string;
  value?: unknown;
  box?: Box;
  updatedAt?: number;
  deletedAt?: number;
};

/** A user's key material on this device, wrapped by their password or PIN. Never synced. */
export type VaultRow = Wrapped & {
  userId: string;
  kind: "password" | "pin";
  /** Wrong PINs in a row; the PIN is removed at the limit. */
  failedAttempts: number;
  updatedAt: number;
};

// The app was renamed to mithril and started from an empty database; drop the
// one left from before (it only ever held sample data).
if (typeof indexedDB !== "undefined") Dexie.delete("expense-tracker").catch(() => {});

export const db = new Dexie("mithril") as Dexie & {
  expenses: EntityTable<ExpenseRow, "id">;
  labels: EntityTable<LabelRow, "id">;
  prefs: Table<Pref, [string, string]>;
  vault: Table<VaultRow, [string, string]>;
};

db.version(1).stores({
  expenses: "id, date, categoryId, updatedAt",
  settings: "key",
});

// v2: fixed categories → reusable labels. Existing rows get a label per old category.
db.version(2)
  .stores({
    expenses: "id, date, labelId, updatedAt",
    labels: "id, &key, lastUsedAt",
    settings: "key",
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    const byCategory = new Map<string, Label>();

    await tx
      .table("expenses")
      .toCollection()
      .modify((row: Expense & { categoryId?: string }) => {
        const cat = row.categoryId ?? "other";
        let label = byCategory.get(cat);
        if (!label) {
          const name = cat.charAt(0).toUpperCase() + cat.slice(1);
          label = {
            id: uuid(),
            userId: UNOWNED,
            name,
            key: labelKey(name),
            color: labelColorAt(byCategory.size),
            useCount: 0,
            lastUsedAt: 0,
            createdAt: now,
            updatedAt: now,
          };
          byCategory.set(cat, label);
        }
        label.useCount += 1;
        label.lastUsedAt = Math.max(label.lastUsedAt, row.updatedAt);
        row.labelId = label.id;
        delete row.categoryId;
      });

    await tx.table("labels").bulkAdd([...byCategory.values()]);
  });

// v3: the palette was trimmed to 8 validated colours; recolour labels in creation order.
db.version(3)
  .stores({
    expenses: "id, date, labelId, updatedAt",
    labels: "id, &key, lastUsedAt",
    settings: "key",
  })
  .upgrade(async (tx) => {
    const labels: Label[] = await tx.table("labels").toArray();
    labels.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const now = Date.now();
    await tx.table("labels").bulkPut(labels.map((l, i) => ({ ...l, color: labelColorAt(i), updatedAt: now })));
  });

// v4: every row belongs to a user. Existing rows are marked UNOWNED until someone
// signs in; `settings` (keyed by `key` alone) moves to per-user `prefs`.
db.version(4)
  .stores({
    expenses: "id, userId, [userId+date], labelId, updatedAt",
    labels: "id, userId, &[userId+key], [userId+lastUsedAt]",
    settings: "key",
    prefs: "[userId+key], userId",
  })
  .upgrade(async (tx) => {
    await tx.table("expenses").toCollection().modify({ userId: UNOWNED });
    await tx.table("labels").toCollection().modify({ userId: UNOWNED });
    const settings: { key: string; value: unknown }[] = await tx.table("settings").toArray();
    await tx.table("prefs").bulkAdd(settings.map((s) => ({ userId: UNOWNED, key: s.key, value: s.value })));
  });

// v5: drop the old global settings table, separately so v4 could still read it.
db.version(5).stores({
  expenses: "id, userId, [userId+date], labelId, updatedAt",
  labels: "id, userId, &[userId+key], [userId+lastUsedAt]",
  settings: null,
  prefs: "[userId+key], userId",
});

// v6: a month's budget is a list of named lines, and "every month" (budget:default)
// is gone. Numbers become one "Monthly budget" line; the old default is written out
// to each month it covered (the months summary range: earliest to latest month with
// data, always including now) that had no value of its own. A 0 ("no budget this month") is simply removed.
db.version(6)
  .stores({
    expenses: "id, userId, [userId+date], labelId, updatedAt",
    labels: "id, userId, &[userId+key], [userId+lastUsedAt]",
    prefs: "[userId+key], userId",
  })
  .upgrade(async (tx) => {
    const line = (amount: unknown) =>
      typeof amount === "number" && amount > 0
        ? [{ id: uuid(), name: DEFAULT_BUDGET_LINE_NAME, amount }]
        : null;

    /** Months with expenses or a budget of their own, per user. */
    const active = new Map<string, Set<MonthKey>>();
    const seen = (userId: string, month: MonthKey) => {
      if (!active.has(userId)) active.set(userId, new Set());
      active.get(userId)!.add(month);
    };
    await tx
      .table("expenses")
      .toCollection()
      .each((e: Expense) => {
        if (!e.deletedAt) seen(e.userId, monthOf(e.date));
      });

    const prefs: Pref[] = await tx.table("prefs").toArray();
    const defaults = new Map<string, unknown>();
    const months = new Map<string, Set<MonthKey>>();
    const puts: Pref[] = [];
    const deletes: [string, string][] = [];

    for (const p of prefs) {
      if (!p.key.startsWith("budget:")) continue;
      const suffix = p.key.slice("budget:".length);
      if (suffix === "default") {
        defaults.set(p.userId, p.value);
        deletes.push([p.userId, p.key]);
        continue;
      }
      if (!months.has(p.userId)) months.set(p.userId, new Set());
      months.get(p.userId)!.add(suffix);
      seen(p.userId, suffix);
      const value = line(p.value);
      if (value) puts.push({ ...p, value });
      else if (!Array.isArray(p.value)) deletes.push([p.userId, p.key]);
    }

    const now = currentMonth();
    for (const [userId, value] of defaults) {
      if (!line(value)) continue;
      const own = months.get(userId) ?? new Set();
      // The same range the months summary showed: every active month plus this one.
      const span = [now, ...(active.get(userId) ?? [])].sort();
      const from = span[0];
      const to = span[span.length - 1];
      for (let m = to; m >= from; m = shiftMonth(m, -1)) {
        if (!own.has(m)) puts.push({ userId, key: `budget:${m}`, value: line(value) });
      }
    }

    await tx.table("prefs").bulkDelete(deletes);
    await tx.table("prefs").bulkPut(puts);
  });

// v7: data at rest is encrypted. `vault` holds each user's wrapped key material.
// Existing rows can't be sealed here (that needs the user's key), so they're
// sealed by `prepareUserData` in lib/repo.ts the next time their owner unlocks.
db.version(7).stores({
  expenses: "id, userId, [userId+date], labelId, updatedAt",
  labels: "id, userId, &[userId+key], [userId+lastUsedAt]",
  prefs: "[userId+key], userId",
  vault: "[userId+kind]",
});

// v8: Supabase sync. `[userId+updatedAt]` finds the rows changed since the last
// push without a table scan; prefs gain `updatedAt` (and soft deletes) for it.
db.version(8)
  .stores({
    expenses: "id, userId, [userId+date], [userId+updatedAt], labelId, updatedAt",
    labels: "id, userId, &[userId+key], [userId+lastUsedAt], [userId+updatedAt]",
    prefs: "[userId+key], userId, [userId+updatedAt]",
    vault: "[userId+kind]",
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    await tx
      .table("prefs")
      .toCollection()
      .modify((p: Pref) => {
        p.updatedAt ??= now;
      });
  });

// v9: the sample-data feature is gone. Demo rows (flagged `sample`) never synced
// and aren't real spending, so they're removed rather than left looking real.
// A demo label a real expense used had already lost its flag, so it stays.
db.version(9)
  .stores({
    expenses: "id, userId, [userId+date], [userId+updatedAt], labelId, updatedAt",
    labels: "id, userId, &[userId+key], [userId+lastUsedAt], [userId+updatedAt]",
    prefs: "[userId+key], userId, [userId+updatedAt]",
    vault: "[userId+kind]",
  })
  .upgrade(async (tx) => {
    const isSample = (row: { sample?: boolean }) => row.sample === true;
    await tx.table("expenses").filter(isSample).delete();
    await tx.table("labels").filter(isSample).delete();
  });
