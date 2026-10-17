"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { currentUserId, useUser } from "./auth";
import { lockSession, unlockSession } from "./authSession";
import { importKeyset, newKeyMaterial, unwrapKeyMaterial, wrapKeyMaterial, type Keyset } from "./crypto";
import { db } from "./db";

/**
 * Holds the signed-in user's data keys, in memory only. Locked means no keys:
 * what's in IndexedDB can't be read until the user unlocks with their password
 * (or PIN). Reloading, signing out, "Lock now" and auto-lock all drop the keys.
 *
 * The PIN is a convenience lock against someone picking up the device. A
 * 6-digit PIN can be brute-forced offline by someone who copies the database;
 * the password is what protects against that.
 */

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;

export const AUTO_LOCK_CHOICES = [1, 5, 15] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number];
const DEFAULT_AUTO_LOCK: AutoLockMinutes = 5;

const AUTO_LOCK_KEY = "autoLock";
const PIN_OFFER_KEY = "pinOffer";

export type VaultState =
  | { status: "locked"; /** Why the last unlock failed, other than a wrong secret. */ error?: string }
  | { status: "unlocking" }
  | { status: "unlocked"; userId: string; /** Offer a PIN now (after a password unlock, none set). */ pinOffer: boolean };

const LOCKED: VaultState = { status: "locked" };

let state: VaultState = LOCKED;
let keys: { userId: string; keyset: Keyset } | null = null;
/** Key material kept from a password unlock so the PIN offer needn't ask again. Cleared on lock. */
let offerMaterial: Uint8Array<ArrayBuffer> | null = null;
/** Bumped by `lock()`, so an unlock still in flight doesn't publish afterwards. */
let generation = 0;
let autoLockMs = DEFAULT_AUTO_LOCK * 60_000;
/** Last touch, key press or scroll; an unlocked app left on screen locks after `autoLockMs`. */
let lastActive = Date.now();
let onUnlock: ((userId: string) => Promise<void>) | undefined;

const listeners = new Set<() => void>();

function publish(next: VaultState) {
  state = next;
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useVault(): VaultState {
  return useSyncExternalStore(subscribe, () => state, () => LOCKED);
}

/** The user's data keys. Throws while locked, or when they belong to someone else. */
export function keysFor(userId: string): Keyset {
  if (!keys || keys.userId !== userId) throw new Error("Locked");
  return keys.keyset;
}

/** Every tab of the app on this device; a lock in one locks them all. */
const tabs = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("mithril-vault") : null;
tabs?.addEventListener("message", (e) => {
  if (e.data === "lock") dropKeys();
});

/** Lock this tab only. Returns whether it had anything to drop. */
function dropKeys(): boolean {
  const had = !!keys || state.status !== "locked";
  generation += 1;
  keys = null;
  offerMaterial?.fill(0);
  offerMaterial = null;
  lockSession();
  if (state.status !== "locked") publish(LOCKED);
  return had;
}

/** Lock the app, in every tab. */
export function lock(): void {
  if (dropKeys()) tabs?.postMessage("lock");
}

export const UNLOCK_FAILED = "Couldn’t open your data on this device. Try again.";

/**
 * Runs an unlock. If it throws (storage or WebCrypto failing), the app goes
 * back to the unlock screen with a reason instead of staying on "unlocking".
 */
async function failSafe<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error("Unlock failed", err);
    dropKeys();
    publish({ status: "locked", error: UNLOCK_FAILED });
    throw err;
  }
}

/** Show the app as unlocking (skeleton) while sign-in and the password unlock run. */
export function beginUnlock(): void {
  publish({ status: "unlocking" });
}

async function finishUnlock(userId: string, material: Uint8Array<ArrayBuffer>, offerPin: boolean): Promise<void> {
  const gen = ++generation;
  publish({ status: "unlocking" });
  const keyset = await importKeyset(material);
  if (gen !== generation) return;
  keys = { userId, keyset };
  offerMaterial = offerPin ? material.slice() : null;
  lastActive = Date.now();
  await unlockSession(userId, keyset.enc);
  try {
    await onUnlock?.(userId);
  } catch (err) {
    console.error("Post-unlock step failed", err);
  }
  autoLockMs = (await readAutoLock(userId)) * 60_000;
  if (gen !== generation) return;
  publish({ status: "unlocked", userId, pinOffer: offerPin });
}

