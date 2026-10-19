<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (mithril)

Client-only, offline-first PWA: the app reads and writes IndexedDB (Dexie) on the device, and `lib/sync.ts` keeps it in step with Supabase in the background. See `README.md` for the project map, data model and Supabase setup.

### Storage
- `lib/repo.ts` is the only module that reads or writes `db`. The exceptions are `lib/privacy.ts` (privacy pref) and `lib/vault.ts` (keys, PIN, auto-lock), which follow the same rules. Components never import `db`; they may import its types.
- Rows sync to Supabase: UUID ids (`newId()`; the server columns are `uuid`), whole-MMK integer amounts, `updatedAt` bumped on **every** write (sync pushes by it, and the newest wins), and soft deletes (`deletedAt`). Never hard-delete real expenses, labels or budgets; a removed budget is a tombstone pref. Stamp with `lib/clock.ts`, never `Date.now()`: `clock.now()` for new rows and `clock.stamp(prev.updatedAt)` when replacing a row, so an edit always beats what it replaced and follows the server's clock. The one write that keeps `updatedAt` is re-sealing the same value (`padOldBoxes`). The one exception is `resetLocalData`, which drops a device's copy after the password changed elsewhere.
- **Data at rest is encrypted.** Amounts, notes, label names and budget values are stored only sealed in a `box` (`lib/crypto.ts`), with the user's keys from `lib/vault.ts` and AAD `userId|table|id`. Go through the repo helpers (`sealExpense`, `prepareLabel`, `sealPref`/`openPref`, and so on). Never store or index a sensitive field in plain. `seal` pads the JSON to a power of two (64 bytes or more) so a box's size doesn't reveal the value's length; boxes from before padding are re-sealed once per user and device on unlock (pref `sealPadded`). Label uniqueness uses an HMAC blind index in `key`. Plaintext is kept for ids, owner, dates, timestamps and flags.
- **No WebCrypto inside a Dexie transaction**: IndexedDB commits it early. Seal before `db.transaction(...)`, and in live queries do every read first, then open the rows.
- Schema changes go in a **new** `db.version(n)` in `lib/db.ts`, with an upgrade function. Never edit an existing version. A table's primary key can't change in place: add a new table, copy the rows, and drop the old one (`table: null`) in a *later* version so the upgrade can still read it.

### Where the app runs
- `app/page.tsx` (`Platform`) decides what to show. Under `next dev`, the app always runs in the browser. In production it runs as the installed PWA (`isStandalone`). A browser tab gets `InstallScreen` on a phone or tablet (`isMobileDevice`, detected from the user agent rather than the viewport) and `OpenOnMobileScreen` on a desktop. Both screens are in `components/InstallScreen.tsx`, and both have a **Use the web version** link that shows the app in the tab. The choice is kept in memory only (`chooseWeb`/`leaveWeb`), so a reload or Sign out brings the screen back.
- The app needs WebCrypto, which exists only in a secure context (HTTPS or `localhost`). On plain `http://` (a phone on the LAN) `AuthGate` shows `NeedsHttpsScreen` instead of `LoginScreen`. An unlock that throws goes back to `UnlockScreen` with `UNLOCK_FAILED`, never stays on "unlocking". `unwrapKeyMaterial` returns `null` only for a failed AES-GCM tag check: any other error must throw, because a wrong-password result at sign-in makes `startOver` wipe the device.
- `lib/useInstallPrompt.ts` captures `beforeinstallprompt` when the module loads, not in an effect, because the event can fire before React mounts. Don't move it back into a component.

### Auth and per-user data
- `lib/auth.tsx` owns who is signed in. Its `AuthClient` is a structural subset of `supabase.auth`, implemented by `supabaseAuth` in `lib/supabase.ts`. That adapter keeps a locked or offline launch signed in: supabase-js reports no session while the app is locked or when it can't refresh offline, so the adapter falls back to the last user (`mithril-user` in localStorage) when this device holds their session, and it drops `INITIAL_SESSION`.
- **The Supabase session is never stored in plain.** `lib/authSession.ts` is supabase-js's `auth.storage`: the session is sealed with the user's data key (AAD `userId|auth|session`) in localStorage, and only readable while unlocked (`unlockSession`/`lockSession`, called by the vault). A session from sign-in waits in memory until the unlock seals it. Sign out runs **before** `lock()`, because ending the session on the server needs it. A sign-out that can't reach the server (offline, or from the unlock screen) keeps a sealed copy, and sync's `revokeLeftoverSessions` ends it at that user's next online unlock. There is **no registration**: accounts are added in the Supabase dashboard, so don't add sign-up.
- `components/AuthGate.tsx` renders `LoginScreen` until someone is signed in, `UnlockScreen` until their keys are loaded (`useVault()`), then `<Tracker key={user.id} />`. There's no `/login` route or proxy, so the service-worker shell and offline launch keep working.
- **Every row has an owner `userId`, and every query and mutation must be scoped to it:**
  - Hooks get the id from `useUser().id` and include it in the `useLiveQuery` deps.
  - Mutations (event handlers) call `currentUserId()`, which throws when nobody is signed in.
  - Query through the user indexes: `where("userId")`, `[userId+date]`, `[userId+key]`, `[userId+lastUsedAt]`. Never use a table-wide `filter()`/`toArray()`.
  - Touch a single expense by id only through `ownExpense(userId, id)`, and a single label only through `ownLabel(userId, id)`, so an id can never reach another user's row.
  - A label is deleted only while no live expense uses it (`deleteLabel`), and softly: it keeps its key, so the name stays taken. `upsertLabel` and `restoreExpense` bring a deleted label back. A live expense never points to a deleted label. Renaming onto a taken name merges (`renameLabel` with `merge`).
  - Label names are unique **per user** (`&[userId+key]`). `upsertLabel(userId, name)` must run inside a transaction that includes `db.labels`.
  - Settings live in `prefs`, keyed `[userId, key]` (`budget:YYYY-MM`, `privacy`, `autoLock`, `pinOffer`, `sealPadded`, `sync:*`). There is no global settings table. Only `budget:*` syncs; the rest are per device.
  - A month's budget (`budget:YYYY-MM`) is a `BudgetLine[]` (`lib/budget.ts`) of named amounts; the budget is their sum. Months don't inherit budgets from each other, and there's no `budget:default` any more (v6 migrated it away).
