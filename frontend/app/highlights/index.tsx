import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const STATS = [
  { key: "posts", label: "Posts shared", icon: "images", color: "#FF6B6B", emoji: "📸" },
  { key: "memories", label: "Memories added", icon: "book", color: "#D98E5A", emoji: "📖" },
  { key: "wishes", label: "Birthday wishes", icon: "gift", color: "#FFB84D", emoji: "🎂" },
  { key: "loves", label: "Love sent", icon: "heart", color: "#E86A8C", emoji: "❤️" },
] as const;

export default function Highlights() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/highlights/week"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const counts = data.counts || {};
  const periodLabel = `${dayjs(data.period?.from).format("D MMM")} – ${dayjs(data.period?.to).format("D MMM")}`;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + spacing.sm }]} testID="highlights-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <AppText size={30}>✨</AppText>
          <AppText family="display" weight="bold" size={24} color="#fff" center style={{ marginTop: 4 }}>
            This Week's Highlights
          </AppText>
          <AppText size={13} color="rgba(255,255,255,0.92)" style={{ marginTop: 2 }}>
            {periodLabel}
          </AppText>
        </LinearGradient>

        {/* stats */}
        <View style={styles.statGrid}>
          {STATS.map((s) => (
            <View key={s.key} style={[styles.statCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              <AppText size={22}>{s.emoji}</AppText>
              <AppText family="display" weight="bold" size={26} style={{ marginTop: 4 }}>
                {counts[s.key] ?? 0}
              </AppText>
              <AppText size={12} color={c.onSurfaceTertiary}>
                {s.label}
              </AppText>
            </View>
          ))}
        </View>

        {data.top_poster ? (
          <View style={[styles.topCard, { backgroundColor: c.brandTertiary }]}>
            <Avatar uri={data.top_poster.photo_url} name={data.top_poster.name} size={48} color={data.top_poster.color} ring />
            <View style={{ flex: 1 }}>
              <AppText size={12} weight="bold" color={c.brand}>
                MOST ACTIVE THIS WEEK
              </AppText>
              <AppText family="display" weight="bold" size={17}>
                {data.top_poster.name} 🌟
              </AppText>
            </View>
          </View>
        ) : null}

        {data.memories?.length ? (
          <View style={styles.section}>
            <AppText family="display" weight="bold" size={17} style={{ marginBottom: spacing.md }}>
              New memories 📖
            </AppText>
            {data.memories.map((m: any) => (
              <Pressable key={m.id} onPress={() => router.push(`/timeline/${m.id}`)} style={[styles.memRow, { backgroundColor: c.surface, borderColor: c.border }]} testID={`hl-memory-${m.id}`}>
                {m.cover ? <SmartImage uri={m.cover} style={styles.memThumb} /> : <View style={[styles.memThumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}><AppText size={20}>📖</AppText></View>}
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={14} numberOfLines={1}>
                    {m.title}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {dayjs(m.date).format("D MMM YYYY")}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {counts.posts === 0 && counts.memories === 0 && counts.wishes === 0 && counts.loves === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🌱</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              A quiet week
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Share a post or a memory to fill next week's recap
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  back: { position: "absolute", left: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, padding: spacing.lg },
  statCard: { flexGrow: 1, flexBasis: "45%", borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.lg, alignItems: "center" },
  topCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.lg },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  memRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.sm },
  memThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
