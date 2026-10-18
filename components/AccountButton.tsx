"use client";

import { useState } from "react";
import PinSheet, { type PinSheetMode } from "./PinSheet";
import Sheet from "./Sheet";
import { signOut, useUser } from "@/lib/auth";
import { useSyncStatus, type SyncStatus } from "@/lib/sync";
import { leaveWeb } from "@/lib/useInstallPrompt";
import { AUTO_LOCK_CHOICES, lock, setAutoLock, useAutoLock, useHasPin } from "@/lib/vault";

function syncText({ state, lastSyncedAt }: SyncStatus): string {
  if (state === "syncing") return "Syncing…";
  if (state === "offline") return "Offline · changes are saved on this device";
  if (state === "error") return "Couldn’t sync · will try again";
  if (state === "off") return "Sync isn’t set up";
  if (lastSyncedAt) return `Synced at ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return "Not synced yet";
}

const rowClass =
  "h-12 w-full rounded-2xl bg-accent-soft/60 px-4 text-left text-sm font-semibold text-ink transition active:bg-accent-soft";

/** Avatar in the header; opens who's signed in, security settings and Sign out. */
export default function AccountButton({ offline = false }: { offline?: boolean }) {
  const user = useUser();
  const hasPin = useHasPin(user.id);
  const autoLock = useAutoLock();
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [pinSheet, setPinSheet] = useState<PinSheetMode | null>(null);
  const email = user.email ?? "Signed in";
  const initial = email.charAt(0).toUpperCase();

  const openPin = (mode: PinSheetMode) => {
    setOpen(false);
    setPinSheet(mode);
  };

  return (
    <>
      <button
        type="button"
        aria-label={offline ? "Account, offline" : "Account"}
        title={offline ? "Offline · changes are saved on this device" : undefined}
        onClick={() => setOpen(true)}
        className="relative grid size-11 shrink-0 place-items-center rounded-full transition active:bg-white/60"
      >
        <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-white" aria-hidden>
          {initial}
        </span>
        {/* Overlaps the avatar's foot and stays within the button's width, so the header never grows. */}
        {offline && (
          <span
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] leading-none font-bold text-amber-950 ring-2 ring-white text-shadow-none"
            aria-hidden
          >
            Offline
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Account">
        <div className="mb-5 rounded-2xl bg-accent-soft/60 p-4 text-center">
          <p className="text-xs text-muted">Signed in as</p>
          <p className="mt-0.5 truncate font-semibold text-ink">{email}</p>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {syncText(sync)}
          </p>
        </div>

        <section aria-label="Security" className="mb-5 flex flex-col gap-2">
          {hasPin ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => openPin("change")} className={rowClass}>
                Change PIN
              </button>
              <button type="button" onClick={() => openPin("remove")} className={rowClass}>
                Remove PIN
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => openPin("setup")} className={rowClass}>
              Set up PIN
            </button>
          )}

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent-soft/60 py-1.5 pr-1.5 pl-4">
            <span className="text-sm font-semibold text-ink">Auto-lock</span>
            <div role="radiogroup" aria-label="Auto-lock after" className="flex gap-1">
              {AUTO_LOCK_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={autoLock === m}
                  onClick={() => setAutoLock(m)}
                  className={`h-9 rounded-xl px-3 text-xs font-semibold transition ${
                    autoLock === m ? "bg-white text-accent-ink shadow-sm" : "text-muted active:bg-white/60"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              lock();
            }}
            className={rowClass}
          >
            Lock now
          </button>
        </section>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            // Sign out while still unlocked: the session is sealed, and ending it on the server needs it.
            signOut().finally(() => {
              lock();
              leaveWeb();
            });
          }}
          className="h-12 w-full rounded-2xl bg-rose-50 text-sm font-semibold text-rose-800 transition active:bg-rose-100"
        >
          Sign out
        </button>
        <p className="mt-3 text-center text-xs text-muted">Your expenses stay on this device, encrypted, and sync to your account.</p>
      </Sheet>

      <PinSheet mode={pinSheet} onDone={() => setPinSheet(null)} onCancel={() => setPinSheet(null)} />
    </>
  );
}
