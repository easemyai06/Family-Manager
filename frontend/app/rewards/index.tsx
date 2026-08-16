import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { StarBurst } from "@/src/components/StarBurst";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Rewards() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [burst, setBurst] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/rewards");
      setData(d);
      setBurst(true);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const maxPoints = Math.max(1, ...data.leaderboard.map((x: any) => x.points));

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={["#FFB84D", "#FF8A3D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + spacing.sm }]} testID="rewards-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <AppText family="display" weight="bold" size={22} color="#fff" center>
            Family Rewards
          </AppText>
          <View style={styles.streakBig}>
            <AppText size={54}>🔥</AppText>
            <View>
              <AppText family="display" weight="bold" size={44} color="#fff">
                {data.streak}
              </AppText>
              <AppText size={13} color="rgba(255,255,255,0.95)" weight="semibold">
                day{data.streak === 1 ? "" : "s"} streak
              </AppText>
            </View>
          </View>
          <AppText size={12} color="rgba(255,255,255,0.9)" center>
            Keep the family active every day to grow the streak!
          </AppText>
        </LinearGradient>

        {/* leaderboard */}
        <View style={styles.section}>
          <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>
            Star Leaderboard ⭐
          </AppText>
          {data.leaderboard.map((row: any, i: number) => (
            <View key={row.member.member_id} style={[styles.lbRow, { backgroundColor: c.surface, borderColor: i === 0 ? "#FFB84D" : c.border }, shadow(1)]} testID={`lb-${row.member.member_id}`}>
              <AppText size={20} style={{ width: 26 }}>
                {MEDALS[i] || `${i + 1}`}
              </AppText>
              <Avatar uri={row.member.photo_url} name={row.member.name} size={44} color={row.member.color} ring={i === 0} />
              <View style={{ flex: 1 }}>
                <AppText family="display" weight="bold" size={15}>
                  {row.member.name}
                </AppText>
                <View style={[styles.bar, { backgroundColor: c.surfaceTertiary }]}>
                  <View style={[styles.barFill, { width: `${(row.points / maxPoints) * 100}%`, backgroundColor: row.member.color || c.brand }]} />
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText family="display" weight="bold" size={20} color={c.brand}>
                  {row.points}
                </AppText>
                <AppText size={11} color={c.onSurfaceTertiary}>
                  ⭐ stars
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {/* badges */}
        <View style={styles.section}>
          <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>
            Badges 🏅
          </AppText>
          <View style={styles.badgeGrid}>
            {data.badges.map((b: any) => (
              <View key={b.key} style={[styles.badge, { backgroundColor: c.surface, borderColor: b.earned ? c.brand : c.border, opacity: b.earned ? 1 : 0.7 }]} testID={`badge-${b.key}`}>
                <AppText size={30} style={{ opacity: b.earned ? 1 : 0.35 }}>
                  {b.emoji}
                </AppText>
                <AppText size={12} weight="bold" center numberOfLines={1} style={{ marginTop: 4 }}>
                  {b.label}
                </AppText>
                {b.earned ? (
                  <AppText size={11} weight="semibold" color={c.brand}>
                    Unlocked!
                  </AppText>
                ) : (
                  <AppText size={11} color={c.onSurfaceTertiary}>
                    {b.current}/{b.target}
                  </AppText>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {burst ? <StarBurst onDone={() => setBurst(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  back: { position: "absolute", left: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.2)", alignItems: "center", justifyContent: "center" },
  streakBig: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.md },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  lbRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.sm },
  bar: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  badge: { width: "30%", flexGrow: 1, alignItems: "center", borderRadius: radius.lg, borderWidth: 1.5, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
});
