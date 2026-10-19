"use client";

import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { currentUserId, useUser } from "./auth";
import { asLines, budgetTotal, DEFAULT_BUDGET_LINE_NAME, type BudgetLine } from "./budget";
import * as clock from "./clock";
import { blindIndex, isPadded, open, seal, uuid, type Box } from "./crypto";
import { db, UNOWNED, type Expense, type ExpenseRow, type Label, type LabelRow, type Pref } from "./db";
import { currentMonth, monthOf, shiftMonth, type MonthKey } from "./format";
import { cleanLabelName, labelColorAt, labelKey } from "./labels";
import { keysFor } from "./vault";

/**
 * The only module that touches storage. Sync with Supabase (`lib/sync.ts`) goes
 * through `pendingChanges` and `applyRemote` at the bottom; it never sees `db`.
 *
 * Every read and write is scoped to the signed-in user: hooks via `useUser()`,
 * mutations via `currentUserId()`.
 *
 * Sensitive fields (amounts, notes, label names, budgets) are stored only
 * sealed with the user's key (`lib/crypto.ts`, keys from `lib/vault.ts`). Seal
 * before opening a transaction and open after the last read: WebCrypto inside a
 * transaction lets IndexedDB commit it early.
 */

export type ExpenseInput = Pick<Expense, "amount" | "note" | "date"> & {
  /** Free-text label name; upserted into `labels`. */
  label: string;
};

/** A v4 UUID; the server's id columns are `uuid`. */
export function newId(): string {
  return uuid();
}

/** Binds a sealed box to its owner, table and row. */
const aad = (userId: string, table: string, id: string) => `${userId}|${table}|${id}`;

type ExpenseSecret = Pick<Expense, "amount" | "note">;

const sealExpenseBox = (userId: string, id: string, secret: ExpenseSecret) =>
  seal(keysFor(userId).enc, secret, aad(userId, "expenses", id));

/** An expense as stored: amount and note sealed. Call outside transactions. */
export async function sealExpense(e: Expense): Promise<ExpenseRow> {
  const { amount, note, ...rest } = e;
  return { ...rest, box: await sealExpenseBox(e.userId, e.id, { amount, note }) };
}

async function openExpense(row: ExpenseRow): Promise<Expense> {
  const { box, ...rest } = row;
  // Old plain rows are sealed on unlock; until then they read as they are.
  if (!box) return { amount: 0, note: "", ...rest };
  const secret = await open<ExpenseSecret>(keysFor(row.userId).enc, box, aad(row.userId, "expenses", row.id));
  return { ...rest, ...secret };
}

async function openLabel(row: LabelRow): Promise<Label> {
  const { box, ...rest } = row;
  const name = box ? (await open<{ name: string }>(keysFor(row.userId).enc, box, aad(row.userId, "labels", row.id))).name : (row.name ?? "");
  return { ...rest, name, key: labelKey(name) };
}

const openAll = <R, T>(rows: R[], fn: (r: R) => Promise<T>) => Promise.all(rows.map(fn));

/** A label ready for `upsertLabel`: id, blind key and sealed name. */
export type PreparedLabel = Pick<LabelRow, "id" | "key" | "box">;

/** Seal a label name for `upsertLabel`. Call outside transactions. */
export async function prepareLabel(userId: string, name: string): Promise<PreparedLabel> {
  const keys = keysFor(userId);
  const clean = cleanLabelName(name);
  const id = newId();
  const [key, box] = await Promise.all([
    blindIndex(keys.mac, labelKey(clean)),
    seal(keys.enc, { name: clean }, aad(userId, "labels", id)),
  ]);
  return { id, key, box };
}

/**
 * Find one of the user's labels by name or create it, bump its usage, and
 * return its id. Must run inside a transaction that includes `db.labels`.
 */
