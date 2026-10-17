import { hostname, networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Hostnames other devices on the local network can use to reach `next dev`:
 * every non-loopback IPv4 address of this machine plus its computer name.
 * Next 16 blocks dev-only resources (JS chunks, HMR) for any origin not listed,
 * which leaves a phone stuck on the loading skeleton. Recomputed on each start,
 * so a new Wi-Fi address just works after restarting the dev server.
 */
function localNetworkHosts(): string[] {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
  const name = hostname().toLowerCase();
  return [...new Set([...ips, name, `${name}.local`])];
}

const isDev = process.env.NODE_ENV === "development";

/** The Supabase project the app syncs with; the only other host it may talk to. */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return ` ${new URL(url).origin}`;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL isn't a URL: ${url}`);
  }
}

/**
 * Same-origin only. Nonces don't fit this app (they need dynamic rendering, and
 * the prerendered shell is cached by the service worker), so inline scripts are
 * allowed. The point is connect-src/img-src: even an injected script can't
 * send data anywhere but this origin and the app's Supabase project.
 * `next dev` needs eval (React debugging) and its HMR websocket.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin()}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: localNetworkHosts(),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Always revalidate the worker so updates roll out on the next visit.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
