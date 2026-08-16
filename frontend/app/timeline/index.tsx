import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, FlatList } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { TIMELINE_CATEGORIES } from "@/src/lib/constants";
import { formatDate } from "@/src/lib/time";

export default function Timeline() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ member?: string; name?: string; category?: string; year?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>(params.category || "All");

  const load = useCallback(async () => {
    try {
      const q = params.member ? `?member_id=${params.member}` : "";
      setItems(await api(`/timeline${q}`));
    } catch {}
  }, [params.member]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const chips = ["All", "⭐ Important", ...TIMELINE_CATEGORIES];

  const grouped = useMemo(() => {
    let list = items;
    if (params.year) list = list.filter((e) => e.date?.startsWith(params.year!));
    if (filter === "⭐ Important") list = list.filter((e) => e.importance);
    else if (filter !== "All") list = list.filter((e) => e.category === filter);
    const byYear: Record<string, any[]> = {};
    for (const e of list) {
      const y = e.date?.slice(0, 4) || "—";
      (byYear[y] = byYear[y] || []).push(e);
    }
    return Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items, filter, params.year]);

  const title = params.member ? `${params.name || "My"} Story` : "Our Family Story";

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      {/* fixed header + sticky chips */}
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="timeline-back">
            <Ionicons name="chevron-back" size={26} color={c.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText family="display" weight="bold" size={20} numberOfLines={1}>
              {title} ❤️
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {items.length} memories preserved
            </AppText>
          </View>
          {!params.member ? (
            <Pressable onPress={() => router.push("/timeline/vault")} hitSlop={10} style={[styles.vaultBtn, { backgroundColor: c.brandTertiary }]} testID="open-vault">
              <Ionicons name="albums" size={18} color={c.brand} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((chip) => {
            const sel = filter === chip;
            return (
              <Pressable
                key={chip}
                onPress={() => setFilter(chip)}
                style={[styles.chip, { backgroundColor: sel ? c.brand : c.surfaceSecondary, borderColor: sel ? c.brand : c.border }]}
                testID={`tl-chip-${chip}`}
              >
                <AppText size={13} weight="semibold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {chip}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={grouped}
        keyExtractor={(g) => g[0]}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={40}>📖</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No memories here yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Tap + to add your family's first memory
            </AppText>
          </View>
        }
        renderItem={({ item: [year, events] }) => (
          <View style={{ marginBottom: spacing.xl }}>
            <View style={styles.yearRow}>
              <AppText family="display" weight="bold" size={22} color={c.brand}>
                {year}
              </AppText>
              <View style={[styles.yearLine, { backgroundColor: c.border }]} />
            </View>
            {events.map((e: any) => (
              <Pressable
                key={e.timeline_id}
                onPress={() => router.push(`/timeline/${e.timeline_id}`)}
                style={[styles.card, { backgroundColor: c.surface, borderColor: e.importance ? c.warning : c.border }, shadow(1)]}
                testID={`memory-${e.timeline_id}`}
              >
                {e.media?.[0] ? <SmartImage uri={e.media[0].url} style={styles.cardImg} /> : null}
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <AppText size={12} color={c.onSurfaceTertiary}>
                      {formatDate(e.date, "D MMM YYYY")}
                    </AppText>
                    {e.importance ? (
                      <View style={[styles.impBadge, { backgroundColor: c.warning }]}>
                        <AppText size={10} weight="bold" color={c.onWarning}>
                          ⭐ Important
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText family="display" weight="bold" size={16} style={{ marginTop: 4 }}>
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
                  {e.people_members?.length ? (
                    <View style={styles.avatarRow}>
                      {e.people_members.slice(0, 5).map((p: any, i: number) => (
                        <View key={p.member_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                          <Avatar uri={p.photo_url} name={p.name} size={24} color={p.color} ring />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      />

      <Pressable onPress={() => router.push("/timeline/create")} style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]} testID="fab-add-memory">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  vaultBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chip: { height: 36, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0 },
  yearRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  yearLine: { flex: 1, height: 2, borderRadius: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1.5, overflow: "hidden", marginBottom: spacing.md },
  cardImg: { width: "100%", height: 160, backgroundColor: "#EAE4D9" },
  cardBody: { padding: spacing.lg },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  impBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  avatarRow: { flexDirection: "row", marginTop: spacing.md },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
