/**
 * WebCrypto helpers for encrypting data at rest.
 *
 * Each user has 64 bytes of key material: an AES-GCM key that seals sensitive
 * fields and an HMAC key for blind indexes (deterministic lookups such as
 * label-name uniqueness). The material is stored only wrapped by a key derived
 * from the password or PIN; once unwrapped it's imported non-extractable and
 * kept in memory by `lib/vault.ts`.
 *
 * WebCrypto calls must not run inside a Dexie transaction: IndexedDB commits a
 * transaction as soon as it has no pending requests, so prepare sealed rows first.
 */

/** A sealed value: AES-GCM ciphertext of its JSON. */
export type Box = { iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer };

export type Keyset = { enc: CryptoKey; mac: CryptoKey };

/** Key material wrapped by a password- or PIN-derived key. */
export type Wrapped = {
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
  iv: Uint8Array<ArrayBuffer>;
  wrapped: ArrayBuffer;
};

/** PBKDF2-SHA-256 work factor (OWASP 2023). Stored per wrap, so it can be raised later. */
export const KDF_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const random = (bytes: number) => crypto.getRandomValues(new Uint8Array(bytes));

/**
 * Whether this page can encrypt. Browsers expose `crypto.subtle` only in a
 * secure context (HTTPS or localhost), so a phone opening `http://192.168.x.x`
 * has none and the data can't be unlocked there.
 */
export function hasWebCrypto(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

/** A v4 UUID. `crypto.randomUUID` needs a secure context; `getRandomValues` doesn't. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Fresh key material for a new user on this device. */
export function newKeyMaterial(): Uint8Array<ArrayBuffer> {
  return random(64);
}

export async function wrapKeyMaterial(raw: Uint8Array<ArrayBuffer>, secret: string): Promise<Wrapped> {
  const salt = random(16);
  const iv = random(12);
  const kek = await deriveKek(secret, salt, KDF_ITERATIONS);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { salt, iterations: KDF_ITERATIONS, iv, wrapped };
}

/**
 * The key material, or `null` when the secret is wrong. Anything else (no
 * WebCrypto, say) throws: a wrong-password result can make sign-in start the
 * device over, so it must never stand in for a broken environment.
 */
export async function unwrapKeyMaterial(w: Wrapped, secret: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const kek = await deriveKek(secret, w.salt, w.iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: w.iv }, kek, w.wrapped));
  } catch (err) {
    // AES-GCM reports a failed tag check (wrong key) as OperationError.
    if (err instanceof DOMException && err.name === "OperationError") return null;
    throw err;
  }
}

/** Non-extractable keys: page code can use them while unlocked but never read them out. */
export async function importKeyset(raw: Uint8Array<ArrayBuffer>): Promise<Keyset> {
  const [enc, mac] = await Promise.all([
    crypto.subtle.importKey("raw", raw.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]),
    crypto.subtle.importKey("raw", raw.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  ]);
  return { enc, mac };
}

/** Smallest padded size, in bytes. Sealed values are 64, 128, 256, … bytes before the tag. */
const MIN_PADDED = 64;

/**
 * JSON padded with trailing spaces to a power of two, so the box's size doesn't
 * give away how many digits an amount has or how long a note is.
 * `JSON.parse` ignores the spaces, so boxes sealed before padding still open.
 */
function padded(value: unknown): Uint8Array<ArrayBuffer> {
  const json = encoder.encode(JSON.stringify(value));
  const size = Math.max(MIN_PADDED, 2 ** Math.ceil(Math.log2(json.length)));
  const out = new Uint8Array(size).fill(0x20);
  out.set(json);
  return out;
}

/** Whether a box was sealed with padding (or happens to be exactly a padded size). */
export function isPadded(box: Box): boolean {
  const size = box.ct.byteLength - 16; // AES-GCM appends a 16-byte tag
  return size >= MIN_PADDED && (size & (size - 1)) === 0;
}

/**
 * Encrypt `value` as padded JSON. `aad` binds the box to its row (owner, table,
 * id), so a box copied into another row or another user's row won't open.
 */
export async function seal(key: CryptoKey, value: unknown, aad: string): Promise<Box> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(aad) }, key, padded(value));
  return { iv, ct };
}

export async function open<T>(key: CryptoKey, box: Box, aad: string): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv, additionalData: encoder.encode(aad) }, key, box.ct);
  return JSON.parse(decoder.decode(plain)) as T;
}

/** Deterministic, keyed digest of `text` (hex), for indexing a value without storing it. */
export async function blindIndex(mac: CryptoKey, text: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", mac, encoder.encode(text)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
