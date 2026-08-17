import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Modal, TextInput, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const EXPIRY_PRESETS = [
  { label: "No expiry", days: null as number | null },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

export default function Noticeboard() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [high, setHigh] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api("/notices"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const resetForm = () => {
    setTitle("");
    setNote("");
    setExpiryDays(null);
    setHigh(false);
    setPinned(false);
    setLocalPhoto(null);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) setLocalPhoto(result.assets[0].uri);
  };

  const create = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (localPhoto) photo_url = (await uploadMedia(localPhoto, "image")).url;
      await api("/notices", {
        method: "POST",
        body: {
          title: title.trim(),
          note: note.trim() || null,
          expiry_date: expiryDays ? dayjs().add(expiryDays, "day").format("YYYY-MM-DD") : null,
          priority: high ? "high" : "normal",
          pinned,
          photo_url,
        },
      });
      setOpen(false);
      resetForm();
      await load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: string) => {
    try {
      await api(`/notices/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  const togglePin = async (n: any) => {
    try {
      await api(`/notices/${n.notice_id}`, { method: "PATCH", body: { pinned: !n.pinned } });
      await load();
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="notice-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>Family Noticeboard 📌</AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>Notes & reminders for everyone</AppText>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.notice_id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={44}>📌</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              The board is empty
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Pin a note so the whole family sees it
            </AppText>
          </View>
        }
        renderItem={({ item: n }) => {
          const mine = member && n.owner?.member_id === member.member_id;
          return (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: n.priority === "high" ? c.error : c.border }, shadow(1)]} testID={`notice-${n.notice_id}`}>
              <Pressable onPress={() => router.push(`/notice/${n.notice_id}`)} testID={`notice-open-${n.notice_id}`}>
                <View style={styles.cardTop}>
                  {n.pinned ? <Ionicons name="pin" size={16} color={c.brand} /> : null}
                  <AppText family="display" weight="bold" size={16} style={{ flex: 1 }}>{n.title}</AppText>
                  {n.priority === "high" ? (
                    <View style={[styles.urgent, { backgroundColor: c.error }]}>
                      <AppText size={10} weight="bold" color="#fff">URGENT</AppText>
                    </View>
                  ) : null}
                </View>
                {n.note ? <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: 4 }}>{n.note}</AppText> : null}
                {n.photo_url ? <SmartImage uri={n.photo_url} style={styles.cardPhoto} /> : null}
                <View style={styles.byRow}>
                  <Avatar uri={n.owner?.photo_url} name={n.owner?.name} size={20} color={n.owner?.color} />
                  <AppText size={12} color={c.onSurfaceTertiary} style={{ flex: 1 }}>
                    {n.owner?.name}
                    {n.days_until_expiry != null ? ` · expires in ${n.days_until_expiry}d` : ""}
                  </AppText>
                </View>
              </Pressable>
              <View style={[styles.footer, { borderTopColor: c.divider }]}>
                <Pressable onPress={() => router.push(`/notice/${n.notice_id}`)} style={styles.metaRow} hitSlop={6}>
                  {(n.reaction_summary || []).slice(0, 3).map((r: any) => (
                    <AppText key={r.emoji} size={13}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ""}</AppText>
                  ))}
                  <View style={styles.replyMeta}>
                    <Ionicons name="chatbubble-outline" size={14} color={c.onSurfaceTertiary} />
                    <AppText size={12} color={c.onSurfaceTertiary}>{n.reply_count || 0}</AppText>
                  </View>
                  {n.seen_count ? (
                    <View style={styles.replyMeta}>
                      <Ionicons name="eye-outline" size={14} color={c.onSurfaceTertiary} />
                      <AppText size={12} color={c.onSurfaceTertiary}>{n.seen_count}</AppText>
                    </View>
                  ) : null}
                </Pressable>
                <View style={{ flex: 1 }} />
                {mine ? (
                  <>
                    <Pressable onPress={() => togglePin(n)} hitSlop={8} style={{ padding: 4 }} testID={`notice-pin-${n.notice_id}`}>
                      <Ionicons name={n.pinned ? "pin" : "pin-outline"} size={18} color={c.brand} />
                    </Pressable>
                    <Pressable onPress={() => remove(n.notice_id)} hitSlop={8} style={{ padding: 4 }} testID={`notice-del-${n.notice_id}`}>
                      <Ionicons name="trash-outline" size={18} color={c.error} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Pressable onPress={() => setOpen(true)} style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]} testID="fab-add-notice">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>New note</AppText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title (e.g. School closed Friday)"
              placeholderTextColor={c.onSurfaceTertiary}
              style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
              testID="notice-title"
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Details (optional)"
              placeholderTextColor={c.onSurfaceTertiary}
              multiline
              style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border, height: 90, textAlignVertical: "top" }]}
              testID="notice-note"
            />
            {localPhoto ? (
              <View style={styles.photoWrap}>
                <SmartImage uri={localPhoto} style={styles.photoPreview} />
                <Pressable onPress={() => setLocalPhoto(null)} style={styles.photoRemove} testID="notice-photo-remove">
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={[styles.photoBtn, { borderColor: c.border, backgroundColor: c.surfaceSecondary }]} testID="notice-photo">
                <Ionicons name="image-outline" size={20} color={c.brand} />
                <AppText size={13} weight="semibold" color={c.onSurfaceSecondary}>Attach a photo (flyer, permission slip…)</AppText>
              </Pressable>
            )}
            <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>Expires</AppText>
            <View style={styles.chipRow}>
              {EXPIRY_PRESETS.map((p) => {
                const active = expiryDays === p.days;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => setExpiryDays(p.days)}
                    style={[styles.chip, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}
                    testID={`notice-expiry-${p.days ?? "none"}`}
                  >
                    <AppText size={12} weight="bold" color={active ? "#fff" : c.onSurfaceSecondary}>{p.label}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setHigh(!high)} style={styles.toggleRow} testID="notice-high">
              <Ionicons name={high ? "checkbox" : "square-outline"} size={22} color={high ? c.error : c.onSurfaceTertiary} />
              <AppText size={14} weight="semibold" style={{ flex: 1 }}>Mark as urgent</AppText>
            </Pressable>
            <Pressable onPress={() => setPinned(!pinned)} style={styles.toggleRow} testID="notice-pin-toggle">
              <Ionicons name={pinned ? "checkbox" : "square-outline"} size={22} color={pinned ? c.brand : c.onSurfaceTertiary} />
              <AppText size={14} weight="semibold" style={{ flex: 1 }}>Pin to top</AppText>
            </Pressable>
          </ScrollView>
          <Pressable
            onPress={create}
            disabled={!title.trim() || saving}
            style={[styles.saveBtn, { backgroundColor: title.trim() ? c.brand : c.surfaceTertiary }]}
            testID="notice-save"
          >
            <AppText size={15} weight="bold" color="#fff">{saving ? "Posting…" : "Post to board"}</AppText>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  urgent: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  byRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  replyMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D6CEBE", marginBottom: spacing.md },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14, marginBottom: spacing.sm },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", paddingVertical: 14, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  photoWrap: { marginTop: spacing.sm },
  photoPreview: { width: "100%", height: 160, borderRadius: radius.md },
  photoRemove: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 13 },
  cardPhoto: { width: "100%", height: 150, borderRadius: radius.md, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  saveBtn: { marginTop: spacing.md, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
});
