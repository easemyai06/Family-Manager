import { Platform } from "react-native";

const ORIGIN = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_BASE = `${ORIGIN}/api`;
export const BACKEND_ORIGIN = ORIGIN;

let authToken: string | null = null;
export function setAuthToken(t: string | null) {
  authToken = t;
}
export function getAuthToken() {
  return authToken;
}

// Short-lived, read-only, family-scoped token used ONLY in media URLs so the
// long-lived login token never travels in a URL. Refreshed on every /auth/me.
let mediaToken: string | null = null;
export function setMediaToken(t: string | null) {
  mediaToken = t;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Options = {
  method?: string;
  body?: any;
};

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/") && onUnauthorized) {
      onUnauthorized();
    }
    const message = (data && data.detail) || (typeof data === "string" ? data : "Something went wrong");
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// Resolve a media url to a fully-qualified URL authenticated with the
// short-lived media token (used for audio, documents opened externally, and
// web where request headers aren't available). Never carries the login token.
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${BACKEND_ORIGIN}${url}${sep}token=${mediaToken || ""}`;
  }
  return url;
}

// Build an expo-image source for a media url. On native we send the bearer
// token as a request header (never in the URL); on web (<img> can't set
// headers) we fall back to the short-lived media token as a query param.
export function mediaImageSource(
  url: string | null | undefined
): { uri: string; headers?: Record<string, string> } | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/")) {
    const full = `${BACKEND_ORIGIN}${url}`;
    if (Platform.OS === "web") {
      const sep = url.includes("?") ? "&" : "?";
      return { uri: `${full}${sep}token=${mediaToken || ""}` };
    }
    return authToken ? { uri: full, headers: { Authorization: `Bearer ${authToken}` } } : { uri: full };
  }
  return { uri: url };
}

// Upload a local file (image/video/audio) via multipart, returns { url, path, type }.
export async function uploadMedia(uri: string, kind: "image" | "video" | "audio" = "image") {
  const extFallback = kind === "video" ? "mp4" : kind === "audio" ? "m4a" : "jpg";
  const name = uri.split("/").pop() || `upload.${extFallback}`;
  const type = kind === "video" ? "video/mp4" : kind === "audio" ? "audio/m4a" : "image/jpeg";
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  form.append("kind", kind);
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", headers, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Upload failed");
  return data as { url: string; path: string; type: string };
}

// Upload an arbitrary document (PDF/scan/etc). Preserves filename + mime type.
export async function uploadDocument(uri: string, name: string, mimeType: string) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: mimeType } as any);
  }
  form.append("kind", "document");
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", headers, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Upload failed");
  return data as { url: string; path: string; type: string };
}