export async function upsertLabel(userId: string, label: PreparedLabel): Promise<string> {
  const now = clock.now();
  const existing = await db.labels.where("[userId+key]").equals([userId, label.key]).first();

  if (existing) {
    // A deleted label comes back when its name is used again.
    await db.labels.update(existing.id, {
      useCount: existing.useCount + 1,
      lastUsedAt: Math.max(existing.lastUsedAt, now),
      updatedAt: clock.stamp(existing.updatedAt),
      deletedAt: undefined,
    });
    return existing.id;
  }

  await db.labels.add({
    ...label,
    userId,
    color: labelColorAt(await db.labels.where("userId").equals(userId).count()),
    useCount: 1,
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return label.id;
}

/** One of the user's expenses by id; never another user's, even if an id leaks. */
function ownExpense(userId: string, id: string) {
  return db.expenses.where("id").equals(id).filter((e) => e.userId === userId);
}

/** One of the user's labels by id; never another user's. */
function ownLabel(userId: string, id: string) {
  return db.labels.where("id").equals(id).filter((l) => l.userId === userId);
}

/** The user's live expenses filed under a label. */
function liveExpensesWithLabel(userId: string, labelId: string) {
  return db.expenses
    .where("labelId")
    .equals(labelId)
    .filter((e) => e.userId === userId && !e.deletedAt);
}

/** The user's live (not deleted) expenses. */
function userExpenses(userId: string) {
  return db.expenses
    .where("userId")
    .equals(userId)
    .filter((e) => !e.deletedAt);
}

export async function addExpense(input: ExpenseInput): Promise<void> {
  const userId = currentUserId();
  const now = clock.now();
  const [label, row] = await Promise.all([
    prepareLabel(userId, input.label),
    sealExpense({ id: newId(), userId, amount: input.amount, note: input.note, date: input.date, labelId: "", createdAt: now, updatedAt: now }),
  ]);
  await db.transaction("rw", db.expenses, db.labels, async () => {
    row.labelId = await upsertLabel(userId, label);
    await db.expenses.add(row);
  });
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const userId = currentUserId();
  const [label, box] = await Promise.all([
    prepareLabel(userId, input.label),
    sealExpenseBox(userId, id, { amount: input.amount, note: input.note }),
  ]);
  await db.transaction("rw", db.expenses, db.labels, async () => {
    if (!(await ownExpense(userId, id).count())) return;
    const labelId = await upsertLabel(userId, label);
    await ownExpense(userId, id).modify((e) => {
      delete e.amount;
      delete e.note;
      Object.assign(e, { box, date: input.date, labelId, updatedAt: clock.stamp(e.updatedAt) });
    });
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await ownExpense(currentUserId(), id).modify((e) => {
    e.deletedAt = clock.now();
    e.updatedAt = clock.stamp(e.updatedAt);
  });
}

/**
 * Undo a delete. Bumps updatedAt so a future sync sees the revival. A label
 * deleted meanwhile comes back with it, so a live expense never has a deleted label.
 */
export async function restoreExpense(id: string): Promise<void> {
  const userId = currentUserId();
  await db.transaction("rw", db.expenses, db.labels, async () => {
    const expense = await ownExpense(userId, id).first();
    if (!expense) return;
    await ownExpense(userId, id).modify((e) => {
      delete e.deletedAt;
      e.updatedAt = clock.stamp(e.updatedAt);
    });
    await ownLabel(userId, expense.labelId)
      .filter((l) => !!l.deletedAt)
      .modify((l) => {
        delete l.deletedAt;
        l.updatedAt = clock.stamp(l.updatedAt);
      });
  });
}

function newestFirst(a: Expense, b: Expense): number {
  return a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1;
}

/** Live list of a month's expenses, newest first. `undefined` while loading. */
export function useMonthExpenses(month: MonthKey): Expense[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const rows = await db.expenses
      .where("[userId+date]")
      .between([userId, `${month}-01`], [userId, `${month}-31`], true, true)
      .filter((e) => !e.deletedAt)
      .toArray();
    return (await openAll(rows, openExpense)).sort(newestFirst);
  }, [userId, month]);
}

const SEARCH_LIMIT = 300;

/**
 * Search every month by note, label name, or amount digits ("5000" or "5,000").
 * Returns [] for an empty query, `undefined` while loading. Notes and names are
 * sealed, so matching happens after opening the user's rows.
 */
export function useSearch(query: string): Expense[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/[,\s]/g, "");
    const byAmount = /^\d+$/.test(digits);
    const [labelRows, rows] = await Promise.all([
      db.labels.where("userId").equals(userId).toArray(),
      userExpenses(userId).toArray(),
    ]);
    const labels = await openAll(labelRows, openLabel);
    const labelIds = new Set(labels.filter((l) => l.key.includes(q)).map((l) => l.id));
    const expenses = await openAll(rows, openExpense);
    return expenses
      .filter(
        (e) =>
          e.note.toLowerCase().includes(q) ||
          labelIds.has(e.labelId) ||
          (byAmount && String(e.amount).includes(digits)),
      )
      .sort(newestFirst)
      .slice(0, SEARCH_LIMIT);
  }, [userId, query]);
}

