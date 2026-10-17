/* mithril — offline service worker.
 * Navigations: network-first, falling back to the cached app shell.
 * Hashed build assets (served `immutable`): cache-first. Everything else
 * same-origin: stale-while-revalidate.
 * Bump VERSION to drop old caches on deploy-breaking changes.
 *
 * v2: v1 cache-first stored ANY /_next/static/ file — including `next dev`
 * chunks, whose URLs stay the same while their content changes — so a worker
 * left over from a production visit froze the dev app on old code and styles.
 * v3: new icons (white-rimmed mark) and favicon.ico.
 * v4: 10,000 kyat note scans for the backdrop.
 */
const VERSION = "v4";
const CACHE = `mithril-${VERSION}`;
const SHELL = "/";
const PRECACHE = [
  SHELL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/notes/10000-front.jpg",
  "/notes/10000-back.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page sends the URLs it loaded before this worker was in control.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") return;
  const urls = (event.data.urls || []).filter((u) => {
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map(async (u) => {
          if (await cache.match(u)) return;
          try {
            const res = await fetch(u, { credentials: "same-origin" });
            if (cacheable(new URL(u, self.location.origin), res)) await cache.put(u, res);
          } catch {
            /* ignore */
          }
        }),
      ),
    ),
  );
});

const isBuildAsset = (url) => url.pathname.startsWith("/_next/static/");

/**
 * Build assets are kept only when the server marks them immutable (content-
 * hashed production files). Dev-server files are `no-cache` and never stored.
 */
function cacheable(url, res) {
  if (!res.ok) return false;
  if (!isBuildAsset(url)) return true;
  return /\bimmutable\b/.test(res.headers.get("Cache-Control") || "");
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(SHELL, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(SHELL)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(new URL(request.url), res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  } else if (isBuildAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
