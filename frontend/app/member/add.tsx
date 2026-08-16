import React, { useState } from "react";
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, memberPalette } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";

const ROLES = [
  { key: "parent", label: "Parent" },
  { key: "child", label: "Child" },
  { key: "adult", label: "Adult" },
  { key: "admin", label: "Admin" },
];

export default function AddMember() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [role, setRole] = useState("adult");
  const [birthday, setBirthday] = useState("");
  const [color, setColor] = useState(memberPalette[0]);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [permDenied, setPermDenied] = useState(false);

  const pickImage = async () => {
    setPermDenied(false);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      setPermDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]) setLocalUri(result.assets[0].uri);
  };

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("Please enter a name");
      return;
    }
    setSaving(true);
    try {
      let photo_url: string | undefined;
      if (localUri) photo_url = (await uploadMedia(localUri, "image")).url;
      await api("/families/members", {
        method: "POST",
        body: {
          name: name.trim(),
          relationship: relationship.trim() || "Member",
          role,
          color,
          birthday: birthday.trim() || null,
          photo_url,
          is_child: role === "child",
        },
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-add-member">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          Add Family Member
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickImage} style={styles.avatarPick} testID="member-photo-pick">
          <Avatar uri={localUri} name={name || "?"} size={96} color={color} ring />
          <View style={[styles.cameraBadge, { backgroundColor: c.brand }]}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>
        {permDenied ? (
          <Pressable onPress={() => Linking.openSettings()} style={{ alignSelf: "center" }}>
            <AppText size={12} weight="bold" color={c.brand}>
              Photo access needed · Open Settings
            </AppText>
          </Pressable>
        ) : null}

        <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
          <TextField label="Name" icon="person-outline" placeholder="e.g. Aarav" value={name} onChangeText={setName} testID="member-name-input" />
          <TextField label="Relationship" icon="people-outline" placeholder="e.g. Son, Grandma, Uncle" value={relationship} onChangeText={setRelationship} testID="member-rel-input" />
          <TextField label="Birthday (optional)" icon="gift-outline" placeholder="YYYY-MM-DD" value={birthday} onChangeText={setBirthday} testID="member-bday-input" />
        </View>

        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Role
        </AppText>
        <View style={styles.roleRow}>
          {ROLES.map((r) => {
            const sel = role === r.key;
            return (
              <Pressable key={r.key} onPress={() => setRole(r.key)} style={[styles.roleChip, { backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary, borderColor: sel ? c.brand : "transparent" }]} testID={`role-${r.key}`}>
                <AppText size={13} weight="semibold" color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>
                  {r.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Colour
        </AppText>
        <View style={styles.colorRow}>
          {memberPalette.map((col) => (
            <Pressable key={col} onPress={() => setColor(col)} testID={`color-${col}`}>
              <View style={[styles.colorDot, { backgroundColor: col, borderWidth: color === col ? 3 : 0, borderColor: c.onSurface }]} />
            </Pressable>
          ))}
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="member-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Add Member" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-member-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  avatarPick: { alignSelf: "center", marginBottom: spacing.sm },
  cameraBadge: { position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  roleRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  roleChip: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, borderWidth: 1.5 },
  colorRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  colorDot: { width: 40, height: 40, borderRadius: 20 },
});
