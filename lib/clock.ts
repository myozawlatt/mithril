/**
 * Time for `updatedAt` stamps. Sync keeps the newest stamp, so a device clock
 * that's off decides which edit wins: ahead, and its rows can't be edited
 * anywhere until real time catches up; behind, and its edits lose to the ones
 * they replaced. Sync measures the server's clock (`setServerOffset`) and stamps
 * follow it; offline they fall back to the device clock.
 */

let offset = 0;

/** Epoch ms, corrected to the server's clock once sync has measured it. */
export function now(): number {
  return Date.now() + offset;
}

/** The stamp for a write that replaces a row stamped `prev`: never older, so the edit wins. */
export function stamp(prev = 0): number {
  return Math.max(now(), prev + 1);
}

/** How far the server's clock is ahead of this device's (negative when behind). */
export function setServerOffset(ms: number): void {
  // Whole ms: stamps go to bigint columns, and a half-round-trip estimate can be fractional.
  offset = Math.round(ms);
}