export type LabelIndex = {
  /** Every label, for rendering names/colours. */
  byId: Map<string, Label>;
  /** Labels still attached to a live expense, most recently used first. */
  suggestions: Label[];
};

export function useLabels(): LabelIndex | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const [rows, inUse] = await Promise.all([
      db.labels
        .where("[userId+lastUsedAt]")
        .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
        .reverse()
        .toArray(),
      (async () => {
        const ids = new Set<string>();
        await userExpenses(userId).each((e) => ids.add(e.labelId));
        return ids;
      })(),
    ]);
    const labels = await openAll(rows, openLabel);
    return {
      byId: new Map(labels.map((l) => [l.id, l])),
      suggestions: labels.filter((l) => inUse.has(l.id)),
    };
  }, [userId]);
}

export type LabelUsage = { label: Label; /** Live expenses filed under it. */ count: number };

/**
 * Every label for the label manager, by name. Deleted ones are left out, unless
 * a live expense still uses one (another device filed an expense under it meanwhile).
 */
export function useLabelUsage(): LabelUsage[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const [rows, counts] = await Promise.all([
      db.labels.where("userId").equals(userId).toArray(),
      (async () => {
        const counts = new Map<string, number>();
        await userExpenses(userId).each((e) => counts.set(e.labelId, (counts.get(e.labelId) ?? 0) + 1));
        return counts;
      })(),
    ]);
    const labels = await openAll(
      rows.filter((l) => !l.deletedAt || counts.has(l.id)),
      openLabel,
    );
    return labels
      .map((label) => ({ label, count: counts.get(label.id) ?? 0 }))
      .sort((a, b) => a.label.name.localeCompare(b.label.name));
  }, [userId]);
}

/** Renaming onto a name another live label has; `renameLabel` with `merge` folds them together. */
export class LabelNameTakenError extends Error {
  constructor(
    /** The name as that label has it. */
    readonly taken: string,
    /** Live expenses that would move into it. */
    readonly moving: number,
  ) {
    super(`A label called “${taken}” already exists`);
  }
}

/** Deleting a label that live expenses still use. */
export class LabelInUseError extends Error {
  constructor(readonly count: number) {
    super(`The label is used by ${count} expense${count === 1 ? "" : "s"}`);
  }
}

/**
 * Rename one of the user's labels; its expenses show the new name everywhere.
 * When another label already has the name, the two merge (`merge: true`, else
 * `LabelNameTakenError`): this label's expenses move to that one, and this one
 * is deleted. A deleted label with the name always merges, silently. The
 * deleted label keeps its old key, so names stay unique here and on the server.
 */
export async function renameLabel(id: string, name: string, { merge = false } = {}): Promise<void> {
  const userId = currentUserId();
  const clean = cleanLabelName(name);
  if (!clean) throw new Error("A label needs a name");
  const keys = keysFor(userId);
  const key = await blindIndex(keys.mac, labelKey(clean));
  const holder = await db.labels.where("[userId+key]").equals([userId, key]).first();
  const twin = holder && holder.id !== id ? holder : undefined;
  if (twin && !twin.deletedAt && !merge) {
    const [twinLabel, moving] = await Promise.all([openLabel(twin), liveExpensesWithLabel(userId, id).count()]);
    throw new LabelNameTakenError(twinLabel.name, moving);
  }
  // The name is sealed for the label that ends up with it.
  const box = await seal(keys.enc, { name: clean }, aad(userId, "labels", twin?.id ?? id));

  await db.transaction("rw", db.labels, db.expenses, async () => {
    const own = await ownLabel(userId, id).first();
    if (!own) return;
    const current = await db.labels.where("[userId+key]").equals([userId, key]).first();
    if (current?.id !== holder?.id || current?.updatedAt !== holder?.updatedAt) {
      throw new Error("Labels changed meanwhile; try again");
    }
    if (!twin) {
      await db.labels.update(id, { key, box, updatedAt: clock.stamp(own.updatedAt) });
      return;
    }
    // Deleted expenses move too, so Undo puts them back under the merged label.
    await db.expenses
      .where("labelId")
      .equals(id)
      .filter((e) => e.userId === userId)
      .modify((e) => {
        e.labelId = twin.id;
        e.updatedAt = clock.stamp(e.updatedAt);
      });
    await db.labels.update(twin.id, {
      box,
      // A live label keeps its colour; a deleted one takes over this label's.
      color: twin.deletedAt ? own.color : twin.color,
      useCount: twin.useCount + own.useCount,
      lastUsedAt: Math.max(twin.lastUsedAt, own.lastUsedAt),
      updatedAt: clock.stamp(twin.updatedAt),
      deletedAt: undefined,
    });
    await db.labels.update(id, { deletedAt: clock.now(), updatedAt: clock.stamp(own.updatedAt) });
  });
}

