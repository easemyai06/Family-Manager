import React, { useState } from "react";
import { View, StyleSheet, Pressable, Alert, Linking, ActivityIndicator, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { TextField } from "@/src/components/ui/TextField";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { uploadMedia } from "@/src/lib/api";

type Patch = { photo_url?: string | null; phone?: string; address?: string; id_card_url?: string | null };

type Props = {
  name?: string;
  photoUrl?: string | null;
  phone: string;
  address: string;
  idCardUrl?: string | null;
  color?: string;
  onChange: (patch: Patch) => void;
};

async function ensurePermission(kind: "camera" | "library"): Promise<boolean> {
  const get = kind === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
  const req = kind === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
  const perm = await get();
  let status = perm.status;
  if (status !== "granted" && perm.canAskAgain) status = (await req()).status;
  if (status !== "granted") {
    Alert.alert(
      kind === "camera" ? "Camera access needed" : "Photo access needed",
      kind === "camera" ? "Allow camera access to take a photo." : "Allow photo access to choose an image.",
      [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
    );
    return false;
  }
  return true;
}

export function HelperProfileFields({ name, photoUrl, phone, address, idCardUrl, color, onChange }: Props) {
  const { c } = useTheme();
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [busyId, setBusyId] = useState(false);

  const doPick = async (source: "camera" | "library", target: "photo" | "id") => {
    const ok = await ensurePermission(source === "camera" ? "camera" : "library");
    if (!ok) return;
    const res = source === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (res.canceled || !res.assets?.length) return;
    const setBusy = target === "photo" ? setBusyPhoto : setBusyId;
    setBusy(true);
    try {
      const up = await uploadMedia(res.assets[0].uri, "image");
      onChange(target === "photo" ? { photo_url: up.url } : { id_card_url: up.url });
    } catch {
      Alert.alert("Upload failed", "Please try again.");
    }
    setBusy(false);
  };

  const choose = (target: "photo" | "id") => {
    const label = target === "photo" ? "profile photo" : "ID card";
    if (Platform.OS === "web") {
      doPick("library", target);
      return;
    }
    Alert.alert(`Add ${label}`, undefined, [
      { text: "Take a photo", onPress: () => doPick("camera", target) },
      { text: "Choose from library", onPress: () => doPick("library", target) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View>
      {/* Photo */}
      <View style={styles.photoRow}>
        <Pressable onPress={() => choose("photo")} testID="helper-photo-pick" style={styles.photoWrap}>
          {photoUrl ? (
            <SmartImage uri={photoUrl} style={styles.avatarImg} />
          ) : (
            <Avatar name={name || "?"} uri={null} size={72} color={color} />
          )}
          <View style={[styles.photoBadge, { backgroundColor: c.brandPrimary }]}>
            {busyPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={15} color="#fff" />}
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size={14} weight="bold">Profile photo</AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>Tap the avatar to {photoUrl ? "change" : "add"} a photo</AppText>
          {photoUrl ? (
            <Pressable onPress={() => onChange({ photo_url: null })} hitSlop={8} testID="helper-photo-remove" style={{ marginTop: 4 }}>
              <AppText size={12} weight="bold" color={c.error}>Remove photo</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <TextField
        label="Phone number"
        icon="call-outline"
        value={phone}
        onChangeText={(t) => onChange({ phone: t })}
        placeholder="e.g. +91 98765 43210"
        keyboardType="phone-pad"
        testID="helper-phone"
      />
      <TextField
        label="Address"
        icon="location-outline"
        value={address}
        onChangeText={(t) => onChange({ address: t })}
        placeholder="Home address"
        multiline
        testID="helper-address"
      />

      {/* ID card */}
      <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.idLabel}>
        ID CARD COPY (PRIVATE)
      </AppText>
      {idCardUrl ? (
        <View style={[styles.idCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <SmartImage uri={idCardUrl} style={styles.idImg} contentFit="cover" />
          <View style={styles.idActions}>
            <Pressable onPress={() => choose("id")} style={[styles.idBtn, { backgroundColor: c.brandTertiary }]} testID="helper-idcard-replace">
              <Ionicons name="sync-outline" size={14} color={c.onBrandTertiary} />
              <AppText size={12} weight="bold" color={c.onBrandTertiary}>Replace</AppText>
            </Pressable>
            <Pressable onPress={() => onChange({ id_card_url: null })} style={[styles.idBtn, { backgroundColor: c.error + "1A" }]} testID="helper-idcard-remove">
              <Ionicons name="trash-outline" size={14} color={c.error} />
              <AppText size={12} weight="bold" color={c.error}>Remove</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => choose("id")} style={[styles.idUpload, { borderColor: c.border, backgroundColor: c.surface }]} testID="helper-idcard-pick">
          {busyId ? <ActivityIndicator color={c.brandPrimary} /> : <Ionicons name="card-outline" size={22} color={c.brandPrimary} />}
          <AppText size={13} weight="semibold" color={c.onSurfaceSecondary}>
            {busyId ? "Uploading…" : "Upload ID card copy"}
          </AppText>
          <AppText size={11} color={c.onSurfaceTertiary}>Only the family can see this</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  photoWrap: { width: 72, height: 72 },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  photoBadge: { position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  idLabel: { letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  idUpload: { borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: spacing.xl, alignItems: "center", gap: 4 },
  idCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
  idImg: { width: "100%", height: 160, borderRadius: radius.sm },
  idActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  idBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
});
