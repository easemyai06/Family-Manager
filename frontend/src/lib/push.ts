import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "./api";

// Registers the device's native push token with the backend so the family can
// receive "On This Day" morning reminders and new-message alerts.
// No-op on web and safe to call on every app open (tokens rotate; backend upserts).
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", {
      method: "POST",
      body: { user_id: userId, platform: Platform.OS, device_token: String(tokenResp.data) },
    });
  } catch {
    // Push registration failures must never block the app.
  }
}
