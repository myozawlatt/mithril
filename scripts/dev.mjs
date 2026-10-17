// `npm run dev`: starts `next dev` (which listens on all network interfaces by
// default) and prints the URLs to open on a phone or tablet on the same Wi-Fi.
// Extra args pass through (e.g. `npm run dev -- -p 3001`). The origins those
// devices use are allowed in next.config.ts (allowedDevOrigins).
//
// Port clash guard: on Windows another server can hold IPv4 port 3000 while
// `next dev` still binds IPv6 port 3000 without complaint. `localhost` then
// reaches this app but phones (IPv4) silently reach the OTHER app. So the port
// is checked on IPv4 first, and the next free one is used if it's taken.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";

const args = process.argv.slice(2);
const portFlag = args.findIndex((a) => a === "-p" || a === "--port");
const requested = Number(portFlag >= 0 ? args[portFlag + 1] : (process.env.PORT ?? 3000));

/** Free on IPv4 (what phones use) AND IPv6 (what `localhost` often resolves to)? */
const isFree = (port) =>
  Promise.all(
    ["0.0.0.0", "::"].map(
      (host) =>
        new Promise((resolve) => {
          const srv = createServer()
            .once("error", (e) => resolve(e.code === "EAFNOSUPPORT")) // no IPv6 on this machine is fine
            .once("listening", () => srv.close(() => resolve(true)))
            .listen({ port, host, ipv6Only: host === "::" });
        }),
    ),
  ).then((r) => r.every(Boolean));

let port = requested;
while (!(await isFree(port))) port++;
if (port !== requested) {
  console.log(`\n  ⚠ Port ${requested} is already used by another program on this PC — a phone`);
  console.log(`    opening :${requested} would reach THAT app. Using port ${port} instead.`);
}
const nextArgs = portFlag >= 0 ? args.toSpliced(portFlag, 2) : args;

// Physical adapters first: Next's own "Network:" line may pick a VPN/tunnel address.
const physical = /wi-?fi|wlan|ethernet|^en|^eth/i;
const lan = Object.entries(networkInterfaces())
  .flatMap(([name, addrs]) => (addrs ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, ip: a.address })))
  .sort((a, b) => Number(physical.test(b.name)) - Number(physical.test(a.name)));

if (lan.length) {
  console.log("\n  Open on your phone (same Wi-Fi):");
  for (const { name, ip } of lan) console.log(`    http://${ip}:${port}`.padEnd(32) + `(${name})`);
  console.log("    Plain http:// has no WebCrypto, so the app asks for HTTPS there. See README");
  console.log("    \"On your phone\" (USB port forwarding, a Chrome flag, or a tunnel).\n");
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "-p", String(port), ...nextArgs], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
