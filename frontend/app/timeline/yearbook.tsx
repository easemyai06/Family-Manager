import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { formatDMY } from "@/src/lib/time";

export default function Yearbook() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ year?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [fam, setFam] = useState<any>(null);
  const [year, setYear] = useState<string | null>(params.year || null);

  const load = useCallback(async () => {
    try {
      const [tl, f] = await Promise.all([api("/timeline"), api("/families/me")]);
      setItems(tl);
      setFam(f.family);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const e of items) if (e.date) set.add(e.date.slice(0, 4));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const activeYear = year || years[0] || null;
  const pages = useMemo(
    () => items.filter((e) => e.date?.slice(0, 4) === activeYear).sort((a, b) => a.date.localeCompare(b.date)),
    [items, activeYear]
  );
  const photoCount = pages.reduce((n, e) => n + (e.media?.length || 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="yearbook-back">
            <Ionicons name="chevron-back" size={26} color={c.onSurface} />
          </Pressable>
          <AppText family="display" weight="bold" size={20} style={{ flex: 1 }}>
            Family Yearbook 📖
          </AppText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {years.map((y) => {
            const sel = y === activeYear;
            return (
              <Pressable key={y} onPress={() => setYear(y)} style={[styles.chip, { backgroundColor: sel ? c.brand : c.surfaceSecondary, borderColor: sel ? c.brand : c.border }]} testID={`yearbook-year-${y}`}>
                <AppText size={14} weight="bold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {y}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {activeYear ? (
          <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
            <AppText family="display" weight="bold" size={64} color="#fff">
              {activeYear}
            </AppText>
            <AppText family="display" weight="bold" size={20} color="#fff" center>
              {fam?.name || "Our Family"}
            </AppText>
            <AppText size={14} color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>
              {pages.length} {pages.length === 1 ? "memory" : "memories"} · {photoCount} {photoCount === 1 ? "photo" : "photos"}
            </AppText>
          </LinearGradient>
        ) : (
          <View style={styles.empty}>
            <AppText size={40}>📖</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No memories yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Add memories to build your family yearbook
            </AppText>
          </View>
        )}

        {pages.map((e, idx) => (
          <Pressable
            key={e.timeline_id}
            onPress={() => router.push(`/timeline/${e.timeline_id}`)}
            style={[styles.page, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`yearbook-page-${e.timeline_id}`}
          >
            {e.media?.[0] ? <SmartImage uri={e.media[0].url} style={{ width: "100%", height: width * 0.55, backgroundColor: "#EAE4D9" }} /> : null}
            <View style={{ padding: spacing.lg }}>
              <View style={styles.pageTop}>
                <AppText size={12} weight="bold" color={c.brand}>
                  {formatDMY(e.date)}
                </AppText>
                <AppText size={11} color={c.onSurfaceTertiary}>
                  {e.category}
                </AppText>
              </View>
              <AppText family="display" weight="bold" size={19} style={{ marginTop: 4 }}>
                {e.importance ? "⭐ " : ""}
                {e.title}
              </AppText>
              {e.location ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={c.onSurfaceTertiary} />
                  <AppText size={12} color={c.onSurfaceSecondary}>
                    {e.location}
                  </AppText>
                </View>
              ) : null}
              {e.description ? (
                <AppText size={14} color={c.onSurface} style={{ marginTop: spacing.sm, lineHeight: 22 }}>
                  {e.description}
                </AppText>
              ) : null}
              {e.people_members?.length ? (
                <View style={styles.avatarRow}>
                  {e.people_members.slice(0, 6).map((p: any, i: number) => (
                    <View key={p.member_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                      <Avatar uri={p.photo_url} name={p.name} size={26} color={p.color} ring />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={[styles.pageNum, { backgroundColor: c.surfaceSecondary }]}>
              <AppText size={11} weight="bold" color={c.onSurfaceTertiary}>
                {idx + 1}
              </AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chip: { height: 36, minWidth: 64, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cover: { margin: spacing.lg, borderRadius: radius.lg, paddingVertical: spacing["3xl"], alignItems: "center", ...shadow(2) },
  page: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  pageTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  avatarRow: { flexDirection: "row", marginTop: spacing.md },
  pageNum: { position: "absolute", top: spacing.md, right: spacing.md, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
