import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";

export type PushStatus = "granted" | "denied" | "blocked" | "unsupported";

async function _registerToken(userId: string): Promise<void> {
  const tokenResp = await Notifications.getDevicePushTokenAsync();
  await api("/register-push", {
    method: "POST",
    body: { user_id: userId, platform: Platform.OS, device_token: String(tokenResp.data) },
  });
}

// Silent: register the device ONLY if permission is already granted (no prompt).
// Safe to call on every app open — it never interrupts the user.
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await _registerToken(userId);
  } catch {
    // Push registration failures must never block the app.
  }
}

// Current permission state, mapped for the settings UI.
export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS === "web") return "unsupported";
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    return canAskAgain ? "denied" : "blocked";
  } catch {
    return "denied";
  }
}

// Contextual: request permission (once) and register. Returns the resulting
// state so the UI can show the right next step (e.g. "Open Settings").
export async function enablePush(userId: string): Promise<PushStatus> {
  if (Platform.OS === "web") return "unsupported";
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") {
      if (!perm.canAskAgain) return "blocked";
      perm = await Notifications.requestPermissionsAsync();
    }
    if (perm.status !== "granted") {
      return perm.canAskAgain ? "denied" : "blocked";
    }
    await _registerToken(userId);
    return "granted";
  } catch {
    return "denied";
  }
}
