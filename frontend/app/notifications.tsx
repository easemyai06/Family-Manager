import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { timeAgo } from "@/src/lib/time";

export default function Notifications() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [lastRead, setLastRead] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<any>("/notifications");
      setItems(d.items || []);
      setLastRead(d.last_read || "");
      // mark everything read once we've shown it
      api("/notifications/read", { method: "POST" }).catch(() => {});
    } catch {}
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isNew = item.type !== "birthday" && (item.created_at || "") > (lastRead || "");
    return (
      <Pressable
        onPress={() => item.route && router.push(item.route as any)}
        style={[styles.row, { borderBottomColor: c.divider }]}
        testID={`notif-${item.id}`}
      >
        <View style={styles.iconWrap}>
          {item.actor?.photo_url || item.actor?.name ? (
            <Avatar uri={item.actor?.photo_url} name={item.actor?.name} size={42} color={item.actor?.color} />
          ) : (
            <View style={[styles.emojiCircle, { backgroundColor: c.brandTertiary }]}>
              <AppText size={20}>{item.emoji || "🔔"}</AppText>
            </View>
          )}
          <View style={[styles.emojiBadge, { backgroundColor: c.surface, borderColor: c.border }]}>
            <AppText size={12}>{item.emoji || "🔔"}</AppText>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <AppText size={14} weight={isNew ? "bold" : "semibold"} numberOfLines={2}>
            {item.title}
          </AppText>
          {item.subtitle ? (
            <AppText size={13} color={c.onSurfaceSecondary} numberOfLines={2} style={{ marginTop: 2 }}>
              {item.subtitle}
            </AppText>
          ) : null}
          {item.type !== "birthday" ? (
            <AppText size={11} color={c.onSurfaceTertiary} style={{ marginTop: 3 }}>
              {timeAgo(item.created_at)}
            </AppText>
          ) : null}
        </View>
        {isNew ? <View style={[styles.newDot, { backgroundColor: c.brand }]} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="notif-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20} style={{ flex: 1 }}>
          Activity
        </AppText>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <AppText size={40}>🔔</AppText>
              <AppText size={15} weight="bold" style={{ marginTop: spacing.sm }}>
                All caught up
              </AppText>
              <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4, paddingHorizontal: spacing.xl }}>
                New posts, memories, messages and family moments will show up here.
              </AppText>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  iconWrap: { width: 42, height: 42 },
  emojiCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  emojiBadge: { position: "absolute", bottom: -3, right: -3, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  newDot: { width: 9, height: 9, borderRadius: 5 },
  empty: { alignItems: "center", paddingTop: spacing["3xl"] },
});