/** Delete one of the user's labels. Only one no live expense uses (`LabelInUseError`). */
export async function deleteLabel(id: string): Promise<void> {
  const userId = currentUserId();
  await db.transaction("rw", db.labels, db.expenses, async () => {
    const own = await ownLabel(userId, id).first();
    if (!own || own.deletedAt) return;
    const count = await liveExpensesWithLabel(userId, id).count();
    if (count) throw new LabelInUseError(count);
    await db.labels.update(id, { deletedAt: clock.now(), updatedAt: clock.stamp(own.updatedAt) });
  });
}

/** Whether the user has any live expense at all; `undefined` while loading. */
export function useHasExpenses(): boolean | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => !!(await userExpenses(userId).first()), [userId]);
}

export type MonthSummary = {
  month: MonthKey;
  spent: number;
  count: number;
  /** Sum of the month's budget lines; null when it has none. */
  budget: number | null;
};

const BUDGET_PREFIX = "budget:";
const monthBudgetKey = (month: MonthKey) => `${BUDGET_PREFIX}${month}`;
const isBudget = (p: Pref) => p.key.startsWith(BUDGET_PREFIX);

async function sealPref(userId: string, key: string, value: unknown, updatedAt = clock.now()): Promise<Pref> {
  return { userId, key, box: await seal(keysFor(userId).enc, value, aad(userId, "prefs", key)), updatedAt };
}

async function openPref(p: Pref): Promise<unknown> {
  return p.box ? open(keysFor(p.userId).enc, p.box, aad(p.userId, "prefs", p.key)) : p.value;
}

/**
 * One row per month, newest first, from the earliest month with data (or the
 * current month) through the latest — gaps included so the timeline is honest.
 */
export function useMonthsSummary(): MonthSummary[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const [rows, budgetRows] = await Promise.all([
      userExpenses(userId).toArray(),
      db.prefs
        .where("[userId+key]")
        .between([userId, BUDGET_PREFIX], [userId, `${BUDGET_PREFIX}￿`])
        .filter((p) => !p.deletedAt)
        .toArray(),
    ]);

    const totals = new Map<MonthKey, { spent: number; count: number }>();
    for (const e of await openAll(rows, openExpense)) {
      const m = monthOf(e.date);
      const t = totals.get(m) ?? { spent: 0, count: 0 };
      t.spent += e.amount;
      t.count += 1;
      totals.set(m, t);
    }

    const budgets = new Map(
      await openAll(budgetRows, async (p) => [p.key.slice(BUDGET_PREFIX.length), budgetTotal(asLines(await openPref(p)))] as const),
    );

    const keys = [...totals.keys(), ...budgets.keys(), currentMonth()].sort();
    const result: MonthSummary[] = [];
    for (let m = keys[keys.length - 1]; m >= keys[0]; m = shiftMonth(m, -1)) {
      result.push({
        month: m,
        ...(totals.get(m) ?? { spent: 0, count: 0 }),
        budget: budgets.get(m) ?? null,
      });
    }
    return result;
  }, [userId]);
}

