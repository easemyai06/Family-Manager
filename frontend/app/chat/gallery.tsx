import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, Linking, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api, mediaUrl } from "@/src/lib/api";
import { fileIcon, formatFileSize } from "@/src/lib/fileMeta";
import { timeAgo, formatDMY } from "@/src/lib/time";

export default function ChatGallery() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<"photos" | "files">("photos");
  const [photos, setPhotos] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2800);
  };

  const gap = spacing.xs;
  const cols = 3;
  const cell = Math.floor((width - spacing.lg * 2 - gap * (cols - 1)) / cols);

  const load = useCallback(async () => {
    try {
      const d = await api(`/chats/${id}/media`);
      setPhotos(d.photos || []);
      setFiles(d.files || []);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openFile = (url?: string) => {
    const u = mediaUrl(url);
    if (u) Linking.openURL(u);
  };

  const savePhoto = async (url: string | null) => {
    if (!url) return;
    if (Platform.OS === "web") {
      flash("Saving to your gallery works in the mobile app");
      return;
    }
    const full = mediaUrl(url);
    if (!full) return;
    let perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      flash("Allow photo access in Settings to save");
      if (!perm.canAskAgain) Linking.openSettings();
      return;
    }
    setSaving(true);
    try {
      const dest = `${FileSystem.cacheDirectory}familyhome_${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(full, dest);
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      flash("Saved to your photos 📸");
    } catch {
      flash("Couldn't save this photo");
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="gallery-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19} style={{ flex: 1 }}>
          Shared in this chat
        </AppText>
      </View>

      <View style={[styles.tabs, { backgroundColor: c.surfaceSecondary }]}>
        {(["photos", "files"] as const).map((t) => {
          const sel = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, { backgroundColor: sel ? c.surface : "transparent", borderColor: sel ? c.border : "transparent" }, sel && shadow(1)]}
              testID={`gallery-tab-${t}`}
            >
              <Ionicons name={t === "photos" ? "image" : "document-text"} size={16} color={sel ? c.brand : c.onSurfaceTertiary} />
              <AppText size={14} weight="bold" color={sel ? c.onSurface : c.onSurfaceTertiary}>
                {t === "photos" ? `Photos ${photos.length ? `(${photos.length})` : ""}` : `Files ${files.length ? `(${files.length})` : ""}`}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {tab === "photos" ? (
          photos.length === 0 ? (
            <Empty icon="images-outline" text="No photos shared yet" c={c} />
          ) : (
            <View style={[styles.grid, { gap }]}>
              {photos.map((p) => (
                <Pressable key={p.message_id} onPress={() => setLightbox(p.url)} testID={`gallery-photo-${p.message_id}`}>
                  <SmartImage uri={p.url} style={{ width: cell, height: cell, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary }} />
                </Pressable>
              ))}
            </View>
          )
        ) : files.length === 0 ? (
          <Empty icon="document-outline" text="No files shared yet" c={c} />
        ) : (
          files.map((f) => {
            const fi = fileIcon(f.file_name, f.file_mime);
            return (
              <Pressable
                key={f.message_id}
                onPress={() => openFile(f.url)}
                style={[styles.fileRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                testID={`gallery-file-${f.message_id}`}
              >
                <View style={[styles.fileIcon, { backgroundColor: fi.color + "22" }]}>
                  <Ionicons name={fi.icon as any} size={22} color={fi.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="semibold" numberOfLines={1}>
                    {f.file_name || "Document"}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {[formatFileSize(f.file_size), f.sender?.name, formatDMY(f.created_at)].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
                <Ionicons name="download-outline" size={20} color={c.onSurfaceTertiary} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(null)} testID="gallery-lightbox">
          {lightbox ? <SmartImage uri={lightbox} style={styles.lightboxImg} contentFit="contain" /> : null}
          <Pressable onPress={() => setLightbox(null)} style={[styles.lbClose, { top: insets.top + spacing.md }]} testID="gallery-lightbox-close">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {lightbox ? (
            <View style={[styles.lbActions, { bottom: insets.bottom + spacing.xl }]}>
              <Pressable onPress={() => savePhoto(lightbox)} disabled={saving} style={styles.lbBtn} testID="gallery-lightbox-save">
                <Ionicons name={saving ? "hourglass-outline" : "download-outline"} size={18} color="#fff" />
                <AppText size={14} weight="bold" color="#fff">
                  {saving ? "Saving…" : "Save"}
                </AppText>
              </Pressable>
              <Pressable onPress={() => openFile(lightbox)} style={styles.lbBtn} testID="gallery-lightbox-open">
                <Ionicons name="open-outline" size={18} color="#fff" />
                <AppText size={14} weight="bold" color="#fff">
                  Open
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      {note ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="gallery-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Empty({ icon, text, c }: { icon: string; text: string; c: any }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon as any} size={44} color={c.onSurfaceTertiary} />
      <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, paddingVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  fileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  lightboxImg: { width: "100%", height: "80%" },
  lbClose: { position: "absolute", right: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  lbActions: { position: "absolute", alignSelf: "center", flexDirection: "row", gap: spacing.md },
  lbBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
