import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, useWindowDimensions } from "react-native";
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
import { formatDate } from "@/src/lib/time";

export default function MemoryDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setM(await api(`/timeline/${id}`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remove = () => {
    Alert.alert("Delete memory?", "This memory will be removed from your family story.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/timeline/${id}`, { method: "DELETE" });
            router.back();
          } catch {}
        },
      },
    ]);
  };

  if (!m) return <View style={{ flex: 1, backgroundColor: c.surface }} />;

  const hasMedia = m.media?.length > 0;
  const heroH = Math.min(width * 0.9, 380);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* hero */}
        <View style={{ height: hasMedia ? heroH : 150 }}>
          {hasMedia ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {m.media.map((img: any, i: number) => (
                <SmartImage key={i} uri={img.url} style={{ width, height: heroH }} />
              ))}
            </ScrollView>
          ) : (
            <LinearGradient colors={[c.brand, "#2C2C28"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.45)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.circleBtn, { top: insets.top + 6, left: spacing.lg }]} testID="memory-detail-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={remove} hitSlop={12} style={[styles.circleBtn, { top: insets.top + 6, right: spacing.lg }]} testID="memory-delete">
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={[styles.body, { backgroundColor: c.surface }]}>
          <View style={styles.tagRow}>
            <View style={[styles.catBadge, { backgroundColor: c.brandTertiary }]}>
              <AppText size={12} weight="bold" color={c.brand}>
                {m.category}
              </AppText>
            </View>
            {m.importance ? (
              <View style={[styles.catBadge, { backgroundColor: c.warning }]}>
                <AppText size={12} weight="bold" color={c.onWarning}>
                  ⭐ Important
                </AppText>
              </View>
            ) : null}
          </View>

          <AppText family="display" weight="bold" size={24} style={{ marginTop: spacing.md }}>
            {m.title}
          </AppText>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={15} color={c.onSurfaceTertiary} />
            <AppText size={14} color={c.onSurfaceSecondary}>
              {formatDate(m.date, "dddd, D MMMM YYYY")}
            </AppText>
          </View>
          {m.location ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color={c.onSurfaceTertiary} />
              <AppText size={14} color={c.onSurfaceSecondary}>
                {m.location}
              </AppText>
            </View>
          ) : null}

          {m.description ? (
            <AppText size={15} color={c.onSurface} style={{ marginTop: spacing.lg, lineHeight: 23 }}>
              {m.description}
            </AppText>
          ) : null}

          {m.people_members?.length ? (
            <View style={{ marginTop: spacing.xl }}>
              <AppText size={13} weight="bold" color={c.onSurfaceSecondary} style={{ marginBottom: spacing.md }}>
                Who was there
              </AppText>
              <View style={styles.peopleWrap}>
                {m.people_members.map((p: any) => (
                  <Pressable key={p.member_id} onPress={() => router.push(`/member/${p.member_id}`)} style={styles.person} testID={`memory-who-${p.member_id}`}>
                    <Avatar uri={p.photo_url} name={p.name} size={44} color={p.color} ring />
                    <AppText size={12} weight="semibold" numberOfLines={1} style={{ maxWidth: 60 }}>
                      {p.name}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  circleBtn: { position: "absolute", width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  body: { marginTop: -20, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, minHeight: 300, ...shadow(2) },
  tagRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  catBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  peopleWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  person: { alignItems: "center", gap: 4 },
});
