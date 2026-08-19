import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { enablePush, getPushStatus, PushStatus } from "@/src/lib/push";

const ALERTS = [
  { icon: "sunny", color: "#E8A33D", text: "Morning “On This Day” memories" },
  { icon: "chatbubbles", color: "#7FA9C9", text: "New family chat messages" },
  { icon: "calendar", color: "#8AB07D", text: "Event RSVP reminders" },
  { icon: "megaphone", color: "#9B8AC9", text: "New noticeboard posts" },
  { icon: "warning", color: "#E86A6A", text: "Family SOS alerts" },
];

export default function NotificationsSettings() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("denied");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    setStatus(await getPushStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 3000);
  };

  const turnOn = async () => {
    if (!user?.user_id) return;
    setBusy(true);
    const res = await enablePush(user.user_id);
    setStatus(res);
    setBusy(false);
    if (res === "granted") flash("Notifications are on 🎉");
    else if (res === "denied") flash("Permission needed to send notifications");
  };

  const on = status === "granted";
  const blocked = status === "blocked";
  const web = status === "unsupported";

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="notif-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Notifications
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* status card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: on ? "#8AB07D" : c.border }, shadow(1)]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: on ? "#8AB07D22" : c.surfaceSecondary }]}>
              <Ionicons name={on ? "notifications" : "notifications-off"} size={22} color={on ? "#5E8C4E" : c.onSurfaceTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={16}>
                Push notifications
              </AppText>
              <AppText size={13} color={on ? "#5E8C4E" : c.onSurfaceTertiary}>
                {web ? "Available in the mobile app" : on ? "On — you’re all set" : blocked ? "Blocked in device settings" : "Off"}
              </AppText>
            </View>
          </View>

          {web ? (
            <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, lineHeight: 20 }}>
              Push notifications work in the FamilyHome mobile app on your phone (after you publish and build the app).
            </AppText>
          ) : on ? (
            <Button
              label="Manage in device settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
              testID="notif-open-settings"
              style={{ marginTop: spacing.md }}
            />
          ) : blocked ? (
            <>
              <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, lineHeight: 20 }}>
                Notifications are turned off for FamilyHome. Enable them in your device settings to start receiving alerts.
              </AppText>
              <Button
                label="Open Settings"
                onPress={() => Linking.openSettings()}
                testID="notif-open-settings"
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <Button
              label={busy ? "Turning on…" : "Turn On Notifications"}
              loading={busy}
              onPress={turnOn}
              testID="notif-enable"
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>

        {/* what you'll get */}
        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
          YOU’LL BE NOTIFIED ABOUT
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          {ALERTS.map((a, i) => (
            <View key={a.icon} style={[styles.alertRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.divider }]}>
              <View style={[styles.alertIcon, { backgroundColor: a.color + "22" }]}>
                <Ionicons name={a.icon as any} size={16} color={a.color} />
              </View>
              <AppText size={14} color={c.onSurface}>
                {a.text}
              </AppText>
            </View>
          ))}
        </View>

        {Platform.OS !== "web" ? (
          <AppText size={12} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.lg, lineHeight: 18 }}>
            Alerts are delivered on a real device after you publish and build the app.
          </AppText>
        ) : null}
      </ScrollView>

      {note ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="notif-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  alertIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow(3) },
});
