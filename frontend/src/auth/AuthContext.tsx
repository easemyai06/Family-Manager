import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { storage } from "@/src/utils/storage";
import { api, setAuthToken, setMediaToken, setUnauthorizedHandler } from "@/src/lib/api";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "fh_auth_token";
export const REMEMBER_KEY = "fh_remembered";
export const ROSTER_KEY = "fh_family_roster";

export type User = {
  user_id: string;
  name: string;
  email: string;
  username?: string | null;
  picture?: string | null;
  family_id?: string | null;
  apple_linked?: boolean;
};

export type Member = {
  member_id: string;
  name: string;
  relationship: string;
  role: string;
  color: string;
  photo_url?: string | null;
  birthday?: string | null;
  is_child?: boolean;
} | null;

type AuthContextValue = {
  user: User | null;
  member: Member;
  initializing: boolean;
  pinSet: boolean;
  familyChatId: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  loginWithPin: (userId: string, pin: string) => Promise<void>;
  loginWithMemberPin: (memberId: string, pin: string) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  clearPin: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  linkWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const processedSessions = new Set<string>();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member>(null);
  const [initializing, setInitializing] = useState(true);
  const [pinSet, setPinSet] = useState(false);
  const [familyChatId, setFamilyChatId] = useState<string | null>(null);

  const applyMe = useCallback(async () => {
    const data = await api<{ user: User; member: Member; media_token?: string; pin_set?: boolean; family_chat_id?: string | null }>("/auth/me");
    setUser(data.user);
    setMember(data.member);
    setMediaToken(data.media_token || null);
    setPinSet(!!data.pin_set);
    setFamilyChatId(data.family_chat_id || null);
    // Remember this account on the device so it can be unlocked with a PIN later.
    try {
      await storage.setItem(REMEMBER_KEY, JSON.stringify({
        user_id: data.user.user_id, name: data.user.name,
        picture: data.user.picture || null, pin_set: !!data.pin_set,
      }));
    } catch {}
    // Cache the family roster (members with a PIN) for kids' pick-a-name sign-in.
    if (data.user.family_id) {
      try {
        const fam = await api<any>("/families/me");
        const members = (fam.members || [])
          .filter((m: any) => m.has_pin)
          .map((m: any) => ({ member_id: m.member_id, name: m.name, photo_url: m.photo_url, color: m.color }));
        await storage.setItem(ROSTER_KEY, JSON.stringify({ family_id: data.user.family_id, members }));
      } catch {}
    }
  }, []);

  const bootstrap = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (token) {
      setAuthToken(token);
      try {
        await applyMe();
      } catch {
        setAuthToken(null);
        await storage.secureRemove(TOKEN_KEY);
      }
    }
    setInitializing(false);
  }, [applyMe]);

  const persistToken = useCallback(async (token: string) => {
    setAuthToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    await applyMe();
  }, [applyMe]);

  const exchangeSessionId = useCallback(async (sessionId: string) => {
    if (processedSessions.has(sessionId)) return;
    processedSessions.add(sessionId);
    const data = await api<{ token: string }>("/auth/session", {
      method: "POST",
      body: { session_id: sessionId },
    });
    await persistToken(data.token);
  }, [persistToken]);

  useEffect(() => {
    bootstrap();
    // Deep link / cold start handling for Google auth on native.
    const extract = (url?: string | null) => {
      if (!url) return null;
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      return m ? m[1] : null;
    };
    // Capture an invite code carried on a deep link (frontend://join?invite=CODE)
    // so the onboarding Join screen can auto-fill it after sign-in.
    const captureInvite = (url?: string | null) => {
      if (!url) return;
      const m = url.match(/[?#&]invite=([^&#]+)/);
      if (m) storage.setItem("pendingInviteCode", decodeURIComponent(m[1]).trim().toUpperCase());
    };
    if (Platform.OS === "web") {
      captureInvite(window.location.search);
      const sid = extract(window.location.hash) || extract(window.location.search);
      if (sid) {
        exchangeSessionId(sid).finally(() => {
          try {
            window.history.replaceState(window.history.state, "", window.location.pathname);
          } catch {}
        });
      }
    } else {
      Linking.getInitialURL().then((url) => {
        captureInvite(url);
        const sid = extract(url);
        if (sid) exchangeSessionId(sid);
      });
      const sub = Linking.addEventListener("url", ({ url }) => {
        captureInvite(url);
        const sid = extract(url);
        if (sid) exchangeSessionId(sid);
      });
      return () => sub.remove();
    }
  }, [bootstrap, exchangeSessionId]);

  const login = useCallback(async (identifier: string, password: string) => {
    const id = identifier.trim();
    const body = id.includes("@") ? { email: id, password } : { username: id.toLowerCase(), password };
    const data = await api<{ token: string }>("/auth/login", { method: "POST", body });
    await persistToken(data.token);
  }, [persistToken]);

  const loginWithPin = useCallback(async (userId: string, pin: string) => {
    const data = await api<{ token: string }>("/auth/pin-login", { method: "POST", body: { user_id: userId, pin } });
    await persistToken(data.token);
  }, [persistToken]);

  const loginWithMemberPin = useCallback(async (memberId: string, pin: string) => {
    const data = await api<{ token: string }>("/auth/pin-login", { method: "POST", body: { member_id: memberId, pin } });
    await persistToken(data.token);
  }, [persistToken]);

  const setPin = useCallback(async (pin: string) => {
    await api("/auth/pin", { method: "POST", body: { pin } });
    setPinSet(true);
    try {
      const raw = await storage.getItem<string>(REMEMBER_KEY, "");
      const rem = raw ? JSON.parse(raw as string) : {};
      await storage.setItem(REMEMBER_KEY, JSON.stringify({ ...rem, pin_set: true }));
    } catch {}
  }, []);

  const clearPin = useCallback(async () => {
    await api("/auth/pin", { method: "DELETE" });
    setPinSet(false);
    try {
      const raw = await storage.getItem<string>(REMEMBER_KEY, "");
      const rem = raw ? JSON.parse(raw as string) : {};
      await storage.setItem(REMEMBER_KEY, JSON.stringify({ ...rem, pin_set: false }));
    } catch {}
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    const data = await api<{ token: string }>("/auth/reset-password", {
      method: "POST", body: { email: email.trim(), code: code.trim(), new_password: newPassword },
    });
    await persistToken(data.token);
  }, [persistToken]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api<{ token: string }>("/auth/register", { method: "POST", body: { name, email, password } });
    await persistToken(data.token);
  }, [persistToken]);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const m = result.url.match(/[?#&]session_id=([^&#]+)/);
      if (m) await exchangeSessionId(m[1]);
    }
  }, [exchangeSessionId]);

  const loginWithApple = useCallback(async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // Apple returns the name/email only on the FIRST sign-in — send them through.
      const fullName = cred.fullName
        ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ")
        : null;
      const data = await api<{ token: string }>("/auth/apple", {
        method: "POST",
        body: {
          identity_token: cred.identityToken,
          authorization_code: cred.authorizationCode,
          name: fullName || null,
          email: cred.email || null,
        },
      });
      await persistToken(data.token);
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return; // user cancelled — not an error
      throw e;
    }
  }, [persistToken]);

  const linkWithApple = useCallback(async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      await api("/auth/apple/link", {
        method: "POST",
        body: {
          identity_token: cred.identityToken,
          authorization_code: cred.authorizationCode,
        },
      });
      await applyMe(); // refresh so `user.apple_linked` flips to true
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      throw e;
    }
  }, [applyMe]);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setMediaToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
    setMember(null);
  }, []);

  // Global 401 handler: a stale/invalid token logs the user out and the
  // navigation gate routes them back to the welcome screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{ user, member, initializing, pinSet, familyChatId, login, register, loginWithGoogle, loginWithApple, loginWithPin, loginWithMemberPin, setPin, clearPin, forgotPassword, resetPassword, linkWithApple, logout, refresh: applyMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