/** A year's spending per label, biggest first. `year` is "YYYY"; `undefined` while loading. */
export function useYearByLabel(year: string): { labelId: string; amount: number }[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const rows = await db.expenses
      .where("[userId+date]")
      .between([userId, `${year}-01-01`], [userId, `${year}-12-31`], true, true)
      .filter((e) => !e.deletedAt)
      .toArray();
    const byLabel = new Map<string, number>();
    for (const e of await openAll(rows, openExpense)) byLabel.set(e.labelId, (byLabel.get(e.labelId) ?? 0) + e.amount);
    return [...byLabel].map(([labelId, amount]) => ({ labelId, amount })).sort((a, b) => b.amount - a.amount);
  }, [userId, year]);
}

/** A month's budget lines; `[]` when it has none. Months never inherit from each other. */
export function useBudget(month: MonthKey): BudgetLine[] | undefined {
  const userId = useUser().id;
  return useLiveQuery(async () => {
    const row = await db.prefs.get([userId, monthBudgetKey(month)]);
    return asLines(row && !row.deletedAt && (await openPref(row)));
  }, [userId, month]);
}

/**
 * Save a month's budget lines. Lines without an amount are dropped, a blank name
 * becomes the default one, and no lines left removes the month's budget.
 */
export async function setBudget(month: MonthKey, lines: { id?: string; name: string; amount: number }[]): Promise<void> {
  const userId = currentUserId();
  const key = monthBudgetKey(month);
  const value: BudgetLine[] = lines
    .filter((l) => Number.isInteger(l.amount) && l.amount > 0)
    .map((l) => ({ id: l.id ?? newId(), name: cleanLabelName(l.name) || DEFAULT_BUDGET_LINE_NAME, amount: l.amount }));
  const existing = await db.prefs.get([userId, key]);
  if (value.length) {
    await db.prefs.put(await sealPref(userId, key, value, clock.stamp(existing?.updatedAt)));
    return;
  }
  // Removing a budget leaves a tombstone, so sync can carry the removal.
  if (!existing || existing.deletedAt) return;
  await db.prefs.put({ userId, key, updatedAt: clock.stamp(existing.updatedAt), deletedAt: clock.now() });
}

/**
 * Runs on every unlock, before the app shows. Seals the user's rows still in
 * plain (saved before encryption existed) and adopts rows saved before sign-in
 * existed (UNOWNED). Unowned labels merge into the user's label of the same
 * name, and the user's own prefs win over unowned ones. A no-op once
 * everything is sealed and owned.
 */
export async function prepareUserData(userId: string): Promise<void> {
  await padOldBoxes(userId);
  const owners = [userId, UNOWNED];
  const [labelRows, expenseRows, prefRows] = await Promise.all([
    db.labels.where("userId").anyOf(owners).filter((l) => l.userId === UNOWNED || !l.box).toArray(),
    db.expenses.where("userId").anyOf(owners).filter((e) => e.userId === UNOWNED || !e.box).toArray(),
    db.prefs.where("userId").anyOf(owners).toArray(),
  ]);
  const ownPrefKeys = new Set(prefRows.filter((p) => p.userId === userId).map((p) => p.key));
  const prefsToSeal = prefRows.filter(
    (p) => (p.userId === UNOWNED && !ownPrefKeys.has(p.key)) || (p.userId === userId && isBudget(p) && !p.box && !p.deletedAt),
  );
  const hasUnownedPrefs = prefRows.some((p) => p.userId === UNOWNED);
  if (!labelRows.length && !expenseRows.length && !prefsToSeal.length && !hasUnownedPrefs) return;

  // Seal everything first; the transaction below only writes.
  const now = clock.now();
  const keys = keysFor(userId);
  // The user's own labels first, so a same-named unowned label merges into theirs.
  labelRows.sort((a, b) => Number(a.userId === UNOWNED) - Number(b.userId === UNOWNED));
  const labels = await openAll(labelRows, async (l): Promise<LabelRow> => {
    const name = cleanLabelName(l.name ?? l.key);
    const row: LabelRow = {
      ...l,
      userId,
      key: await blindIndex(keys.mac, labelKey(name)),
      box: await seal(keys.enc, { name }, aad(userId, "labels", l.id)),
      updatedAt: now,
    };
    delete row.name;
    return row;
  });
  const expenses = await openAll(expenseRows, async (e) =>
    sealExpense({ ...(await openExpense(e)), userId, updatedAt: now }),
  );
  const prefs = await openAll(prefsToSeal, async (p): Promise<Pref> =>
    isBudget(p) ? sealPref(userId, p.key, p.value, now) : { userId, key: p.key, value: p.value, updatedAt: now },
  );

  await db.transaction("rw", db.expenses, db.labels, db.prefs, async () => {
    /** Old label id → the label it merged into. */
    const merged = new Map<string, string>();
    for (const label of labels) {
      const twin = await db.labels.where("[userId+key]").equals([userId, label.key]).first();
      if (!twin || twin.id === label.id) {
        await db.labels.put(label);
        continue;
      }
      merged.set(label.id, twin.id);
      await db.expenses
        .where("labelId")
        .equals(label.id)
        .modify((e) => {
          e.labelId = twin.id;
          e.updatedAt = clock.stamp(e.updatedAt);
        });
      await db.labels.update(twin.id, {
        useCount: twin.useCount + label.useCount,
        lastUsedAt: Math.max(twin.lastUsedAt, label.lastUsedAt),
        updatedAt: clock.stamp(twin.updatedAt),
      });
      await db.labels.delete(label.id);
    }

    await db.expenses.bulkPut(expenses.map((e) => ({ ...e, labelId: merged.get(e.labelId) ?? e.labelId })));

    await db.prefs.bulkPut(prefs);
    await db.prefs.where("userId").equals(UNOWNED).delete();
  });
}