/**
 * Unlock with the account password. The first time on this device it creates
 * the user's keys. Returns false for a wrong password.
 *
 * `startOver` is for a password the server has just accepted: if it doesn't open
 * this device's keys, those were wrapped with an old password. `startOver` clears
 * the user's local data, and new keys are made from this password.
 */
export function unlockWithPassword(userId: string, password: string, startOver?: () => Promise<void>): Promise<boolean> {
  return failSafe(() => passwordUnlock(userId, password, startOver));
}

async function passwordUnlock(userId: string, password: string, startOver?: () => Promise<void>): Promise<boolean> {
  let row = await db.vault.get([userId, "password"]);
  let material = row ? await unwrapKeyMaterial(row, password) : null;
  if (row && !material && startOver) {
    await startOver();
    row = undefined;
  }
  if (!row) {
    material = newKeyMaterial();
    await db.vault.put({ userId, kind: "password", ...(await wrapKeyMaterial(material, password)), failedAttempts: 0, updatedAt: Date.now() });
  }
  if (!material) {
    if (state.status === "unlocking") publish(LOCKED);
    return false;
  }
  const offer = !(await db.vault.get([userId, "pin"])) && (await db.prefs.get([userId, PIN_OFFER_KEY]))?.value !== "dismissed";
  await finishUnlock(userId, material, offer);
  material.fill(0);
  return true;
}

export type PinResult = { ok: true } | { ok: false; left: number } | { ok: false; removed: true };

/** Unlock with the PIN. After MAX_PIN_ATTEMPTS wrong tries in a row the PIN is removed. */
export function unlockWithPin(userId: string, pin: string): Promise<PinResult> {
  return failSafe(async () => {
    const result = await oneAtATime(`mithril-pin:${userId}`, () => checkPin(userId, pin));
    if (!(result instanceof Uint8Array)) return result;
    await finishUnlock(userId, result, false);
    result.fill(0);
    return { ok: true };
  });
}

/**
 * One PIN try: the key material, or why not. The try is counted before the PIN
 * is checked, so a try can't go uncounted (closing the page mid-check, say).
 * Runs one at a time, across tabs too, so tries can't race past the limit.
 */
