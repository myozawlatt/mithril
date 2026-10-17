"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

/** Mobile-only install pill. Native prompt on Chromium; share-sheet steps on iOS. */
export default function InstallButton() {
  const { showInstall, isIos, canPrompt, promptInstall } = useInstallPrompt();
  const [hintOpen, setHintOpen] = useState(false);

  if (!showInstall) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canPrompt ? promptInstall() : setHintOpen(true))}
        aria-label="Install app"
        className="glass flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-accent-ink active:scale-95 min-[360px]:px-3.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 21h14" />
        </svg>
        {/* Icon-only on the narrowest phones so the header never overflows. */}
        <span className="max-[359px]:hidden">Install</span>
      </button>

      {isIos && (
        <Sheet open={hintOpen} onClose={() => setHintOpen(false)} title="Install mithril">
          <IosInstallSteps />
          <button
            type="button"
            onClick={() => setHintOpen(false)}
            className="h-12 w-full rounded-2xl bg-accent-soft text-sm font-semibold text-accent-ink"
          >
            Got it
          </button>
        </Sheet>
      )}
    </>
  );
}

/** Safari's Add to Home Screen steps; iOS has no install prompt. */
export function IosInstallSteps() {
  return (
    <ol className="mb-5 flex flex-col gap-3 text-sm text-ink">
      <Step n={1}>
        Tap the <strong>Share</strong> button{" "}
        <svg className="inline -mt-1 text-accent-ink" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="share icon">
          <path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </svg>{" "}
        in the browser bar.
      </Step>
      <Step n={2}>
        Choose <strong>Add to Home Screen</strong>.
      </Step>
      <Step n={3}>
        Tap <strong>Add</strong>. mithril opens full-screen and works offline.
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-accent-soft/60 p-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}
