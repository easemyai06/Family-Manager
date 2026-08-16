import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Switch, Linking, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { TIMELINE_CATEGORIES } from "@/src/lib/constants";

export default function CreateMemory() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ member?: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState(dayjs().format("YYYY-MM-DD"));
  const [category, setCategory] = useState(TIMELINE_CATEGORIES[TIMELINE_CATEGORIES.length - 1]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [people, setPeople] = useState<string[]>(params.member ? [params.member] : []);
  const [importance, setImportance] = useState(false);
  const [media, setMedia] = useState<{ url: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/families/members").then((d: any) => setMembers(d)).catch(() => {});
  }, []);

  const togglePerson = (id: string) => {
    setPeople((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const addPhotos = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      setError("Photo access is needed to add memory pictures. Enable it in Settings.");
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const uploaded: { url: string; type: string }[] = [];
      for (const a of result.assets) {
        const up = await uploadMedia(a.uri, "image");
        uploaded.push({ url: up.url, type: "image" });
      }
      setMedia((prev) => [...prev, ...uploaded]);
    } catch {
      setError("Couldn't upload one of the photos. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Please give this memory a title");
      return;
    }
    setSaving(true);
    try {
      await api("/timeline", {
        method: "POST",
        body: {
          title: title.trim(),
          date: dateStr,
          category,
          location: location.trim() || null,
          description: description.trim() || null,
          people,
          media,
          importance,
        },
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-memory">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          Add a Memory
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {/* photos */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
          Photos
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {media.map((m, i) => (
            <View key={i} style={styles.thumbWrap}>
              <SmartImage uri={m.url} style={styles.thumb} />
              <Pressable onPress={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))} style={[styles.thumbX, { backgroundColor: c.surfaceInverse }]} testID={`remove-photo-${i}`}>
                <Ionicons name="close" size={14} color={c.onSurfaceInverse} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addPhotos} style={[styles.addPhoto, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="add-memory-photo">
            <Ionicons name={uploading ? "cloud-upload-outline" : "camera-outline"} size={26} color={c.brand} />
            <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
              {uploading ? "Uploading…" : "Add"}
            </AppText>
          </Pressable>
        </ScrollView>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Title" icon="sparkles-outline" placeholder="e.g. First Family Trip Abroad" value={title} onChangeText={setTitle} testID="memory-title-input" />
        </View>

        {/* date stepper */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: 6 }}>
          When did it happen?
        </AppText>
        <View style={[styles.dateRow, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Pressable onPress={() => setDateStr(dayjs(dateStr).subtract(1, "year").format("YYYY-MM-DD"))} hitSlop={8} testID="year-prev">
            <AppText size={13} weight="bold" color={c.brand}>
              −1yr
            </AppText>
          </Pressable>
          <Pressable onPress={() => setDateStr(dayjs(dateStr).subtract(1, "day").format("YYYY-MM-DD"))} hitSlop={8} testID="date-prev">
            <Ionicons name="chevron-back" size={22} color={c.onSurface} />
          </Pressable>
          <AppText family="display" weight="bold" size={15}>
            {dayjs(dateStr).format("D MMM YYYY")}
          </AppText>
          <Pressable onPress={() => setDateStr(dayjs(dateStr).add(1, "day").format("YYYY-MM-DD"))} hitSlop={8} testID="date-next">
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
          <Pressable onPress={() => setDateStr(dayjs(dateStr).add(1, "year").format("YYYY-MM-DD"))} hitSlop={8} testID="year-next">
            <AppText size={13} weight="bold" color={c.brand}>
              +1yr
            </AppText>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Location" icon="location-outline" placeholder="Where was it?" value={location} onChangeText={setLocation} testID="memory-location-input" />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Description"
            icon="book-outline"
            placeholder="Tell the story of this memory…"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 90, textAlignVertical: "top", paddingTop: 4 }}
            testID="memory-desc-input"
          />
        </View>

        {/* category */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Category
        </AppText>
        <View style={styles.catWrap}>
          {TIMELINE_CATEGORIES.map((cat) => {
            const sel = category === cat;
            return (
              <Pressable key={cat} onPress={() => setCategory(cat)} style={[styles.catChip, { backgroundColor: sel ? c.brand : c.surfaceSecondary, borderColor: sel ? c.brand : c.border }]} testID={`memory-cat-${cat}`}>
                <AppText size={12} weight="semibold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {cat}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* people */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Who was there?
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: 4 }}>
          {members.map((m) => {
            const sel = people.includes(m.member_id);
            return (
              <Pressable key={m.member_id} onPress={() => togglePerson(m.member_id)} style={{ alignItems: "center", gap: 4, opacity: sel ? 1 : 0.45 }} testID={`memory-person-${m.member_id}`}>
                <Avatar uri={m.photo_url} name={m.name} size={54} color={m.color} ring={sel} />
                <AppText size={12} weight={sel ? "bold" : "medium"} numberOfLines={1} style={{ maxWidth: 64 }}>
                  {m.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* importance */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText size={15} weight="semibold">
              Mark as important ⭐
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              Highlight this milestone in the family story
            </AppText>
          </View>
          <Switch value={importance} onValueChange={setImportance} trackColor={{ true: c.brand }} testID="memory-important-switch" />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="memory-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Save Memory" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-memory-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  thumbWrap: { position: "relative" },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: "#EAE4D9" },
  thumbX: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addPhoto: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, height: 54 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  catChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, gap: spacing.md },
});
