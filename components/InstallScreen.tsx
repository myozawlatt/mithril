"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import AppIcon from "./AppIcon";
import { chooseWeb, useInstallPrompt } from "@/lib/useInstallPrompt";

const noopSubscribe = () => () => {};

/** Shown in a phone's browser in production: the app itself only runs installed. */
export function InstallScreen() {
  const { isIos, canPrompt, installed, promptInstall } = useInstallPrompt();

  if (installed) {
    return (
      <Frame title="mithril is installed" subtitle="Open it from your home screen to start tracking.">
        <span />
      </Frame>
    );
  }

  return (
    <Frame title="Install mithril" subtitle="Add the app to your home screen. It opens full-screen and works offline.">
      {isIos ? (
        <div className="glass rounded-[28px] p-4 pb-0">
          <IosInstallSteps />
        </div>
      ) : canPrompt ? (
        <button
          type="button"
          onClick={promptInstall}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 21h14" />
          </svg>
          Install app
        </button>
      ) : (
        // No prompt: Firefox, Samsung Internet, in-app browsers, or already installed.
        <p className="glass rounded-[28px] p-5 text-center text-sm leading-relaxed text-ink">
          Open your browser menu <strong>⋮</strong> and tap <strong>Install app</strong> or{" "}
          <strong>Add to Home screen</strong>.
        </p>
      )}
    </Frame>
  );
}

/** Safari's Add to Home Screen steps; iOS has no install prompt. */
function IosInstallSteps() {
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

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-accent-soft/60 p-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}

/** Shown on a desktop browser in production: mithril is a phone app. */
export function OpenOnMobileScreen() {
  const url = useSyncExternalStore(noopSubscribe, () => location.origin, () => "");
  const [copied, setCopied] = useState(false);

  return (
    <Frame title="Open this in your mobile browser" subtitle="mithril is made for your phone. Open this address there and install the app.">
      <div className="glass flex items-center gap-2 rounded-2xl p-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink select-all">{url.replace(/^https?:\/\//, "")}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              // Clipboard blocked: the address is still selectable.
            }
          }}
          className="h-10 shrink-0 rounded-xl bg-accent-soft px-4 text-sm font-semibold text-accent-ink transition active:scale-95"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </Frame>
  );
}

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <AppIcon />
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink">{title}</h1>
        <p className="mt-2 text-sm text-balance text-muted">{subtitle}</p>
      </div>
      {children}
      <WebVersionLink />
    </div>
  );
}

/** Lets a browser tab skip installing and use the app right here. */
function WebVersionLink() {
  return (
    <button
      type="button"
      onClick={chooseWeb}
      className="mx-auto text-sm font-semibold text-accent-ink underline underline-offset-4 transition active:scale-95"
    >
      Use the web version
    </button>
  );
}
