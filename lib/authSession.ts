"use client";

import { open, seal, type Box } from "./crypto";

/**
 * Where supabase-js keeps the Supabase session (its `auth.storage`, see
 * `lib/supabase.ts`).
 *
 * The session's refresh token reads and writes the account on the server, where
 * the data is in plain, so it's never stored in plain: it's sealed with the
 * user's data key, like their expenses. A locked device holds no usable token,
 * and copying the browser's storage gets an attacker no further than the data.
 *
 * - `lib/vault.ts` hands over the key on unlock (`unlockSession`) and takes it
 *   back on lock (`lockSession`). While unlocked, supabase-js reads and writes
 *   the sealed copy in localStorage, which every tab shares.
 * - A session that arrives while locked (sign-in comes before the unlock) waits
 *   in memory and is sealed by the unlock.
 * - A sign-out that couldn't end the session on the server (offline, or signed
 *   out from the unlock screen) keeps a sealed copy (`keepForRevoke`), and
 *   `revokeLeftoverSessions` ends it the next time that user unlocks online.
 */

const SEALED = "mithril-session:";
const REVOKE = "mithril-session-revoke:";
/** Where supabase-js kept the session in plain before; moved into memory and sealed on unlock. */
const LEGACY = "mithril-auth";

const aad = (userId: string) => `${userId}|auth|session`;

let active: { userId: string; key: CryptoKey } | null = null;
/** Values written while locked, by storage key. Sealed by the next unlock. */
const memory = new Map<string, string>();
let legacyLoaded = false;

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // Blocked storage: the session lasts until the page closes.
  }
}

if (typeof window !== "undefined") {
  const legacy = read(LEGACY);
  if (legacy) {
    memory.set(LEGACY, legacy);
    legacyLoaded = true;
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function encodeBox(box: Box): string {
  return JSON.stringify({ iv: toBase64(box.iv), ct: toBase64(new Uint8Array(box.ct)) });
}

function decodeBox(text: string): Box {
  const { iv, ct } = JSON.parse(text) as { iv: string; ct: string };
  return { iv: fromBase64(iv), ct: fromBase64(ct).buffer };
}

/** Whose session a stored value is; `null` for values that aren't a session. */
function ownerOf(value: string): string | null {
  try {
    return (JSON.parse(value) as { user?: { id?: string } }).user?.id ?? null;
  } catch {
    return null;
  }
}

const isWrongKey = (err: unknown) => err instanceof DOMException && err.name === "OperationError";

/** Open a sealed copy; `null` when it was sealed with keys this device no longer has. */
async function openText(userId: string, key: CryptoKey, text: string): Promise<Record<string, string> | null> {
  try {
    return await open<Record<string, string>>(key, decodeBox(text), aad(userId));
  } catch (err) {
    if (isWrongKey(err) || err instanceof SyntaxError) return null;
    throw err;
  }
}

async function readSealed(userId: string, key: CryptoKey): Promise<Record<string, string>> {
  const text = read(SEALED + userId);
  if (!text) return {};
  const values = await openText(userId, key, text);
  if (!values) write(SEALED + userId, null);
  return values ?? {};
}

async function writeSealed(userId: string, key: CryptoKey, values: Record<string, string>): Promise<void> {
  if (!Object.keys(values).length) return write(SEALED + userId, null);
  const text = encodeBox(await seal(key, values, aad(userId)));
  // Locked while sealing: the keys are gone, and so is the right to write.
  if (active?.userId === userId) write(SEALED + userId, text);
}

/** supabase-js `auth.storage`. */
export const authStorage = {
  async getItem(name: string): Promise<string | null> {
    const a = active;
    if (a) {
      const value = (await readSealed(a.userId, a.key))[name];
      if (value !== undefined) return value;
    }
    return memory.get(name) ?? null;
  },

  async setItem(name: string, value: string): Promise<void> {
    const a = active;
    const owner = ownerOf(value);
    if (!a || (owner && owner !== a.userId)) {
      memory.set(name, value);
      return;
    }
    memory.delete(name);
    const values = await readSealed(a.userId, a.key);
    values[name] = value;
    await writeSealed(a.userId, a.key, values);
  },

  async removeItem(name: string): Promise<void> {
    memory.delete(name);
    const a = active;
    if (!a) return;
    const values = await readSealed(a.userId, a.key);
    if (!(name in values)) return;
    delete values[name];
    await writeSealed(a.userId, a.key, values);
  },
};

/** Unlocked: seal any session that came in while locked, and read the sealed one from now on. */
export async function unlockSession(userId: string, key: CryptoKey): Promise<void> {
  active = { userId, key };
  const mine = [...memory].filter(([, value]) => [userId, null].includes(ownerOf(value)));
  if (!mine.length) return;
  const values = await readSealed(userId, key);
  for (const [name, value] of mine) {
    values[name] = value;
    memory.delete(name);
  }
  await writeSealed(userId, key, values);
  if (legacyLoaded && !memory.has(LEGACY)) {
    write(LEGACY, null);
    legacyLoaded = false;
  }
}

/**
 * Locked: drop the key, so the session can't be read. A session still waiting
 * in memory for its unlock stays (a failed unlock after sign-in can be retried).
 */
export function lockSession(): void {
  active = null;
}

/** Whether this device holds a session for the user, sealed or waiting for the unlock. */
export function hasSession(userId: string): boolean {
  return !!read(SEALED + userId) || [...memory.values()].some((v) => ownerOf(v) === userId);
}

/** Whether the user's session can be used right now: unlocked, or just signed in. */
export function isSessionLive(userId: string): boolean {
  return active?.userId === userId || [...memory.values()].some((v) => ownerOf(v) === userId);
}

/** Forget the user's session on this device (after sign-out). */
export function forgetSession(userId: string): void {
  write(SEALED + userId, null);
  for (const [name, value] of memory) if (ownerOf(value) === userId) memory.delete(name);
  if (legacyLoaded && !memory.has(LEGACY)) {
    write(LEGACY, null);
    legacyLoaded = false;
  }
}

function pending(userId: string): string[] {
  try {
    const list = JSON.parse(read(REVOKE + userId) ?? "[]");
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function setPending(userId: string, list: string[]): void {
  write(REVOKE + userId, list.length ? JSON.stringify(list) : null);
}

/**
 * Before signing out: keep the sealed session, in case the server can't be told
 * now. Returns the copy, for `dropRevoke` once the server has ended it.
 */
export function keepForRevoke(userId: string): string | null {
  const text = read(SEALED + userId);
  if (text) setPending(userId, [...pending(userId), text]);
  return text;
}

export function dropRevoke(userId: string, text: string): void {
  setPending(userId, pending(userId).filter((t) => t !== text));
}

/**
 * Refresh tokens of the user's signed-out sessions the server hasn't ended yet.
 * Needs the user unlocked; copies sealed with keys this device no longer has are dropped.
 */
export async function pendingRevokes(userId: string): Promise<{ text: string; refreshToken: string }[]> {
  const a = active;
  if (a?.userId !== userId) return [];
  const out: { text: string; refreshToken: string }[] = [];
  for (const text of pending(userId)) {
    const values = await openText(userId, a.key, text);
    const refreshToken = Object.values(values ?? {})
      .map((v) => {
        try {
          return (JSON.parse(v) as { refresh_token?: string }).refresh_token;
        } catch {
          return undefined;
        }
      })
      .find(Boolean);
    if (refreshToken) out.push({ text, refreshToken });
    else dropRevoke(userId, text);
  }
  return out;
}
