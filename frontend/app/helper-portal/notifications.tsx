import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { helperApi, setHelperToken } from "@/src/lib/helperApi";
import { timeAgo } from "@/src/lib/time";

type Notif = {
  kind: string;
  emoji: string;
  title: string;
  subtitle?: string | null;
  route?: string;
  created_at?: string;
};

export default function HelperNotifications() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notif[]>([]);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/notifications");
      setItems(d.items || []);
      setLastRead(d.last_read || null);
      // mark everything as read once viewed
      await helperApi("/helper/notifications/read", { method: "POST" }).catch(() => {});
    } catch (e: any) {
      if (e?.status === 401) {
        await setHelperToken(null);
        router.replace("/helper-login");
      }
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const [replied, setReplied] = useState<Record<number, boolean>>({});
  const [flash, setFlash] = useState("");

  const quickReply = async (idx: number) => {
    setReplied((p) => ({ ...p, [idx]: true }));
    setFlash("Sent “On it 👍” to the Care Team");
    setTimeout(() => setFlash(""), 2400);
    try {
      await helperApi("/helper/care-team", { method: "POST", body: { text: "On it 👍" } });
    } catch {
      setReplied((p) => ({ ...p, [idx]: false }));
      setFlash("Couldn't send — try again");
      setTimeout(() => setFlash(""), 2400);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="notif-back" style={[styles.iconBtn, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>Alerts</AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>Messages & notes from the family</AppText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brandPrimary} />}
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🔔</AppText>
            <AppText size={15} weight="semibold" style={{ marginTop: spacing.md }}>You're all caught up</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              New Care Team messages and family notes will show up here.
            </AppText>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((it, i) => {
              const unread = !!(it.created_at && (!lastRead || it.created_at > lastRead));
              return (
                <Pressable
                  key={i}
                  onPress={() => it.route && router.push(it.route as any)}
                  style={[styles.row, { backgroundColor: unread ? c.brandTertiary + "40" : c.surface, borderColor: unread ? c.brandPrimary + "55" : c.border }, shadow(1)]}
                  testID={`helper-notif-${i}`}
                >
                  <View style={[styles.emojiWrap, { backgroundColor: c.surfaceSecondary }]}>
                    <AppText size={20}>{it.emoji}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size={14} weight={unread ? "bold" : "semibold"} numberOfLines={2}>{it.title}</AppText>
                    {it.subtitle ? (
                      <AppText size={13} color={c.onSurfaceSecondary} numberOfLines={2} style={{ marginTop: 2 }}>{it.subtitle}</AppText>
                    ) : null}
                    <AppText size={11} color={c.onSurfaceTertiary} style={{ marginTop: 3 }}>{timeAgo(it.created_at)}</AppText>
                    {it.kind === "care_team" ? (
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); if (!replied[i]) quickReply(i); }}
                        disabled={replied[i]}
                        style={[styles.replyChip, { backgroundColor: replied[i] ? c.success + "22" : c.brandPrimary, borderColor: replied[i] ? c.success : c.brandPrimary }]}
                        testID={`helper-reply-${i}`}
                      >
                        <Ionicons name={replied[i] ? "checkmark" : "hand-right-outline"} size={14} color={replied[i] ? c.success : "#fff"} />
                        <AppText size={12} weight="bold" color={replied[i] ? c.success : "#fff"}>
                          {replied[i] ? "Sent" : "On it 👍"}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  {unread ? <View style={[styles.dot, { backgroundColor: c.brandPrimary }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      {flash ? (
        <View style={[styles.flash, { backgroundColor: c.surfaceInverse }, shadow(3)]} testID="helper-reply-flash">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>{flash}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", ...shadow(1) },
  empty: { alignItems: "center", paddingVertical: spacing["2xl"] * 1.5 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1 },
  emojiWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  replyChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  flash: { position: "absolute", alignSelf: "center", bottom: 40, maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
