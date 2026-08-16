import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Albums() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [albums, setAlbums] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setAlbums(await api("/albums"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cardW = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="albums-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>
            Family Albums 📚
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            Shared photo collections
          </AppText>
        </View>
      </View>

      <FlatList
        data={albums}
        keyExtractor={(a) => a.album_id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={44}>📚</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No albums yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Create an album for a trip or event
            </AppText>
          </View>
        }
        renderItem={({ item: a }) => (
          <Pressable
            onPress={() => router.push(`/albums/${a.album_id}`)}
            style={[styles.card, { width: cardW, backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`album-${a.album_id}`}
          >
            {a.cover ? (
              <SmartImage uri={a.cover} style={{ width: "100%", height: cardW * 0.85, backgroundColor: "#EAE4D9" }} />
            ) : (
              <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: cardW * 0.85, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="images" size={34} color="#fff" />
              </LinearGradient>
            )}
            <View style={{ padding: spacing.md }}>
              <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                {a.title}
              </AppText>
              <View style={styles.metaRow}>
                <Avatar uri={a.creator?.photo_url} name={a.creator?.name} size={18} color={a.creator?.color} />
                <AppText size={11} color={c.onSurfaceTertiary}>
                  {a.photo_count} {a.photo_count === 1 ? "photo" : "photos"}
                </AppText>
              </View>
            </View>
          </Pressable>
        )}
      />

      <Pressable onPress={() => router.push("/albums/create")} style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]} testID="fab-add-album">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
