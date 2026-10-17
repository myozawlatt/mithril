"use client";

import { useEffect } from "react";
import AppIcon from "./AppIcon";
import LoginScreen from "./LoginScreen";
import Tracker from "./Tracker";
import UnlockScreen from "./UnlockScreen";
import { AuthProvider, useAuth } from "@/lib/auth";
import { hasWebCrypto } from "@/lib/crypto";
import { prepareUserData } from "@/lib/repo";
import { lock, useVault, VaultProvider } from "@/lib/vault";

/** Login until someone is signed in, unlock until their data keys are loaded, then their own tracker. */
export default function AuthGate() {
  return (
    <AuthProvider>
      <VaultProvider onUnlock={prepareUserData}>
        <Gate />
      </VaultProvider>
    </AuthProvider>
  );
}

function Gate() {
  const auth = useAuth();
  const vault = useVault();
  const userId = auth.status === "signedIn" ? auth.user.id : null;
  const unlockedFor = vault.status === "unlocked" ? vault.userId : null;

  // Drop the keys on sign-out (also from another tab) or when the account changes.
  useEffect(() => {
    if (auth.status === "signedOut" || (unlockedFor && unlockedFor !== userId)) lock();
  }, [auth.status, userId, unlockedFor]);

  // Without WebCrypto the data can't be unlocked; say so before anyone signs in.
  if (!hasWebCrypto()) return <NeedsHttpsScreen />;
  if (auth.status === "loading") return <Skeleton />;
  if (auth.status === "signedOut") return <LoginScreen />;
  if (unlockedFor === auth.user.id) return <Tracker key={auth.user.id} />;
  if (vault.status === "unlocking") return <Skeleton />;
  return <UnlockScreen user={auth.user} />;
}

export function Skeleton() {
  return (
    <>
      <div className="h-11" />
      <div className="glass h-33 animate-pulse rounded-[28px]" />
    </>
  );
}

/** Plain http:// on another device (e.g. a phone on the LAN): the browser hides WebCrypto. */
function NeedsHttpsScreen() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 py-8 text-center">
      <div>
        <AppIcon />
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink">Open mithril over HTTPS</h1>
        <p className="mt-2 text-sm text-balance text-muted">
          Your data is encrypted on this device, and the browser only allows that on a secure (https://) address.
        </p>
      </div>
      <p className="glass rounded-[28px] p-5 text-sm break-all text-ink">{location.origin}</p>
    </div>
  );
}
