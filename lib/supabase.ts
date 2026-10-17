"use client";

import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthClient, Session, User } from "./auth";
import { authStorage, dropRevoke, forgetSession, hasSession, isSessionLive, keepForRevoke, pendingRevokes } from "./authSession";

/**
 * The Supabase client (tables in the `mithril` schema, see supabase/schema.sql)
 * and the auth adapter `lib/auth.tsx` uses. Created on first use, so the
 * prerendered shell and a build without env vars never touch it.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = !!(url && key);

let client: SupabaseClient<any, "mithril"> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

export function supabase() {
  if (!url || !key) {
    throw new Error("Supabase isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  client ??= createClient(url, key, {
    db: { schema: "mithril" },
    // The session is stored sealed with the user's data key (lib/authSession.ts), never in plain.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "mithril-auth", storage: authStorage },
  });
  return client;
}

/**
 * Who was last signed in on this device. supabase-js sees no session while the
 * app is locked (it's sealed until the unlock), and drops to "no session" when it
 * can't refresh an expired token offline; this keeps both launches on the local
 * unlock screen instead of the login screen.
 */
const LAST_USER_KEY = "mithril-user";

function rememberUser(user: User | null) {
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email }));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Blocked storage: offline launches fall back to the login screen.
  }
}

function lastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    const user = raw ? (JSON.parse(raw) as User) : null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

const toSession = (user: User): Session => ({ user: { id: user.id, email: user.email } });

const NOT_CONFIGURED = "Sign-in isn’t set up yet (Supabase env vars are missing).";
const OFFLINE = "Couldn’t sign in. Check your connection and try again.";

/** `supabase.auth`, narrowed to `AuthClient`, and made to work offline. */
export const supabaseAuth: AuthClient = {
  async getSession() {
    if (!isSupabaseConfigured) return { data: { session: null } };
    const { data, error } = await supabase().auth.getSession();
    if (data.session) {
      rememberUser(data.session.user);
      return { data: { session: toSession(data.session.user) } };
    }
    const user = lastUser();
    if (user && (hasSession(user.id) || (error && isAuthRetryableFetchError(error)))) {
      return { data: { session: toSession(user) } };
    }
    rememberUser(null);
    return { data: { session: null } };
  },

  async signInWithPassword(credentials) {
    if (!isSupabaseConfigured) return { data: { user: null, session: null }, error: { message: NOT_CONFIGURED } };
    const { data, error } = await supabase().auth.signInWithPassword(credentials);
    if (error || !data.session) {
      const message = error && isAuthRetryableFetchError(error) ? OFFLINE : (error?.message ?? "Couldn’t sign in.");
      return { data: { user: null, session: null }, error: { message } };
    }
    rememberUser(data.user);
    const session = toSession(data.user);
    return { data: { user: session.user, session }, error: null };
  },

  async signOut() {
    const userId = lastUser()?.id;
    rememberUser(null);
    if (!isSupabaseConfigured) return { error: null };
    // A sealed copy stays until the server has ended the session; offline or
    // locked it can't be told now, so `revokeLeftoverSessions` does it later.
    const kept = userId ? keepForRevoke(userId) : null;
    const ended = !!userId && isSessionLive(userId) && (await endSessionOnServer());
    if (ended && kept) dropRevoke(userId!, kept);
    if (userId) forgetSession(userId);
    // With nothing left in storage this only clears supabase-js and emits SIGNED_OUT.
    await supabase()
      .auth.signOut({ scope: "local" })
      .catch(() => {});
    return { error: null };
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured) return { data: { subscription: { unsubscribe: () => {} } } };
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      // AuthProvider reads the first session itself via getSession(), which
      // also covers offline; supabase-js would report null for it offline.
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") rememberUser(null);
      else if (session) rememberUser(session.user);
      callback(event, session && toSession(session.user));
    });
    return { data: { subscription: data.subscription } };
  },
};

/** Ends this device's session on the server. False when that didn't happen (offline, slow, failed). */
async function endSessionOnServer(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8_000));
  const call = supabase()
    .auth.signOut({ scope: "local" })
    .then(
      ({ error }) => !error,
      () => false,
    );
  return Promise.race([call, timeout]);
}

/**
 * End sessions the user signed out of on this device while the server couldn't
 * be told (offline, or from the unlock screen). Runs from sync, unlocked and online.
 */
export async function revokeLeftoverSessions(userId: string): Promise<void> {
  if (!url || !key) return;
  for (const { text, refreshToken } of await pendingRevokes(userId)) {
    const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (refreshed.ok) {
      const { access_token } = (await refreshed.json()) as { access_token: string };
      const out = await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${access_token}` },
      });
      if (!out.ok && out.status !== 401 && out.status !== 404) continue;
    } else if (refreshed.status >= 500 || refreshed.status === 429) {
      continue; // try again on the next sync
    }
    // Ended now, or already over on the server (expired, revoked, password changed).
    dropRevoke(userId, text);
  }
}
