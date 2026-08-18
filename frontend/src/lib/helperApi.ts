// Self-contained API client for the Trusted Helper portal.
// Helpers authenticate with their OWN token (separate principal from family
// members), stored under a distinct secure key. Never mixed with family auth.
import { storage } from "@/src/utils/storage";
import { API_BASE } from "@/src/lib/api";

const HELPER_TOKEN_KEY = "helper_token";
let cached: string | null = null;

export async function setHelperToken(t: string | null) {
  cached = t;
  if (t) await storage.secureSet(HELPER_TOKEN_KEY, t);
  else await storage.secureRemove(HELPER_TOKEN_KEY);
}

export async function getHelperToken(): Promise<string | null> {
  if (cached) return cached;
  const raw = await storage.secureGet<string>(HELPER_TOKEN_KEY, "");
  cached = raw || null;
  return cached;
}

type Options = { method?: string; body?: any; auth?: boolean };

export async function helperApi<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = await getHelperToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
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
    const message = (data && data.detail) || (typeof data === "string" ? data : "Something went wrong");
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// Upload a proof photo as the helper (multipart, helper-scoped).
export async function helperUpload(uri: string, kind: "image" | "audio" = "image") {
  const { Platform } = require("react-native");
  const ext = kind === "audio" ? "m4a" : "jpg";
  const type = kind === "audio" ? "audio/m4a" : "image/jpeg";
  const name = uri.split("/").pop() || `upload.${ext}`;
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  form.append("kind", kind);
  const token = await getHelperToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/helper/upload`, { method: "POST", headers, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Upload failed");
  return data as { url: string; path: string; type: string };
}
