import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { AffectionAnimation } from "@/src/components/AffectionAnimation";
import { StarBurst } from "@/src/components/StarBurst";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";

type Props = {
  home: any;
  incoming: any;
  onDismissAffection: () => void;
  onSendBack: () => void;
  onToggleChore: (choreId: string, wasDone: boolean) => void;
  celebrating: boolean;
  onCelebrateDone: () => void;
};

export function KidsHome({
  home,
  incoming,
  onDismissAffection,
  onSendBack,
  onToggleChore,
  celebrating,
  onCelebrateDone,
}: Props) {
  const { c } = useTheme();
  const { familyChatId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openChat = async () => {
    let id = familyChatId;
    if (!id) {
      try {
        const chats = await api<any[]>("/chats");
        id = chats.find((ch) => ch.type === "family")?.chat_id || null;
      } catch {}
    }
    if (id) router.push(`/chat/${id}?name=${encodeURIComponent("Family Chat")}` as any);
    else router.push("/(tabs)/chat" as any);
  };

  const me = home?.me;
  const events = home?.events_today || [];
  const mine = (home?.kids || []).find((k: any) => k.member.member_id === me?.member_id);
  const chores = mine?.chores || [];
  const allDone = mine && mine.total > 0 && mine.done === mine.total;

  // Parents to "hug" quickly
  const parents = (home?.members || []).filter(
    (m: any) => m.member_id !== me?.member_id && (m.role === "parent" || m.role === "admin")
  );

  const quick: { emoji: string; label: string; onPress: () => void; testID: string }[] = [
    ...parents.slice(0, 2).map((p: any) => ({
      emoji: "🤗",
      label: `Hug ${p.name}`,
      onPress: () => router.push(`/affection/send?member=${p.member_id}&type=hug` as any),
      testID: `kids-hug-${p.member_id}`,
    })),
    { emoji: "❤️", label: "Send Love", onPress: () => router.push("/affection/send"), testID: "kids-send-love" },
    { emoji: "💬", label: "Family Chat", onPress: openChat, testID: "kids-chat" },
    { emoji: "🎁", label: "My Wishlist", onPress: () => router.push("/wishlist"), testID: "kids-wishlist" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {/* greeting */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppText family="display" weight="bold" size={26} accessibilityRole="header">
              Hi {me?.name || "there"} 👋
            </AppText>
            <AppText size={15} color={c.onSurfaceSecondary}>Here's your day</AppText>
          </View>
          <Pressable
            onPress={() => me && router.push(`/member/${me.member_id}`)}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            testID="kids-avatar"
          >
            <Avatar uri={me?.photo_url} name={me?.name} size={52} color={me?.color} ring />
          </Pressable>
        </View>

        {/* Today */}
        <AppText family="display" weight="bold" size={19} style={styles.secHead}>
          📅 Today
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          {events.length ? (
            events.slice(0, 4).map((e: any, i: number) => (
              <View key={e.event_id} style={[styles.eventRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.divider }]}>
                <View style={[styles.eventBar, { backgroundColor: e.color || c.brand }]} />
                <AppText size={17} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                  {e.title}
                </AppText>
                <AppText size={15} weight="bold" color={c.onSurfaceSecondary}>
                  {e.all_day ? "All day" : e.start_time || ""}
                </AppText>
              </View>
            ))
          ) : (
            <View style={styles.emptyRow}>
              <AppText size={26}>☀️</AppText>
              <AppText size={16} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
                Nothing today — have fun!
              </AppText>
            </View>
          )}
        </View>

        {/* My chores */}
        <AppText family="display" weight="bold" size={19} style={styles.secHead}>
          ✅ My Chores
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          {chores.length ? (
            <>
              {allDone ? (
                <AppText size={17} weight="bold" color={c.success} style={{ marginBottom: spacing.sm }}>
                  All done — amazing! ⭐
                </AppText>
              ) : (
                <AppText size={16} weight="bold" color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
                  {mine.done} of {mine.total} done
                </AppText>
              )}
              {chores.map((ch: any) => (
                <Pressable
                  key={ch.chore_id}
                  onPress={() => onToggleChore(ch.chore_id, ch.done_today)}
                  style={styles.choreRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ch.done_today }}
                  accessibilityLabel={`${ch.title}, ${ch.done_today ? "done" : "not done"}`}
                  testID={`kids-chore-${ch.chore_id}`}
                >
                  <Ionicons
                    name={ch.done_today ? "checkmark-circle" : "ellipse-outline"}
                    size={30}
                    color={ch.done_today ? c.success : c.onSurfaceTertiary}
                  />
                  <AppText
                    size={17}
                    weight="semibold"
                    style={[{ flex: 1 }, ch.done_today && { textDecorationLine: "line-through" }]}
                    color={ch.done_today ? c.onSurfaceTertiary : c.onSurface}
                  >
                    {ch.title}
                  </AppText>
                  <AppText size={15} weight="bold" color={c.warning}>
                    +{ch.stars}⭐
                  </AppText>
                </Pressable>
              ))}
            </>
          ) : (
            <View style={styles.emptyRow}>
              <AppText size={26}>🎉</AppText>
              <AppText size={16} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
                No chores today!
              </AppText>
            </View>
          )}
        </View>

        {/* Quick actions */}
        <AppText family="display" weight="bold" size={19} style={styles.secHead}>
          ⭐ Quick Actions
        </AppText>
        <View style={styles.quickGrid}>
          {quick.map((q) => (
            <Pressable
              key={q.testID}
              onPress={q.onPress}
              style={[styles.quickTile, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              accessibilityRole="button"
              accessibilityLabel={q.label}
              testID={q.testID}
            >
              <AppText size={34}>{q.emoji}</AppText>
              <AppText size={15} weight="bold" center style={{ marginTop: 6 }}>
                {q.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {celebrating ? <StarBurst onDone={onCelebrateDone} /> : null}

      {incoming ? (
        <AffectionAnimation
          visible={!!incoming}
          type={incoming.type}
          title={`${incoming.from?.name} sent you ${AFFECTION_MAP[incoming.type]?.label || "love"} ${AFFECTION_MAP[incoming.type]?.emoji || "❤️"}`}
          subtitle={incoming.message}
          onDismiss={onDismissAffection}
          onSendBack={onSendBack}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  secHead: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  eventBar: { width: 5, height: 38, borderRadius: 3 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  choreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  quickTile: {
    width: "47.5%",
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
});
