"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/repo";

/**
 * In development: removes any worker left from a production visit on this
 * origin (it would serve stale dev files). In production: registers /sw.js
 * and hands it the assets already loaded on this visit.
 */
async function removeLeftoverWorker() {
  const regs = await navigator.serviceWorker.getRegistrations();
  const keys = "caches" in window ? (await caches.keys()).filter((k) => k.startsWith("mithril-") || k.startsWith("spend-")) : [];
  if (!regs.length && !keys.length) return;
  await Promise.all([...regs.map((r) => r.unregister()), ...keys.map((k) => caches.delete(k))]);
  // This page was served through the old worker; reload once without it.
  if (navigator.serviceWorker.controller) location.reload();
}

export default function ServiceWorker() {
  useEffect(() => {
    requestPersistentStorage();

    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      removeLeftoverWorker().catch(() => {});
      return;
    }

    const warmCache = (sw: ServiceWorker | null | undefined) => {
      if (!sw) return;
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin));
      sw.postMessage({ type: "CACHE_URLS", urls: [location.pathname, ...urls] });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        warmCache(reg.active);
      })
      .catch(() => {
        // Offline support is an enhancement; the app still works online.
      });
  }, []);

  return null;
}
