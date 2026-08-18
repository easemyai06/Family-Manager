import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Capsules() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api("/capsules"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="capsules-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>
            Time Capsules ⏳
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            Messages that unlock in the future
          </AppText>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.capsule_id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={44}>⏳</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No time capsules yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Write a message today to open on a future date
            </AppText>
          </View>
        }
        renderItem={({ item: cap }) => (
          <Pressable
            onPress={() => router.push(`/capsule/${cap.capsule_id}`)}
            style={[styles.card, { backgroundColor: c.surface, borderColor: cap.is_locked ? c.border : c.brand }, shadow(1)]}
            testID={`capsule-${cap.capsule_id}`}
          >
            {cap.is_locked ? (
              <LinearGradient colors={["#6E6A63", "#3A3833"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
                <Ionicons name="lock-closed" size={22} color="#fff" />
              </LinearGradient>
            ) : (
              <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
                <Ionicons name="mail-open" size={22} color="#fff" />
              </LinearGradient>
            )}
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={16}>
                {cap.is_locked ? "Sealed capsule" : "Unlocked capsule"}
              </AppText>
              {cap.is_locked ? (
                <AppText size={13} color={c.brand} weight="semibold" style={{ marginTop: 2 }}>
                  Opens in {cap.days_until} {cap.days_until === 1 ? "day" : "days"} · {dayjs(cap.unlock_date).format("DD-MM-YYYY")}
                </AppText>
              ) : (
                <AppText size={13} color={c.onSurfaceSecondary} numberOfLines={2} style={{ marginTop: 2 }}>
                  {cap.message}
                </AppText>
              )}
              <View style={styles.byRow}>
                <Avatar uri={cap.author?.photo_url} name={cap.author?.name} size={20} color={cap.author?.color} />
                <AppText size={12} color={c.onSurfaceTertiary}>
                  from {cap.author?.name}
                </AppText>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
          </Pressable>
        )}
      />

      <Pressable onPress={() => router.push("/capsule/create")} style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]} testID="fab-add-capsule">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.md },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  byRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