/** Device pref: this user's boxes have all been re-sealed with padding. */
const PADDED_PREF = "sealPadded";

/**
 * Re-seal boxes sealed before padding existed (`lib/crypto.ts`), once per user
 * on this device, so their size stops showing how long the value is. The values
 * don't change, so neither does `updatedAt`: there's nothing new to sync.
 */
async function padOldBoxes(userId: string): Promise<void> {
  if ((await db.prefs.get([userId, PADDED_PREF]))?.value) return;
  const unpadded = <T extends { userId: string; box?: Box }>(r: T) => r.userId === userId && !!r.box && !isPadded(r.box);
  const [labelRows, expenseRows, prefRows] = await Promise.all([
    db.labels.where("userId").equals(userId).filter(unpadded).toArray(),
    db.expenses.where("userId").equals(userId).filter(unpadded).toArray(),
    db.prefs.where("userId").equals(userId).filter(unpadded).toArray(),
  ]);
  const enc = keysFor(userId).enc;
  const reseal = async (box: Box, table: string, id: string) => seal(enc, await open(enc, box, aad(userId, table, id)), aad(userId, table, id));
  const [labels, expenses, prefs] = await Promise.all([
    openAll(labelRows, async (l) => ({ ...l, box: await reseal(l.box!, "labels", l.id) })),
    openAll(expenseRows, async (e) => ({ ...e, box: await reseal(e.box!, "expenses", e.id) })),
    openAll(prefRows, async (p) => ({ ...p, box: await reseal(p.box!, "prefs", p.key) })),
  ]);

  await db.transaction("rw", db.expenses, db.labels, db.prefs, async () => {
    // Skip a row changed meanwhile (another tab): its new box is padded already.
    const same = <T extends { updatedAt?: number }>(fresh: T[], current: (T | undefined)[]) =>
      fresh.filter((r, i) => current[i]?.updatedAt === r.updatedAt);
    await db.labels.bulkPut(same(labels, await db.labels.bulkGet(labels.map((l) => l.id))));
    await db.expenses.bulkPut(same(expenses, await db.expenses.bulkGet(expenses.map((e) => e.id))));
    await db.prefs.bulkPut(same(prefs, await db.prefs.bulkGet(prefs.map((p): [string, string] => [userId, p.key]))));
    await db.prefs.put({ userId, key: PADDED_PREF, value: true, updatedAt: clock.now() });
  });
}

/** Ask the browser not to evict our IndexedDB under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported — data still works, just best-effort persistence.
  }
}

// ---------------------------------------------------------------------------
// Sync (lib/sync.ts). Rows cross this boundary opened: the server stores plain
// values under RLS, and this device keeps them sealed.

/** A label as synced: plain name; the server derives its unique key from it. */
export type SyncLabel = Pick<Label, "id" | "name" | "color" | "useCount" | "lastUsedAt" | "createdAt" | "updatedAt" | "deletedAt">;
export type SyncExpense = Omit<Expense, "userId">;
/** A month's budget as synced. `value` is null for a removed budget. */
export type SyncBudget = { key: string; value: BudgetLine[] | null; updatedAt: number; deletedAt?: number };
export type SyncBatch = { labels: SyncLabel[]; expenses: SyncExpense[]; prefs: SyncBudget[] };