async function checkPin(userId: string, pin: string): Promise<Uint8Array<ArrayBuffer> | Exclude<PinResult, { ok: true }>> {
  const row = await db.vault.get([userId, "pin"]);
  if (!row) return { ok: false, removed: true };
  const failed = row.failedAttempts + 1;
  await db.vault.update([userId, "pin"], { failedAttempts: failed });
  let material: Uint8Array<ArrayBuffer> | null;
  try {
    material = await unwrapKeyMaterial(row, pin);
  } catch (err) {
    // Couldn't check it at all: that wasn't a try.
    await db.vault.update([userId, "pin"], { failedAttempts: row.failedAttempts });
    throw err;
  }
  if (material) {
    await db.vault.update([userId, "pin"], { failedAttempts: 0 });
    return material;
  }
  if (failed >= MAX_PIN_ATTEMPTS) {
    await db.vault.delete([userId, "pin"]);
    return { ok: false, removed: true };
  }
  return { ok: false, left: MAX_PIN_ATTEMPTS - failed };
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `fn` exclusively: a Web Lock across tabs where there is one, else one at a time in this tab. */
function oneAtATime<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(name, fn) as Promise<T>;
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function savePin(userId: string, material: Uint8Array<ArrayBuffer>, pin: string) {
  await db.vault.put({ userId, kind: "pin", ...(await wrapKeyMaterial(material, pin)), failedAttempts: 0, updatedAt: Date.now() });
}

function endPinOffer() {
  offerMaterial?.fill(0);
  offerMaterial = null;
  if (state.status === "unlocked" && state.pinOffer) publish({ ...state, pinOffer: false });
}

/** Set or change the PIN. Asks for the password, since the in-memory keys can't be exported. */
export async function setPin(password: string, pin: string): Promise<boolean> {
  const userId = currentUserId();
  const row = await db.vault.get([userId, "password"]);
  const material = row && (await unwrapKeyMaterial(row, password));
  if (!material) return false;
  await savePin(userId, material, pin);
  material.fill(0);
  endPinOffer();
  return true;
}

/** Set a PIN from the offer right after a password unlock; no second password prompt. */
export async function acceptPinOffer(pin: string): Promise<void> {
  const userId = currentUserId();
  if (!offerMaterial) throw new Error("No PIN offer");
  await savePin(userId, offerMaterial, pin);
  endPinOffer();
}

/** "Not now" on the PIN offer; it isn't shown again (the account menu still has it). */
export async function dismissPinOffer(): Promise<void> {
  await db.prefs.put({ userId: currentUserId(), key: PIN_OFFER_KEY, value: "dismissed", updatedAt: Date.now() });
  endPinOffer();
}

/** Remove the PIN; unlocking then takes the password. */
export async function removePin(): Promise<void> {
  const userId = currentUserId();
  await db.transaction("rw", db.vault, db.prefs, async () => {
    await db.vault.delete([userId, "pin"]);
    await db.prefs.put({ userId, key: PIN_OFFER_KEY, value: "dismissed", updatedAt: Date.now() });
  });
}

/** Whether the user has a PIN on this device; `undefined` while loading. */
export function useHasPin(userId: string): boolean | undefined {
  return useLiveQuery(async () => !!(await db.vault.get([userId, "pin"])), [userId]);
}

async function readAutoLock(userId: string): Promise<AutoLockMinutes> {
  const v = (await db.prefs.get([userId, AUTO_LOCK_KEY]))?.value;
  return AUTO_LOCK_CHOICES.find((m) => m === v) ?? DEFAULT_AUTO_LOCK;
}

/** Minutes in the background before the app locks. */
export function useAutoLock(): AutoLockMinutes {
  const userId = useUser().id;
  return useLiveQuery(() => readAutoLock(userId), [userId]) ?? DEFAULT_AUTO_LOCK;
}

export async function setAutoLock(minutes: AutoLockMinutes): Promise<void> {
  await db.prefs.put({ userId: currentUserId(), key: AUTO_LOCK_KEY, value: minutes, updatedAt: Date.now() });
  autoLockMs = minutes * 60_000;
}

/**
 * Runs `onUnlock` (e.g. sealing old rows) before the app sees the keys, and
 * locks after the app has been in the background, or left idle on screen,
 * longer than the auto-lock time.
 */
export function VaultProvider({ children, onUnlock: run }: { children: ReactNode; onUnlock?: (userId: string) => Promise<void> }) {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    onUnlock = (userId) => runRef.current?.(userId) ?? Promise.resolve();
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const lockIfStale = () => {
      if (hiddenAt !== null && Date.now() - hiddenAt >= autoLockMs) lock();
    };
    // Timers are throttled in the background on phones, so also check on return.
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        timer = setTimeout(lockIfStale, autoLockMs);
      } else {
        lockIfStale();
        hiddenAt = null;
      }
    };

    // Left open on screen (a desktop tab, a phone that doesn't sleep): lock when idle.
    const touched = () => {
      lastActive = Date.now();
    };
    const activity = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    const idle = setInterval(() => {
      if (state.status === "unlocked" && document.visibilityState === "visible" && Date.now() - lastActive >= autoLockMs) lock();
    }, 15_000);

    document.addEventListener("visibilitychange", onVisibility);
    for (const type of activity) window.addEventListener(type, touched, { capture: true, passive: true });
    return () => {
      onUnlock = undefined;
      clearTimeout(timer);
      clearInterval(idle);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const type of activity) window.removeEventListener(type, touched, { capture: true });
    };
  }, []);

  return children;
}
