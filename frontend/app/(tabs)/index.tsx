import React, { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { PostCard, Post } from "@/src/components/PostCard";
import { StoryBar, StoryGroup } from "@/src/components/StoryBar";
import { AffectionAnimation } from "@/src/components/AffectionAnimation";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { greeting } from "@/src/lib/time";
import { AFFECTION_MAP } from "@/src/lib/constants";

const QUICK = [
  { key: "love", emoji: "🤗", label: "Send Love", route: "/affection/send" },
  { key: "post", emoji: "📸", label: "Post", route: "/post/create" },
  { key: "event", emoji: "📅", label: "Event", route: "/event/create" },
  { key: "chores", emoji: "✅", label: "Chores", route: "/chores" },
];

export default function Home() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState<any>(null);
  const [nudge, setNudge] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [h, p, s, inbox] = await Promise.all([
        api("/home"),
        api<Post[]>("/posts"),
        api<StoryGroup[]>("/stories"),
        api("/affection/inbox"),
      ]);
      setHome(h);
      setPosts(p);
      setStories(s);
      if (inbox?.unseen?.length) setIncoming(inbox.unseen[0]);
      if (h?.on_this_day?.length) {
        const key = `otdNudge:${new Date().toISOString().slice(0, 10)}`;
        const seen = await storage.getItem<boolean>(key, false);
        if (!seen) setNudge(h.on_this_day[0]);
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleReact = async (post: Post, type: string) => {
    try {
      const updated =
        post.my_reaction === type
          ? await api<Post>(`/posts/${post.post_id}/react`, { method: "DELETE" })
          : await api<Post>(`/posts/${post.post_id}/react`, { method: "POST", body: { type } });
      setPosts((prev) => prev.map((p) => (p.post_id === post.post_id ? updated : p)));
    } catch {}
  };

  const dismissAffection = async () => {
    if (incoming) await api(`/affection/${incoming.affection_id}/seen`, { method: "POST" });
    setIncoming(null);
  };

  const sendBack = async () => {
    const to = incoming?.from_member_id;
    await dismissAffection();
    if (to) router.push(`/affection/send?member=${to}`);
  };

  const dismissNudge = async () => {
    const key = `otdNudge:${new Date().toISOString().slice(0, 10)}`;
    await storage.setItem(key, true);
    setNudge(null);
  };

  const openNudge = async () => {
    const tid = nudge?.timeline_id;
    await dismissNudge();
    if (tid) router.push(`/timeline/${tid}`);
  };

  const me = home?.me;
  const eventsToday = home?.events_today || [];
  const birthdays = home?.upcoming_birthdays || [];

  const Header = (
    <View>
      {nudge ? (
        <Pressable onPress={openNudge} style={styles.nudgeWrap} testID="otd-nudge">
          <LinearGradient colors={["#FFE7B3", "#FFD166"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nudge}>
            <AppText size={22}>🌅</AppText>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={14} color="#2C2C28" numberOfLines={2}>
                On this day {nudge.years_ago > 0 ? `${nudge.years_ago} year${nudge.years_ago > 1 ? "s" : ""} ago` : "today"}: {nudge.title}
              </AppText>
              <AppText size={12} color="rgba(44,44,40,0.72)">
                Tap to relive this memory ✨
              </AppText>
            </View>
            <Pressable onPress={dismissNudge} hitSlop={12} testID="otd-nudge-dismiss">
              <Ionicons name="close" size={18} color="#2C2C28" />
            </Pressable>
          </LinearGradient>
        </Pressable>
      ) : null}

      {/* greeting header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <AppText size={14} color={c.onSurfaceSecondary}>
            {greeting()},
          </AppText>
          <AppText family="display" weight="bold" size={26}>
            {me?.name || "Friend"} ❤️
          </AppText>
          <AppText size={13} color={c.onSurfaceTertiary}>
            {home?.family?.name}
          </AppText>
        </View>
        <Pressable onPress={() => me && router.push(`/member/${me.member_id}`)} testID="home-avatar">
          <Avatar uri={me?.photo_url} name={me?.name} size={52} color={me?.color} ring />
        </Pressable>
      </View>

      {/* quick actions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRow}
      >
        {QUICK.map((q) => (
          <Pressable
            key={q.key}
            onPress={() => router.push(q.route as any)}
            style={[styles.quickPill, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`quick-${q.key}`}
          >
            <AppText size={20}>{q.emoji}</AppText>
            <AppText size={13} weight="semibold" color={c.onSurface}>
              {q.label}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      {/* today's plan */}
      <View style={styles.section}>
        <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>
          Today's Plan
        </AppText>
        <View style={[styles.todayCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={styles.statRow}>
            <StatChip icon="calendar" label={`${eventsToday.length} events`} color={c.brand} onPress={() => router.push("/(tabs)/calendar")} />
            <StatChip icon="checkmark-circle" label={`${home?.pending_chores ?? 0} chores`} color={c.info} onPress={() => router.push("/chores")} />
            <StatChip icon="cart" label={`${home?.shopping_pending ?? 0} to buy`} color={c.success} onPress={() => router.push("/shopping")} />
          </View>

          {eventsToday.length > 0 ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {eventsToday.slice(0, 3).map((e: any) => (
                <View key={e.event_id} style={styles.eventRow}>
                  <View style={[styles.eventDot, { backgroundColor: e.color }]} />
                  <AppText size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                    {e.title}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {e.all_day ? "All day" : e.start_time}
                  </AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
              No events today — enjoy the calm ☀️
            </AppText>
          )}
        </View>

        {birthdays.length > 0 ? (
          <Pressable
            onPress={() => router.push("/(tabs)/family")}
            style={{ marginTop: spacing.md }}
            testID="birthday-banner"
          >
            <LinearGradient colors={["#FFD166", "#D98E5A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bdayCard}>
              <AppText size={26}>🎂</AppText>
              <View style={{ flex: 1 }}>
                <AppText family="display" weight="bold" size={15} color="#2C2C28">
                  {birthdays[0].member?.name} turns {ageNext(birthdays[0].member?.birthday)}{" "}
                  {birthdays[0].days === 0 ? "today!" : `in ${birthdays[0].days} day${birthdays[0].days > 1 ? "s" : ""}`}
                </AppText>
                <AppText size={12} color="rgba(44,44,40,0.7)">
                  Tap to send birthday love
                </AppText>
              </View>
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>

      {/* on this day */}
      {home?.on_this_day?.length ? (
        <View style={styles.section}>
          <View style={styles.otdHead}>
            <AppText family="display" weight="bold" size={18}>
              On This Day ✨
            </AppText>
            <Pressable onPress={() => router.push("/timeline")} hitSlop={8} testID="otd-see-all">
              <AppText size={13} weight="semibold" color={c.brand}>
                Family Story
              </AppText>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: 2 }}>
            {home.on_this_day.map((e: any) => (
              <Pressable
                key={e.timeline_id}
                onPress={() => router.push(`/timeline/${e.timeline_id}`)}
                style={[styles.otdCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                testID={`otd-${e.timeline_id}`}
              >
                {e.media?.[0] ? (
                  <SmartImage uri={e.media[0].url} style={styles.otdImg} />
                ) : (
                  <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.otdImg}>
                    <AppText size={34}>📖</AppText>
                  </LinearGradient>
                )}
                <View style={{ padding: spacing.md }}>
                  <AppText size={11} weight="bold" color={c.brand}>
                    {e.years_ago > 0 ? `${e.years_ago} year${e.years_ago > 1 ? "s" : ""} ago today` : "Today"}
                  </AppText>
                  <AppText family="display" weight="bold" size={14} numberOfLines={2} style={{ marginTop: 2 }}>
                    {e.title}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* stories */}
      <View style={{ marginTop: spacing.lg }}>
        <StoryBar
          groups={stories}
          onAdd={() => router.push("/post/create?story=1")}
          onOpen={() => router.push("/(tabs)/family")}
        />
      </View>

      <View style={[styles.section, { marginBottom: spacing.sm }]}>
        <AppText family="display" weight="bold" size={18}>
          Family Moments
        </AppText>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.post_id}
        ListHeaderComponent={Header}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <PostCard post={item} onReact={(t) => handleReact(item, t)} onOpen={() => router.push(`/post/${item.post_id}`)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={40}>🌱</AppText>
            <AppText family="display" weight="bold" size={17} center style={{ marginTop: spacing.md }}>
              Your family feed is empty
            </AppText>
            <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Share your first moment with the family
            </AppText>
            <Pressable onPress={() => router.push("/post/create")} style={[styles.emptyBtn, { backgroundColor: c.brand }]} testID="empty-post-btn">
              <AppText size={14} weight="bold" color="#fff">
                Create a post
              </AppText>
            </Pressable>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      />

      {/* FAB */}
      <Pressable
        onPress={() => router.push("/post/create")}
        style={[styles.fab, { backgroundColor: c.brand, bottom: 80 }, shadow(3)]}
        testID="fab-create-post"
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {incoming ? (
        <AffectionAnimation
          visible={!!incoming}
          type={incoming.type}
          title={`${incoming.from?.name} sent you ${AFFECTION_MAP[incoming.type]?.label || "love"} ${AFFECTION_MAP[incoming.type]?.emoji || "❤️"}`}
          subtitle={incoming.message}
          onDismiss={dismissAffection}
          onSendBack={sendBack}
        />
      ) : null}
    </View>
  );
}

function StatChip({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.statChip, { backgroundColor: c.surfaceSecondary }]}>
      <Ionicons name={icon} size={16} color={color} />
      <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ageNext(birthday?: string) {
  if (!birthday) return "";
  const b = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const next = new Date(b);
  next.setFullYear(today.getFullYear());
  if (next < today) age += 1;
  return age;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nudgeWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nudge: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, ...shadow(1) },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  quickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  otdHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  otdCard: { width: 160, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  otdImg: { width: "100%", height: 96, backgroundColor: "#EAE4D9", alignItems: "center", justifyContent: "center" },
  todayCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1 },
  statRow: { flexDirection: "row", gap: spacing.sm },
  statChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, flex: 1, justifyContent: "center" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  eventDot: { width: 10, height: 10, borderRadius: 5 },
  bdayCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  empty: { alignItems: "center", padding: spacing["2xl"], marginTop: spacing.lg },
  emptyBtn: { marginTop: spacing.lg, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
