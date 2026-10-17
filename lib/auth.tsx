"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabaseAuth } from "./supabase";

/**
 * Who is signed in. `AuthClient` is a structural subset of `supabase.auth`; the
 * client is Supabase Auth through an adapter that keeps offline launches
 * signed in (`lib/supabase.ts`). Accounts are created in Supabase; no sign-up.
 */

export type User = { id: string; email?: string };
export type Session = { user: User };

export interface AuthClient {
  getSession(): Promise<{ data: { session: Session | null } }>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<
    | { data: { user: User; session: Session }; error: null }
    | { data: { user: null; session: null }; error: { message: string } }
  >;
  signOut(): Promise<{ error: { message: string } | null }>;
  onAuthStateChange(callback: (event: string, session: Session | null) => void): {
    data: { subscription: { unsubscribe: () => void } };
  };
}

const auth: AuthClient = supabaseAuth;

export type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

const AuthContext = createContext<AuthState>({ status: "loading" });

/** Mirrors the signed-in user for code outside React (repo mutations). */
let activeUserId: string | null = null;

/** The signed-in user's id. Throws when nobody is signed in. */
export function currentUserId(): string {
  if (!activeUserId) throw new Error("Not signed in");
  return activeUserId;
}

type ProviderProps = {
  children: ReactNode;
  /** Runs after sign-in, before the app sees the user (e.g. adopting local data). */
  onSignIn?: (user: User) => Promise<void>;
};

export function AuthProvider({ children, onSignIn }: ProviderProps) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const onSignInRef = useRef(onSignIn);
  useEffect(() => {
    onSignInRef.current = onSignIn;
  });

  useEffect(() => {
    let alive = true;
    // Only the latest session change wins if several overlap.
    let seq = 0;
    /** Id of the user on screen: `null` once signed out, `undefined` before the first session. */
    let shownId: string | null | undefined;

    async function apply(session: Session | null) {
      const run = ++seq;
      const user = session?.user ?? null;
      if ((user?.id ?? null) === shownId) return;
      if (!user) {
        activeUserId = shownId = null;
        setState({ status: "signedOut" });
        return;
      }
      try {
        await onSignInRef.current?.(user);
      } catch (err) {
        console.error("Post sign-in step failed", err);
      }
      if (!alive || run !== seq) return;
      activeUserId = shownId = user.id;
      setState({ status: "signedIn", user });
    }

    auth.getSession().then(({ data }) => apply(data.session));
    const { data } = auth.onAuthStateChange((_event, session) => apply(session));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The signed-in user. Only use below a signed-in gate. */
export function useUser(): User {
  const state = useAuth();
  if (state.status !== "signedIn") throw new Error("useUser() needs a signed-in user");
  return state.user;
}

export async function signIn(email: string, password: string): Promise<{ user: User } | { error: string }> {
  try {
    const { data, error } = await auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : { user: data.user };
  } catch {
    return { error: "Couldn’t sign in. Check your connection and try again." };
  }
}

export async function signOut(): Promise<void> {
  await auth.signOut();
}