/** The user's rows changed at or after `since`, opened. Device-only prefs stay local. */
export async function pendingChanges(userId: string, since: number): Promise<SyncBatch> {
  const range: [unknown[], unknown[]] = [[userId, since], [userId, Dexie.maxKey]];
  const [labelRows, expenseRows, prefRows] = await Promise.all([
    db.labels.where("[userId+updatedAt]").between(...range).toArray(),
    db.expenses.where("[userId+updatedAt]").between(...range).toArray(),
    db.prefs.where("[userId+updatedAt]").between(...range).filter(isBudget).toArray(),
  ]);
  const [labels, expenses, prefs] = await Promise.all([
    openAll(labelRows, openLabel),
    openAll(expenseRows, openExpense),
    openAll(prefRows, async (p): Promise<SyncBudget> => ({
      key: p.key,
      value: p.deletedAt ? null : asLines(await openPref(p)),
      updatedAt: p.updatedAt ?? 0,
      ...(p.deletedAt ? { deletedAt: p.deletedAt } : {}),
    })),
  ]);
  return {
    labels: labels.map(({ id, name, color, useCount, lastUsedAt, createdAt, updatedAt, deletedAt }) => ({ id, name, color, useCount, lastUsedAt, createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}) })),
    expenses: expenses.map(({ id, amount, note, labelId, date, createdAt, updatedAt, deletedAt }) => ({ id, amount, note, labelId, date, createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}) })),
    prefs,
  };
}

/**
 * Store rows pulled from the server. The newest `updatedAt` wins, row by row.
 * A pulled label with the same name as a local one under another id means the
 * local one never reached the server (names are unique there too): its
 * expenses move to the pulled label, and the local one goes.
 */
export async function applyRemote(userId: string, batch: SyncBatch): Promise<void> {
  if (!batch.labels.length && !batch.expenses.length && !batch.prefs.length) return;
  // Seal everything first; the transaction below only reads and writes.
  const keys = keysFor(userId);
  const [labels, expenses, prefs] = await Promise.all([
    openAll(batch.labels, async (l): Promise<LabelRow> => {
      const name = cleanLabelName(l.name);
      const [key, box] = await Promise.all([
        blindIndex(keys.mac, labelKey(name)),
        seal(keys.enc, { name }, aad(userId, "labels", l.id)),
      ]);
      return {
        id: l.id,
        userId,
        key,
        box,
        color: l.color,
        useCount: l.useCount,
        lastUsedAt: l.lastUsedAt,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        ...(l.deletedAt ? { deletedAt: l.deletedAt } : {}),
      };
    }),
    openAll(batch.expenses, (e) => sealExpense({ ...e, userId })),
    openAll(batch.prefs, async (p): Promise<Pref> =>
      p.deletedAt || !p.value
        ? { userId, key: p.key, updatedAt: p.updatedAt, deletedAt: p.deletedAt ?? p.updatedAt }
        : sealPref(userId, p.key, p.value, p.updatedAt),
    ),
  ]);

  await db.transaction("rw", db.expenses, db.labels, db.prefs, async () => {
    const localLabels = await db.labels.bulkGet(labels.map((l) => l.id));
    for (const [i, label] of labels.entries()) {
      const local = localLabels[i];
      if (local) {
        if (local.userId === userId && local.updatedAt < label.updatedAt) await db.labels.put(label);
        continue;
      }
      const twin = await db.labels.where("[userId+key]").equals([userId, label.key]).first();
      if (twin) {
        await db.expenses
          .where("labelId")
          .equals(twin.id)
          .filter((e) => e.userId === userId)
          .modify((e) => {
            e.labelId = label.id;
            e.updatedAt = clock.stamp(e.updatedAt);
          });
        await db.labels.delete(twin.id);
        label.useCount += twin.useCount;
        label.lastUsedAt = Math.max(label.lastUsedAt, twin.lastUsedAt);
        label.updatedAt = clock.stamp(label.updatedAt);
        // The local label's expenses now use the pulled one, so it can't stay deleted.
        if (!twin.deletedAt) delete label.deletedAt;
      }
      await db.labels.put(label);
    }

    const localExpenses = await db.expenses.bulkGet(expenses.map((e) => e.id));
    await db.expenses.bulkPut(
      expenses.filter((e, i) => {
        const local = localExpenses[i];
        return !local || (local.userId === userId && local.updatedAt < e.updatedAt);
      }),
    );

    const localPrefs = await db.prefs.bulkGet(prefs.map((p): [string, string] => [userId, p.key]));
    await db.prefs.bulkPut(prefs.filter((p, i) => (localPrefs[i]?.updatedAt ?? -1) < (p.updatedAt ?? 0)));
  });
}

