import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, SectionList, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

type Photo = { url: string; timeline_id: string; title: string };

export default function MemoryVault() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api("/timeline"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const gap = 3;
  const cols = 3;
  const size = (width - spacing.lg * 2 - gap * (cols - 1)) / cols;

  const sections = useMemo(() => {
    const byYear: Record<string, Photo[]> = {};
    for (const e of items) {
      const y = e.date?.slice(0, 4) || "—";
      for (const md of e.media || []) {
        if (md.type === "image") (byYear[y] = byYear[y] || []).push({ url: md.url, timeline_id: e.timeline_id, title: e.title });
      }
    }
    // chunk each year's photos into rows of `cols`
    return Object.entries(byYear)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, photos]) => {
        const rows: Photo[][] = [];
        for (let i = 0; i < photos.length; i += cols) rows.push(photos.slice(i, i + cols));
        return { title: year, count: photos.length, data: rows };
      });
  }, [items]);

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="vault-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>
            Memory Vault 📸
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            Every photo from your family story
          </AppText>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(row, i) => `${i}-${row.map((p) => p.url).join()}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={40}>🖼️</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No photos yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Add memories with pictures to fill your vault
            </AppText>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.yearHeader}>
            <AppText family="display" weight="bold" size={18} color={c.brand}>
              {section.title}
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {(section as any).count} photo{(section as any).count > 1 ? "s" : ""}
            </AppText>
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={{ flexDirection: "row", gap, marginBottom: gap }}>
            {row.map((p, i) => (
              <Pressable key={i} onPress={() => router.push(`/timeline/${p.timeline_id}`)} testID={`vault-photo-${p.timeline_id}-${i}`}>
                <SmartImage uri={p.url} style={{ width: size, height: size, borderRadius: 4, backgroundColor: "#EAE4D9" }} />
              </Pressable>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  yearHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
