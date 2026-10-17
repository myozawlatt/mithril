"use client";

import { useSyncExternalStore } from "react";
import AuthGate, { Skeleton } from "@/components/AuthGate";
import { InstallScreen, OpenOnMobileScreen } from "@/components/InstallScreen";
import { useInstallPrompt, useWebVersion } from "@/lib/useInstallPrompt";

const noopSubscribe = () => () => {};

export default function Home() {
  // The shell is prerendered at build time; anything date-based must come from the device.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-safe pb-32">
      {hydrated ? <Platform /> : <Skeleton />}
    </main>
  );
}

/**
 * In production a browser tab gets the install screen on a phone and is sent
 * to the phone on a desktop, unless the user chose the web version there.
 * `next dev` always shows the app so it can be worked on in a browser.
 */
function Platform() {
  const { isStandalone, isMobileDevice } = useInstallPrompt();
  const webChosen = useWebVersion();
  if (process.env.NODE_ENV !== "production" || isStandalone || webChosen) return <AuthGate />;
  return isMobileDevice ? <InstallScreen /> : <OpenOnMobileScreen />;
}