export type SyncCursor = "pushedAt" | "pulledAt";

/** Where sync left off on this device. Kept in device-only prefs (`sync:*`). */
export async function getSyncCursor(userId: string, name: SyncCursor): Promise<number> {
  const v = (await db.prefs.get([userId, `sync:${name}`]))?.value;
  return typeof v === "number" ? v : 0;
}

export async function setSyncCursor(userId: string, name: SyncCursor, value: number): Promise<void> {
  await db.prefs.put({ userId, key: `sync:${name}`, value, updatedAt: Date.now() });
}

/** The newest `updatedAt` among rows that sync, so a write can schedule a push. */
export async function latestLocalChange(userId: string): Promise<number> {
  const newest = <T extends { updatedAt?: number }>(rows: Dexie.Collection<T>) => rows.last().then((r) => r?.updatedAt ?? 0);
  const range: [unknown[], unknown[]] = [[userId, Dexie.minKey], [userId, Dexie.maxKey]];
  const [e, l, p] = await Promise.all([
    newest(db.expenses.where("[userId+updatedAt]").between(...range)),
    newest(db.labels.where("[userId+updatedAt]").between(...range)),
    db.prefs.where("[userId+updatedAt]").between(...range).reverse().filter(isBudget).first().then((r) => r?.updatedAt ?? 0),
  ]);
  return Math.max(e, l, p);
}

/** A stamp further ahead of the server than this came from a device clock that was ahead. */
const FUTURE_MARGIN_MS = 5 * 60_000;

/**
 * Re-stamp the user's rows stamped in the future to the server's time (they were
 * written while a device clock was ahead), so edits made elsewhere can win again,
 * and make sure the next push sends them. A push cursor from the future would
 * skip every change, so it starts over.
 */
export async function healFutureStamps(userId: string, serverNow: number): Promise<void> {
  const range: [unknown[], unknown[]] = [[userId, serverNow + FUTURE_MARGIN_MS], [userId, Dexie.maxKey]];
  const cursorKey: [string, string] = [userId, "sync:pushedAt"];
  await db.transaction("rw", db.expenses, db.labels, db.prefs, async () => {
    const healed =
      (await db.expenses.where("[userId+updatedAt]").between(...range).modify({ updatedAt: serverNow })) +
      (await db.labels.where("[userId+updatedAt]").between(...range).modify({ updatedAt: serverNow })) +
      (await db.prefs.where("[userId+updatedAt]").between(...range).filter(isBudget).modify({ updatedAt: serverNow }));
    const cursor = (await db.prefs.get(cursorKey))?.value;
    if (typeof cursor !== "number") return;
    if (cursor > serverNow + FUTURE_MARGIN_MS) await db.prefs.update(cursorKey, { value: 0 });
    else if (healed && cursor >= serverNow) await db.prefs.update(cursorKey, { value: serverNow - 1 });
  });
}

/**
 * Forget this user's data on this device, keys included. Only for when the keys
 * can't be opened any more (the password was changed or reset elsewhere); the
 * server still has everything that was synced, and the next sync pulls it back.
 */
export async function resetLocalData(userId: string): Promise<void> {
  await db.transaction("rw", [db.expenses, db.labels, db.prefs, db.vault], async () => {
    await db.expenses.where("userId").equals(userId).delete();
    await db.labels.where("userId").equals(userId).delete();
    await db.prefs.where("userId").equals(userId).delete();
    await db.vault.where("[userId+kind]").between([userId, Dexie.minKey], [userId, Dexie.maxKey]).delete();
  });
}
