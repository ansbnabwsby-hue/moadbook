import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AuthSession, dbGet, dbPut, normalizeUsername, restoreSession, saveSession, signInWithPassword, signUpWithPassword, validUsername } from "@/lib/firebase/client";
import type { UserProfile } from "@/lib/moadbook-types";

const AuthContext = createContext<AuthValue | null>(null);

type AuthValue = {
  session: AuthSession | null;
  profile: UserProfile | null;
  loading: boolean;
  busy: boolean;
  error: string;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  updateProfile: (values: Pick<UserProfile, "displayName" | "bio">) => Promise<void>;
  clearError: () => void;
};

function profileDefaults(session: AuthSession): UserProfile {
  return { id: session.user.id, username: session.user.username, displayName: session.user.displayName || session.user.username, bio: "" };
}

async function ensureProfile(session: AuthSession): Promise<UserProfile> {
  const existing = await dbGet<Record<string, unknown> | null>(`/profiles/${session.user.id}`);
  if (existing) return { ...existing, id: session.user.id } as UserProfile;
  const fresh: UserProfile = {
    ...profileDefaults(session),
    avatarUrl: "",
    createdAt: Date.now(),
  };
  await dbPut(`/profiles/${session.user.id}`, {
    username: fresh.username,
    displayName: fresh.displayName,
    bio: fresh.bio,
    avatarUrl: fresh.avatarUrl,
    createdAt: fresh.createdAt,
  });
  return fresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshProfile = useCallback(async () => {
    if (!session) return null;
    const row = await dbGet<Record<string, unknown> | null>(`/profiles/${session.user.id}`);
    if (!row) return null;
    const next = { ...row, id: session.user.id } as UserProfile;
    setProfile(next);
    return next;
  }, [session]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const restored = await restoreSession();
        if (!active || !restored) return;
        setSession(restored);
        try {
          const row = await ensureProfile(restored);
          if (active) setProfile(row);
        } catch {
          if (active) setProfile(profileDefaults(restored));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const finishAuth = useCallback(async (next: AuthSession) => {
    setSession(next);
    setError("");
    try {
      const row = await ensureProfile(next);
      setProfile(row);
    } catch {
      setProfile(profileDefaults(next));
    }
  }, []);

  const signIn = useCallback(async (usernameValue: string, password: string) => {
    const username = normalizeUsername(usernameValue);
    if (!validUsername(username)) throw new Error("USERNAME_INVALID");
    setBusy(true);
    setError("");
    try {
      await finishAuth(await signInWithPassword(username, password));
    } catch (e) {
      setError(String((e as Error)?.message || "AUTH_FAILED"));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [finishAuth]);

  const signUp = useCallback(async (usernameValue: string, password: string) => {
    const username = normalizeUsername(usernameValue);
    if (!validUsername(username)) throw new Error("USERNAME_INVALID");
    if (password.length < 8 || password.length > 72) throw new Error("WEAK_PASSWORD");
    setBusy(true);
    setError("");
    try {
      await finishAuth(await signUpWithPassword(username, password));
    } catch (e) {
      setError(String((e as Error)?.message || "AUTH_FAILED"));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [finishAuth]);

  const signOut = useCallback(async () => {
    await saveSession(null);
    setSession(null);
    setProfile(null);
    setError("");
  }, []);

  const updateProfile = useCallback(async (values: Pick<UserProfile, "displayName" | "bio">) => {
    if (!session) throw new Error("AUTH_REQUIRED");
    const displayName = values.displayName.trim();
    const bio = values.bio.trim();
    if (displayName.length < 2 || displayName.length > 60) throw new Error("DISPLAY_NAME_INVALID");
    if (bio.length > 240) throw new Error("BIO_TOO_LONG");
    await dbPut(`/profiles/${session.user.id}/displayName`, displayName);
    await dbPut(`/profiles/${session.user.id}/bio`, bio);
    const next = { ...(profile ?? profileDefaults(session)), displayName, bio };
    setProfile(next);
  }, [session, profile]);

  const value = useMemo<AuthValue>(() => ({
    session, profile, loading, busy, error, signIn, signUp, signOut, refreshProfile, updateProfile, clearError: () => setError(""),
  }), [session, profile, loading, busy, error, signIn, signUp, signOut, refreshProfile, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
