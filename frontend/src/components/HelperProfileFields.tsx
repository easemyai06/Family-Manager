import React, { useState } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { TextField } from "@/src/components/ui/TextField";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { uploadMedia } from "@/src/lib/api";
import { choosePhoto } from "@/src/lib/pickImage";

type Patch = { photo_url?: string | null; phone?: string; address?: string; id_card_url?: string | null; id_card_back_url?: string | null };

type Props = {
  name?: string;
  photoUrl?: string | null;
  phone: string;
  address: string;
  idCardUrl?: string | null;
  idCardBackUrl?: string | null;
  color?: string;
  onChange: (patch: Patch) => void;
};

export function HelperProfileFields({ name, photoUrl, phone, address, idCardUrl, idCardBackUrl, color, onChange }: Props) {
  const { c } = useTheme();
  const [busy, setBusy] = useState<null | "photo" | "front" | "back">(null);

  const upload = async (target: "photo" | "front" | "back", uri: string) => {
    setBusy(target);
    try {
      const up = await uploadMedia(uri, "image");
      onChange(
        target === "photo" ? { photo_url: up.url } : target === "front" ? { id_card_url: up.url } : { id_card_back_url: up.url }
      );
    } catch {
      Alert.alert("Upload failed", "Please try again.");
    }
    setBusy(null);
  };

  const pick = (target: "photo" | "front" | "back") => {
    const label = target === "photo" ? "profile photo" : target === "front" ? "ID front" : "ID back";
    choosePhoto(label, (uri) => upload(target, uri), target === "photo" ? { allowsEditing: true, aspect: [1, 1] } : undefined);
  };

  const renderIdSlot = (target: "front" | "back", label: string, url?: string | null) => (
    <View style={styles.idSlot}>
      <AppText size={11} weight="bold" color={c.onSurfaceTertiary} style={{ marginBottom: 4, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </AppText>
      {url ? (
        <View style={[styles.idCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <SmartImage uri={url} style={styles.idImg} contentFit="cover" />
          <View style={styles.idActions}>
            <Pressable onPress={() => pick(target)} style={[styles.idBtn, { backgroundColor: c.brandTertiary }]} testID={`helper-id${target}-replace`}>
              <Ionicons name="sync-outline" size={13} color={c.onBrandTertiary} />
              <AppText size={11} weight="bold" color={c.onBrandTertiary}>Replace</AppText>
            </Pressable>
            <Pressable
              onPress={() => onChange(target === "front" ? { id_card_url: null } : { id_card_back_url: null })}
              style={[styles.idBtn, { backgroundColor: c.error + "1A" }]}
              testID={`helper-id${target}-remove`}
            >
              <Ionicons name="trash-outline" size={13} color={c.error} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => pick(target)} style={[styles.idUpload, { borderColor: c.border, backgroundColor: c.surface }]} testID={`helper-id${target}-pick`}>
          {busy === target ? <ActivityIndicator color={c.brandPrimary} /> : <Ionicons name="card-outline" size={20} color={c.brandPrimary} />}
          <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>
            {busy === target ? "Uploading…" : `Add ${label.toLowerCase()}`}
          </AppText>
        </Pressable>
      )}
    </View>
  );

  return (
    <View>
      {/* Photo */}
      <View style={styles.photoRow}>
        <Pressable onPress={() => pick("photo")} testID="helper-photo-pick" style={styles.photoWrap}>
          {photoUrl ? (
            <SmartImage uri={photoUrl} style={styles.avatarImg} />
          ) : (
            <Avatar name={name || "?"} uri={null} size={72} color={color} />
          )}
          <View style={[styles.photoBadge, { backgroundColor: c.brandPrimary }]}>
            {busy === "photo" ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={15} color="#fff" />}
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size={14} weight="bold">Profile photo</AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>Tap the avatar to {photoUrl ? "change" : "take or choose"} a photo</AppText>
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

      {/* ID card — front & back */}
      <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.idLabel}>
        ID CARD COPY (PRIVATE)
      </AppText>
      <AppText size={11} color={c.onSurfaceTertiary} style={{ marginBottom: spacing.sm }}>
        Add the front and back. Only the family can see these.
      </AppText>
      <View style={styles.idRow}>
        {renderIdSlot("front", "Front", idCardUrl)}
        {renderIdSlot("back", "Back", idCardBackUrl)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  photoWrap: { width: 72, height: 72 },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  photoBadge: { position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  idLabel: { letterSpacing: 1, marginTop: spacing.lg, marginBottom: 4 },
  idRow: { flexDirection: "row", gap: spacing.md },
  idSlot: { flex: 1 },
  idUpload: { borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", paddingVertical: spacing.xl, alignItems: "center", gap: 6 },
  idCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.xs },
  idImg: { width: "100%", height: 100, borderRadius: radius.sm },
  idActions: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  idBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
});