- `UNOWNED` (`""`) marks rows written before sign-in existed. `prepareUserData(userId)` runs on every unlock (through `VaultProvider`'s `onUnlock`). It seals the user's rows that are still in plain, and hands unowned rows to that user, merging labels with the same name. The user's own labels and prefs win.
- Data stays on the device after sign-out, encrypted. Privacy masking defaults to hidden for a user with no saved pref.

### Locking
- `lib/vault.ts` keeps each user's keys in memory only. Their key material is stored in `db.vault`, wrapped by a PBKDF2 key from the password and, optionally, from a 6-digit PIN. It's never synced.
- Login unlocks with the same password. A reload, Sign out, "Lock now" or auto-lock drops the keys. Auto-lock is pref `autoLock`: 1, 5 or 15 minutes in the background or idle on screen, default 5. A lock in one tab locks every tab (`BroadcastChannel("mithril-vault")`).
- After a password unlock with no PIN set, the tracker offers a PIN (`pinOffer`) until the user sets one or taps "Not now". The account menu can set up, change or remove the PIN. Setting or changing it asks for the password, because the in-memory keys are non-extractable. 5 wrong PINs in a row delete the PIN. A try is counted before the PIN is checked, and tries run one at a time (Web Locks across tabs), so they can't race past the limit.
- There's no recovery key. A forgotten PIN means unlocking with the password. A forgotten password is reset in Supabase. When Supabase accepts a password that doesn't open this device's wrap, `LoginScreen` passes `startOver` to `unlockWithPassword`: it clears the user's local rows and vault (`resetLocalData`), makes new keys, and sync pulls the data back. Changes that weren't pushed yet are lost.
- CSP is set in `next.config.ts`: `connect-src` is `'self'` plus the origin of `NEXT_PUBLIC_SUPABASE_URL`, read at build time.

### Supabase
- Tables live in the **`mithril` schema** (not `public`), defined in `supabase/schema.sql`. It's pasted into the SQL editor; there's no Supabase CLI. `mithril` must be listed under Data API → Exposed schemas. Every server schema change does **both**:
  - Update `supabase/schema.sql`, so it always sets up a new project in full.
  - Add a migration file for existing projects in `supabase/migrations/`, named `YYYYMMDD_short_name.sql`. It holds only that change (`alter ...`, written to be safe to run again, such as `if not exists`). Never edit a migration that has already been added; write a new one.
- `lib/supabase.ts` creates the client lazily (`supabase()`, `db.schema = "mithril"`) from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Without them the build still works, and sign-in says it isn't set up.
- Server rows mirror the Dexie rows in snake_case, with `user_id`, bigint ms timestamps and a server-set `synced_at`. RLS is `auth.uid() = user_id`. `authenticated` gets select, insert and update only, with no deletes. A trigger ignores a write whose `updated_at` isn't newer than the stored one, brings a stamp more than 5 minutes in the future back to the server's time, and lets a newer write replace a stored stamp from the future. `mithril.server_time()` returns the server's clock in ms.
- Sync sends **opened** values: the server can read the data, and RLS protects it. The vault is never synced, and each device makes its own keys.
- `lib/sync.ts` doesn't touch `db`. It goes through `pendingChanges`, `applyRemote`, `getSyncCursor`/`setSyncCursor` and `latestLocalChange` in `lib/repo.ts`.
  - **Pull** is by `synced_at`, from 30 s before the last pull cursor, which is server time. **Push** is by local `updatedAt`, from 5 s before the last push.
  - `applyRemote` seals first and then writes: newest `updatedAt` wins. A pulled label whose name matches a local label with another id absorbs it.
  - Device prefs are never pushed.
  - A full run (with pull) first measures the server's clock (`alignClock` → `clock.setServerOffset`), re-stamps local rows stamped in the future (`healFutureStamps`), and ends leftover signed-out sessions.
  - `useSync()` in `Tracker` runs sync on unlock, `online`, visibility and every 5 min, and pushes 1.5 s after local writes.
- `scripts/seed-sample.mjs` (`npm run seed -- <email>`) writes demo rows straight to the server with `SUPABASE_SECRET_KEY`. It imports `lib/labels.ts`, so label keys match the app's. That key must never be `NEXT_PUBLIC_*` or reach the client.

### Checks
Run `npx tsc --noEmit`, `npm run lint` and `npm run build` after changes. Dexie logic can be exercised in Node with `fake-indexeddb/auto` plus `tsx`, importing `lib/db.ts` and `lib/repo.ts` directly.
