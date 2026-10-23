import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type FirebaseConfig = {
  apiKey: string;
  authDomain?: string;
  databaseURL: string;
  projectId?: string;
  storageBucket?: string;
  appId?: string;
  messagingSenderId?: string;
};

const config = (Constants.expoConfig?.extra?.moadbookFirebase ?? {}) as FirebaseConfig;
const sessionKey = "moadbook-ios-session-v1";
const authBase = "https://identitytoolkit.googleapis.com/v1";
const tokenBase = "https://securetoken.googleapis.com/v1/token";

export type AuthSession = {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; username: string; email: string; displayName: string };
};

export class FirebaseClientError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "FirebaseClientError";
    this.code = code;
  }
}

let activeSession: AuthSession | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;

function ensureConfig() {
  if (!config.apiKey || !config.databaseURL) throw new FirebaseClientError("FIREBASE_CONFIG_MISSING");
}

async function readStore(): Promise<string | null> {
  try {
    return Platform.OS === "web"
      ? await AsyncStorage.getItem(sessionKey)
      : await SecureStore.getItemAsync(sessionKey);
  } catch {
    return null;
  }
}

async function writeStore(value: string | null) {
  if (Platform.OS === "web") {
    if (value === null) await AsyncStorage.removeItem(sessionKey);
    else await AsyncStorage.setItem(sessionKey, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(sessionKey);
  else await SecureStore.setItemAsync(sessionKey, value);
}

export async function saveSession(session: AuthSession | null) {
  activeSession = session;
  await writeStore(session ? JSON.stringify(session) : null);
}

async function refreshSession(session: AuthSession): Promise<AuthSession | null> {
  if (!session.refreshToken) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken });
      const response = await fetch(`${tokenBase}?key=${encodeURIComponent(config.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data = (await response.json()) as Record<string, string>;
      if (!response.ok || !data.id_token) return null;
      const updated: AuthSession = {
        idToken: data.id_token,
        refreshToken: data.refresh_token || session.refreshToken,
        expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
        user: { ...session.user, id: data.user_id || session.user.id },
      };
      await saveSession(updated);
      return updated;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function restoreSession(): Promise<AuthSession | null> {
  const raw = await readStore();
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as AuthSession;
    if (!stored.idToken || !stored.refreshToken || !stored.user?.id) return null;
    activeSession = stored;
    if (stored.expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshSession(stored);
      if (!refreshed) {
        await saveSession(null);
        return null;
      }
      return refreshed;
    }
    return stored;
  } catch {
    await saveSession(null);
    return null;
  }
}

export async function signInWithPassword(username: string, password: string): Promise<AuthSession> {
  return authenticate("signInWithPassword", username, password);
}

export async function signUpWithPassword(username: string, password: string): Promise<AuthSession> {
  return authenticate("signUp", username, password);
}

async function authenticate(action: "signInWithPassword" | "signUp", username: string, password: string) {
  ensureConfig();
  const response = await fetch(`${authBase}/accounts:${action}?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${username}@accounts.example.com`, password, returnSecureToken: true }),
  });
  const data = (await response.json()) as { idToken?: string; refreshToken?: string; expiresIn?: string; localId?: string; user_id?: string; email?: string; error?: string | { message?: string } };
  const detail = typeof data.error === "string" ? data.error : data.error?.message;
  if (!response.ok || !data.idToken) throw new FirebaseClientError(detail || `HTTP_${response.status}`);
  const session: AuthSession = {
    idToken: data.idToken,
    refreshToken: data.refreshToken || "",
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
    user: {
      id: data.localId || data.user_id || "",
      username,
      email: data.email || `${username}@accounts.example.com`,
      displayName: username,
    },
  };
  await saveSession(session);
  return session;
}

async function getToken() {
  if (!activeSession) throw new FirebaseClientError("AUTH_REQUIRED");
  if (activeSession.expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshSession(activeSession);
    if (!refreshed) throw new FirebaseClientError("TOKEN_EXPIRED");
  }
  return activeSession.idToken;
}

function pathUrl(path: string, query?: Record<string, string | number | boolean>) {
  const cleanPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) params.set(key, String(value));
  return `${config.databaseURL.replace(/\/$/, "")}${cleanPath ? `/${cleanPath}` : ""}.json${params.size ? `?${params}` : ""}`;
}

export async function dbRequest<T = unknown>(
  path: string,
  options: { method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Record<string, string | number | boolean> } = {},
  requiresAuth = true,
): Promise<T> {
  ensureConfig();
  let attempt = 0;
  while (attempt < 2) {
    const token = requiresAuth ? await getToken() : null;
    const url = pathUrl(path, { ...(options.query ?? {}), ...(token ? { auth: token } : {}) });
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (response.status === 401 && requiresAuth && attempt === 0 && activeSession) {
      const updated = await refreshSession(activeSession);
      if (updated) {
        attempt += 1;
        continue;
      }
    }
    if (!response.ok) {
      const row = data as { error?: string | { message?: string } } | null;
      const code = typeof row?.error === "string" ? row.error : row?.error?.message || `HTTP_${response.status}`;
      throw new FirebaseClientError(code);
    }
    return data as T;
  }
  throw new FirebaseClientError("NETWORK_ERROR");
}

export const dbGet = <T = unknown>(path: string, query?: Record<string, string | number | boolean>) =>
  dbRequest<T>(path, { query });
export const dbPut = <T = unknown>(path: string, body: unknown) => dbRequest<T>(path, { method: "PUT", body });
export const dbPost = <T = { name: string }>(path: string, body: unknown) => dbRequest<T>(path, { method: "POST", body });
export const dbPatch = <T = unknown>(path: string, body: unknown) => dbRequest<T>(path, { method: "PATCH", body });
export const dbDelete = (path: string) => dbRequest(path, { method: "DELETE" });

export function normalizeUsername(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}

export function userFacingError(error: unknown) {
  const code = error instanceof FirebaseClientError ? error.code.toUpperCase() : String(error ?? "").toUpperCase();
  if (code.includes("EMAIL_EXISTS")) return "اسم المستخدم مستخدم بالفعل. جرّب اسمًا آخر.";
  if (code.includes("INVALID_LOGIN_CREDENTIALS") || code.includes("EMAIL_NOT_FOUND") || code.includes("INVALID_PASSWORD")) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  if (code.includes("WEAK_PASSWORD")) return "اجعل كلمة المرور 8 أحرف على الأقل.";
  if (code.includes("OPERATION_NOT_ALLOWED")) return "تسجيل كلمة المرور غير مفعّل في إعدادات Firebase.";
  if (code.includes("PERMISSION_DENIED")) return "رفضت قواعد Firebase العملية. لم نغيّر القواعد أو بياناتك.";
  if (code.includes("FIREBASE_CONFIG_MISSING")) return "إعداد Firebase غير موجود في نسخة التطبيق.";
  if (code.includes("NETWORK") || code.includes("FETCH") || code.includes("TIMEOUT")) return "تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.";
  if (code.includes("TOO_MANY_ATTEMPTS") || code.includes("QUOTA_EXCEEDED")) return "محاولات كثيرة؛ انتظر قليلًا ثم حاول مجددًا.";
  if (code.includes("TOKEN_EXPIRED") || code.includes("AUTH_REQUIRED")) return "انتهت الجلسة. سجّل الدخول من جديد.";
  return "تعذر إكمال العملية. حاول مرة أخرى.";
}
