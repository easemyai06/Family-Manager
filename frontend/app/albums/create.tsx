import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function CreateAlbum() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Give your album a title");
      return;
    }
    setSaving(true);
    try {
      const a = await api("/albums", { method: "POST", body: { title: title.trim(), description: description.trim() || null } });
      router.replace(`/albums/${a.album_id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create album");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-album">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          New Album
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <TextField label="Album Title" icon="images-outline" placeholder="e.g. Goa Trip 2026" value={title} onChangeText={setTitle} testID="album-title-input" />
        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Description (optional)"
            icon="text-outline"
            placeholder="What's this album about?"
            value={description}
            onChangeText={setDescription}
            multiline
            style={{ height: 90, textAlignVertical: "top", paddingTop: 4 }}
            testID="album-desc-input"
          />
        </View>
        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="album-error">
            {error}
          </AppText>
        ) : null}
        <Button label="Create Album" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-album-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
