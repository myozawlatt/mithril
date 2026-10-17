"use client";

import { useState } from "react";
import PinInput from "./PinInput";
import { signOut, type User } from "@/lib/auth";
import { leaveWeb } from "@/lib/useInstallPrompt";
import { UNLOCK_FAILED, unlockWithPassword, unlockWithPin, useHasPin, useVault } from "@/lib/vault";

const inputClass =
  "h-12 rounded-2xl bg-white/75 px-4 text-sm text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-violet-300";

/** Signed in, but the data on this device is locked: PIN if set, otherwise password. */
export default function UnlockScreen({ user }: { user: User }) {
  const hasPin = useHasPin(user.id);
  const vault = useVault();
  const [withPassword, setWithPassword] = useState(false);
  const [secret, setSecret] = useState("");
  // A failed unlock right after sign-in lands here with its reason.
  const [error, setError] = useState<string | null>(() => (vault.status === "locked" && vault.error) || null);
  const [busy, setBusy] = useState(false);

  const pinMode = hasPin === true && !withPassword;

  function switchTo(password: boolean) {
    setWithPassword(password);
    setSecret("");
    setError(null);
  }

  async function tryPin(pin: string) {
    setBusy(true);
    setError(null);
    const result = await unlockWithPin(user.id, pin).catch(() => null);
    // On success this screen unmounts.
    if (result?.ok) return;
    setBusy(false);
    setSecret("");
    if (!result) {
      setError(UNLOCK_FAILED);
      return;
    }
    if ("removed" in result) {
      switchTo(true);
      setError("Too many wrong PINs, so the PIN was removed. Unlock with your password.");
    } else {
      setError(`Wrong PIN. ${result.left} ${result.left === 1 ? "try" : "tries"} left.`);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    setError(null);
    const ok = await unlockWithPassword(user.id, secret).catch(() => null);
    if (ok) return;
    setBusy(false);
    setError(ok === false ? "Wrong password." : UNLOCK_FAILED);
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <div className="glass mx-auto mb-4 grid size-16 place-items-center rounded-3xl" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-ink">
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Locked</h1>
        <p className="mt-1 truncate text-sm text-muted">{user.email ?? "Your account"}</p>
      </div>

      {hasPin === undefined ? (
        <div className="glass h-33 animate-pulse rounded-[28px]" />
      ) : pinMode ? (
        <div className="glass flex flex-col gap-3 rounded-[28px] p-5">
          <p className="text-center text-sm text-muted">Enter your PIN</p>
          <PinInput value={secret} onChange={setSecret} onComplete={tryPin} label="PIN" autoFocus disabled={busy} className="bg-white/75" />
          {error && (
            <p role="alert" className="px-1 text-center text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
          <button type="button" onClick={() => switchTo(true)} className="h-10 text-sm font-semibold text-accent-ink">
            Use password instead
          </button>
        </div>
      ) : (
        <form onSubmit={submitPassword} className="glass flex flex-col gap-3 rounded-[28px] p-5" noValidate>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            enterKeyHint="go"
            autoFocus
            className={inputClass}
          />
          {error && (
            <p role="alert" className="px-1 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!secret || busy}
            className="mt-1 h-14 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98] disabled:bg-accent-soft disabled:text-muted disabled:shadow-none"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
          {hasPin && (
            <button type="button" onClick={() => switchTo(false)} className="h-10 text-sm font-semibold text-accent-ink">
              Use PIN instead
            </button>
          )}
        </form>
      )}

      <button
        type="button"
        onClick={() => {
          signOut();
          leaveWeb();
        }}
        className="mx-auto h-10 px-4 text-sm font-semibold text-muted"
      >
        Sign out
      </button>
    </div>
  );
}
