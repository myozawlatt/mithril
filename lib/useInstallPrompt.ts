"use client";

import { useCallback, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const MOBILE_QUERY = "(max-width: 768px), (pointer: coarse)";
const STANDALONE_QUERY = "(display-mode: standalone)";

function mediaStore(query: string) {
  return {
    subscribe(cb: () => void) {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    get: () => window.matchMedia(query).matches,
  };
}

const mobile = mediaStore(MOBILE_QUERY);
const standalone = mediaStore(STANDALONE_QUERY);
const noopSubscribe = () => () => {};

function detectIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports as Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** A phone or tablet, whatever the window size (DevTools device mode counts). */
function detectMobileDevice(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return uaData?.mobile === true || detectIos() || /Android|Mobi/i.test(navigator.userAgent);
}

function detectStandalone(): boolean {
  return standalone.get() || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * `beforeinstallprompt` can fire before React mounts, so it's captured as soon
 * as this module loads and kept until used.
 */
const prompt = {
  event: null as BeforeInstallPromptEvent | null,
  installed: false,
  listeners: new Set<() => void>(),
  set(patch: Partial<{ event: BeforeInstallPromptEvent | null; installed: boolean }>) {
    Object.assign(prompt, patch);
    snapshot = { event: prompt.event, installed: prompt.installed };
    prompt.listeners.forEach((cb) => cb());
  },
};
let snapshot = { event: prompt.event, installed: prompt.installed };
const SERVER_SNAPSHOT = snapshot;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt.set({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => prompt.set({ event: null, installed: true }));
}

function subscribePrompt(cb: () => void) {
  prompt.listeners.add(cb);
  return () => prompt.listeners.delete(cb);
}

/**
 * In production a browser tab shows the install screen, unless the user chose
 * the web version there. The choice is kept in memory only, so a reload or a
 * sign-out brings the install screen back.
 */
const web = {
  chosen: false,
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    web.listeners.add(cb);
    return () => web.listeners.delete(cb);
  },
  set(chosen: boolean) {
    web.chosen = chosen;
    web.listeners.forEach((cb) => cb());
  },
};

export function chooseWeb() {
  web.set(true);
}

/** Back to the install screen, e.g. after signing out of the web version. */
export function leaveWeb() {
  web.set(false);
}

export function useWebVersion() {
  return useSyncExternalStore(web.subscribe, () => web.chosen, () => false);
}

export function useInstallPrompt() {
  const { event: deferred, installed } = useSyncExternalStore(subscribePrompt, () => snapshot, () => SERVER_SNAPSHOT);

  const isMobile = useSyncExternalStore(mobile.subscribe, mobile.get, () => false);
  const isMobileDevice = useSyncExternalStore(noopSubscribe, detectMobileDevice, () => false);
  // Server snapshot says "installed" so nothing flashes before we know.
  const isStandalone = useSyncExternalStore(standalone.subscribe, detectStandalone, () => true);
  const isIos = useSyncExternalStore(noopSubscribe, detectIos, () => false);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    prompt.set({ event: null, ...(outcome === "accepted" ? { installed: true } : {}) });
  }, [deferred]);

  const showInstall = isMobile && !isStandalone && !installed && (deferred !== null || isIos);

  return { showInstall, isIos, isMobileDevice, isStandalone, installed, canPrompt: deferred !== null, promptInstall };
}
