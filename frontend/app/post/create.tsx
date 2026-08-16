import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { POST_CATEGORIES } from "@/src/lib/constants";

export default function CreatePost() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ story?: string }>();
  const isStory = params.story === "1";

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [error, setError] = useState("");

  const pickImage = async () => {
    setPermDenied(false);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      setPermDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) {
      setLocalUri(result.assets[0].uri);
    }
  };

  const submit = async () => {
    setError("");
    if (isStory && !localUri) {
      setError("Please add a photo for your story");
      return;
    }
    if (!isStory && !localUri && !caption.trim()) {
      setError("Add a photo or write something");
      return;
    }
    setSubmitting(true);
    try {
      let uploaded: { url: string } | null = null;
      if (localUri) uploaded = await uploadMedia(localUri, "image");
      if (isStory) {
        await api("/stories", { method: "POST", body: { media_url: uploaded!.url, type: "image", caption: caption || null } });
      } else {
        await api("/posts", {
          method: "POST",
          body: {
            caption: caption.trim(),
            media: uploaded ? [{ url: uploaded.url, type: "image" }] : [],
            location: location.trim() || null,
            category,
          },
        });
      }
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to share");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-post">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          {isStory ? "Add to Story" : "New Post"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={pickImage} style={[styles.imagePicker, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="pick-image-btn">
          {localUri ? (
            <SmartImage uri={localUri} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.pickerInner}>
              <Ionicons name="image-outline" size={40} color={c.onSurfaceTertiary} />
              <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: 8 }}>
                Tap to add a photo
              </AppText>
            </View>
          )}
        </Pressable>

        {permDenied ? (
          <View style={styles.permBox}>
            <AppText size={13} color={c.error}>
              Photo access is needed to add a picture.
            </AppText>
            <Pressable onPress={() => Linking.openSettings()} testID="open-settings-btn">
              <AppText size={13} weight="bold" color={c.brand} style={{ marginTop: 4 }}>
                Open Settings
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          <TextField
            placeholder={isStory ? "Say something… (optional)" : "Share a family moment…"}
            value={caption}
            onChangeText={setCaption}
            multiline
            style={{ height: 90, textAlignVertical: "top", paddingTop: 8 }}
            testID="caption-input"
          />
        </View>

        {!isStory ? (
          <>
            <View style={{ marginTop: spacing.lg }}>
              <TextField icon="location-outline" placeholder="Add location" value={location} onChangeText={setLocation} testID="location-input" />
            </View>

            <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Category
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {POST_CATEGORIES.map((cat) => {
                const sel = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(sel ? null : cat)}
                    style={[styles.catChip, { backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary, borderColor: sel ? c.brand : "transparent" }]}
                    testID={`cat-${cat}`}
                  >
                    <AppText size={13} weight="semibold" color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>
                      {cat}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="post-error">
            {error}
          </AppText>
        ) : null}

        <Button label={isStory ? "Share to Story" : "Share Post"} onPress={submit} loading={submitting} style={{ marginTop: spacing.xl }} testID="submit-post-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  imagePicker: { height: 260, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: "dashed", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  pickerInner: { alignItems: "center" },
  permBox: { marginTop: spacing.md },
  catChip: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, borderWidth: 1.5, flexShrink: 0 },
});
