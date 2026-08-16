import React, { useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";

type Row = { name: string; quantity: string };

export default function CreateRecipe() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prep, setPrep] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ name: "", quantity: "" }, { name: "", quantity: "" }, { name: "", quantity: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setRow = (i: number, key: keyof Row, val: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const addRow = () => setRows((prev) => [...prev, { name: "", quantity: "" }]);
  const removeRow = (i: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const pickPhoto = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const up = await uploadMedia(result.assets[0].uri, "image");
      setPhoto(up.url);
    } catch {} finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Give your recipe a name");
      return;
    }
    const ingredients = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), quantity: r.quantity.trim() || null }));
    setSaving(true);
    try {
      const r = await api("/recipes", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim() || null,
          photo_url: photo,
          prep_minutes: prep.trim() ? parseInt(prep, 10) || null : null,
          ingredients,
        },
      });
      router.replace(`/recipes/${r.recipe_id}`);
    } catch (e: any) {
      setError(e.message || "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-recipe">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          New Recipe
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickPhoto} style={[styles.photoPick, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="recipe-photo-pick">
          {photo ? (
            <SmartImage uri={photo} style={StyleSheet.absoluteFillObject as any} />
          ) : (
            <>
              <Ionicons name={uploading ? "hourglass-outline" : "camera-outline"} size={26} color={c.onSurfaceTertiary} />
              <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: 4 }}>
                {uploading ? "Uploading…" : "Add a photo (optional)"}
              </AppText>
            </>
          )}
        </Pressable>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Recipe name" icon="restaurant-outline" placeholder="e.g. Rajma Chawal" value={title} onChangeText={setTitle} testID="recipe-title-input" />
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Description (optional)"
            icon="text-outline"
            placeholder="A short note about this dish"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 76, textAlignVertical: "top", paddingTop: 4 }}
            testID="recipe-desc-input"
          />
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Prep time in minutes (optional)" icon="time-outline" placeholder="e.g. 30" value={prep} onChangeText={setPrep} keyboardType="number-pad" testID="recipe-prep-input" />
        </View>

        <AppText family="display" weight="bold" size={16} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Ingredients 🧺
        </AppText>
        {rows.map((r, i) => (
          <View key={i} style={styles.ingRow}>
            <View style={{ flex: 2 }}>
              <TextField placeholder="Ingredient" value={r.name} onChangeText={(v) => setRow(i, "name", v)} testID={`ing-name-${i}`} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField placeholder="Qty" value={r.quantity} onChangeText={(v) => setRow(i, "quantity", v)} testID={`ing-qty-${i}`} />
            </View>
            <Pressable onPress={() => removeRow(i)} hitSlop={8} style={styles.removeIng} testID={`ing-remove-${i}`}>
              <Ionicons name="remove-circle-outline" size={22} color={c.onSurfaceTertiary} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={addRow} style={[styles.addIng, { borderColor: c.border }]} testID="add-ingredient">
          <Ionicons name="add" size={18} color={c.brand} />
          <AppText size={14} weight="semibold" color={c.brand}>
            Add ingredient
          </AppText>
        </Pressable>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="recipe-error">
            {error}
          </AppText>
        ) : null}
        <Button label="Save Recipe" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-recipe-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  photoPick: { height: 140, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  removeIng: { paddingBottom: 2 },
  addIng: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", paddingVertical: spacing.md, marginTop: spacing.xs },
});
