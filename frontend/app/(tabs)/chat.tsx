import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { timeAgo } from "@/src/lib/time";

export default function ChatList() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const tick = async () => {
        try {
          const d = await api("/chats");
          if (active) setChats(d);
        } catch {}
      };
      tick();
      const iv = setInterval(tick, 4000);
      return () => {
        active = false;
        clearInterval(iv);
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setChats(await api("/chats"));
    } catch {}
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isGroup = item.type !== "direct";
    const lm = item.last_message;
    return (
      <Pressable
        onPress={() => router.push(`/chat/${item.chat_id}?name=${encodeURIComponent(item.display_name)}`)}
        style={styles.row}
        testID={`chat-${item.chat_id}`}
      >
        {isGroup ? (
          <View style={[styles.groupAvatar, { backgroundColor: item.color }]}>
            <Ionicons name={item.type === "family" ? "heart" : "people"} size={24} color="#fff" />
          </View>
        ) : (
          <Avatar uri={item.avatar} name={item.display_name} size={54} color={item.color} ring />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <AppText family="display" weight="bold" size={16} numberOfLines={1} style={{ flex: 1 }}>
              {item.display_name}
            </AppText>
            {lm ? (
              <AppText size={11} color={c.onSurfaceTertiary}>
                {timeAgo(lm.created_at)}
              </AppText>
            ) : null}
          </View>
          <View style={styles.rowBottom}>
            <AppText size={13} color={item.unread ? c.onSurface : c.onSurfaceTertiary} weight={item.unread ? "semibold" : "regular"} numberOfLines={1} style={{ flex: 1 }}>
              {lm ? (isGroup && lm.sender ? `${lm.sender}: ` : "") + (lm.text || "Media") : "No messages yet — say hi 👋"}
            </AppText>
            {item.unread ? (
              <View style={[styles.badge, { backgroundColor: c.brand }]}>
                <AppText size={11} weight="bold" color="#fff">
                  {item.unread}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText family="display" weight="bold" size={26}>
          Messages
        </AppText>
        <Pressable onPress={() => router.push("/chat/new")} style={[styles.newBtn, { backgroundColor: c.brandTertiary }]} testID="new-chat-btn">
          <Ionicons name="create-outline" size={22} color={c.brand} />
        </Pressable>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(c) => c.chat_id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: c.divider }]} />}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={40}>💬</AppText>
            <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
              No conversations yet
            </AppText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  newBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  groupAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", ...shadow(1) },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 3 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  sep: { height: 1, marginLeft: 84 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
