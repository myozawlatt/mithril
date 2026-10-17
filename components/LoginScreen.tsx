"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth";
import { resetLocalData } from "@/lib/repo";
import { beginUnlock, lock, unlockWithPassword } from "@/lib/vault";
import AppIcon from "./AppIcon";

const inputClass =
  "h-12 rounded-2xl bg-white/75 px-4 text-sm text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-violet-300";

/** Email + password sign-in. Accounts are created by an admin; there's no sign-up. */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = !!email.trim() && !!password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    // Unlocking shows a skeleton instead of the unlock screen between sign-in and unlock.
    beginUnlock();
    const result = await signIn(email, password);
    if ("error" in result) {
      lock();
      setError(result.error === "Invalid login credentials" ? "Wrong email or password." : result.error);
      setBusy(false);
      return;
    }
    // This screen unmounts once the session lands; the same password unlocks the data.
    // Supabase just accepted this password, so if this device's data doesn't open
    // with it, it was locked with an old one (changed or reset elsewhere) and can't
    // be opened any more: start this device over, and sync pulls the data back.
    // A failure there leaves the unlock screen showing why (see `lib/vault.ts`).
    await unlockWithPassword(result.user.id, password, () => resetLocalData(result.user.id)).catch(() => setBusy(false));
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <AppIcon />
        <h1 className="text-3xl font-semibold tracking-tight text-ink">mithril</h1>
        <p className="mt-1 text-sm text-muted">Sign in to see your expenses.</p>
      </div>

      <form onSubmit={submit} className="glass flex flex-col gap-3 rounded-[28px] p-5" noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
          enterKeyHint="next"
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          enterKeyHint="go"
          className={inputClass}
        />
        {error && (
          <p role="alert" className="px-1 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 h-14 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98] disabled:bg-accent-soft disabled:text-muted disabled:shadow-none"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
