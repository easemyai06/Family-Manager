import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function AlbumDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [album, setAlbum] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setAlbum(await api(`/albums/${id}`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isCreator = album && me?.member_id === album.created_by;
  const gap = 3;
  const size = (width - spacing.lg * 2 - gap * 2) / 3;

  const addPhotos = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const media: { url: string; type: string }[] = [];
      for (const a of result.assets) {
        const up = await uploadMedia(a.uri, "image");
        media.push({ url: up.url, type: "image" });
      }
      setAlbum(await api(`/albums/${id}/photos`, { method: "POST", body: { media } }));
    } catch {}
    finally {
      setUploading(false);
    }
  };

  const removeAlbum = () => {
    Alert.alert("Delete album?", "This album and its photos will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/albums/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  if (!album) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const photos = album.photos || [];

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="album-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={19} numberOfLines={1}>
            {album.title}
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            {photos.length} {photos.length === 1 ? "photo" : "photos"} · by {album.creator?.name}
          </AppText>
        </View>
        {isCreator ? (
          <Pressable onPress={removeAlbum} hitSlop={10} testID="album-delete">
            <Ionicons name="trash-outline" size={20} color={c.onSurfaceSecondary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        {album.description ? (
          <AppText size={14} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.lg }}>
            {album.description}
          </AppText>
        ) : null}

        {isCreator ? (
          <Pressable onPress={addPhotos} style={[styles.addBtn, { backgroundColor: c.brandTertiary }]} testID="album-add-photos">
            <Ionicons name={uploading ? "cloud-upload-outline" : "add-circle-outline"} size={20} color={c.brand} />
            <AppText size={14} weight="bold" color={c.brand}>
              {uploading ? "Uploading…" : "Add Photos"}
            </AppText>
          </Pressable>
        ) : null}

        {photos.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🖼️</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
              {isCreator ? "Add the first photos to this album" : "No photos in this album yet"}
            </AppText>
          </View>
        ) : (
          <View style={styles.grid}>
            {photos.map((p: any, i: number) => (
              <View key={p.photo_id || i} style={{ marginRight: (i + 1) % 3 === 0 ? 0 : gap, marginBottom: gap }}>
                <SmartImage uri={p.url} style={{ width: size, height: size, borderRadius: 4, backgroundColor: "#EAE4D9" }} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
