import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";

const PRESETS = [
  { label: "1 month", days: 30 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "5 years", days: 1826 },
];

export default function CreateCapsule() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [unlock, setUnlock] = useState(dayjs().add(30, "day"));
  const [media, setMedia] = useState<{ url: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tomorrow = dayjs().add(1, "day").startOf("day");
  const setDate = (d: dayjs.Dayjs) => setUnlock(d.isBefore(tomorrow) ? tomorrow : d);

  const addPhotos = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      setError("Photo access is needed to attach pictures. Enable it in Settings.");
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const up: { url: string; type: string }[] = [];
      for (const a of result.assets) {
        const r = await uploadMedia(a.uri, "image");
        up.push({ url: r.url, type: "image" });
      }
      setMedia((prev) => [...prev, ...up]);
    } catch {
      setError("Couldn't upload a photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError("");
    if (!message.trim()) {
      setError("Write a message for your capsule");
      return;
    }
    setSaving(true);
    try {
      await api("/capsules", {
        method: "POST",
        body: { message: message.trim(), media, unlock_date: unlock.format("YYYY-MM-DD") },
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to seal the capsule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-capsule">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          New Time Capsule
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={[styles.hint, { backgroundColor: c.brandTertiary }]}>
          <Ionicons name="lock-closed" size={18} color={c.brand} />
          <AppText size={13} color={c.brand} style={{ flex: 1 }}>
            Your message stays sealed from the whole family until the unlock date.
          </AppText>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Message to the future"
            icon="mail-outline"
            placeholder="Dear family, by the time you read this…"
            value={message}
            onChangeText={setMessage}
            multiline
            style={{ height: 130, textAlignVertical: "top", paddingTop: 4 }}
            testID="capsule-message-input"
          />
        </View>

        {/* photos */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Photos (optional)
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {media.map((m, i) => (
            <View key={i} style={styles.thumbWrap}>
              <SmartImage uri={m.url} style={styles.thumb} />
              <Pressable onPress={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))} style={[styles.thumbX, { backgroundColor: c.surfaceInverse }]} testID={`capsule-remove-photo-${i}`}>
                <Ionicons name="close" size={14} color={c.onSurfaceInverse} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addPhotos} style={[styles.addPhoto, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="capsule-add-photo">
            <Ionicons name={uploading ? "cloud-upload-outline" : "camera-outline"} size={24} color={c.brand} />
            <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
              {uploading ? "…" : "Add"}
            </AppText>
          </Pressable>
        </ScrollView>

        {/* unlock date */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Open on
        </AppText>
        <View style={styles.presetRow}>
          {PRESETS.map((p) => {
            const target = dayjs().add(p.days, "day");
            const sel = unlock.format("YYYY-MM-DD") === target.format("YYYY-MM-DD");
            return (
              <Pressable key={p.label} onPress={() => setDate(target)} style={[styles.preset, { backgroundColor: sel ? c.brand : c.surfaceSecondary, borderColor: sel ? c.brand : c.border }]} testID={`capsule-preset-${p.days}`}>
                <AppText size={12} weight="semibold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {p.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.dateRow, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Pressable onPress={() => setDate(unlock.subtract(1, "year"))} hitSlop={8} testID="capsule-year-prev">
            <AppText size={13} weight="bold" color={c.brand}>−1yr</AppText>
          </Pressable>
          <Pressable onPress={() => setDate(unlock.subtract(1, "month"))} hitSlop={8} testID="capsule-month-prev">
            <Ionicons name="chevron-back" size={22} color={c.onSurface} />
          </Pressable>
          <AppText family="display" weight="bold" size={15}>
            {unlock.format("D MMM YYYY")}
          </AppText>
          <Pressable onPress={() => setDate(unlock.add(1, "month"))} hitSlop={8} testID="capsule-month-next">
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
          <Pressable onPress={() => setDate(unlock.add(1, "year"))} hitSlop={8} testID="capsule-year-next">
            <AppText size={13} weight="bold" color={c.brand}>+1yr</AppText>
          </Pressable>
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="capsule-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Seal the Capsule 🔒" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-capsule-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  hint: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  thumbWrap: { position: "relative" },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: "#EAE4D9" },
  thumbX: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addPhoto: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  preset: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, height: 54 },
});
