import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { DateField } from "@/src/components/ui/DateTimeField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { choosePhoto } from "@/src/lib/pickImage";
import { useAuth } from "@/src/auth/AuthContext";

export default function EditProfile() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, member, refresh } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [color, setColor] = useState("#FF6B6B");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const d = await api(`/families/members/${member.member_id}`);
      const m = d.member;
      setName(m.name || "");
      setPhone(m.phone || "");
      setBirthday(m.birthday || "");
      setPhotoUrl(m.photo_url || null);
      setColor(m.color || "#FF6B6B");
    } catch {}
  }, [member]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickImage = () => {
    choosePhoto("photo", (uri) => setLocalUri(uri), { allowsEditing: true, aspect: [1, 1] });
  };

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!member) return;
    setSaving(true);
    try {
      let photo = photoUrl || undefined;
      if (localUri) photo = (await uploadMedia(localUri, "image")).url;
      await api(`/families/members/${member.member_id}`, {
        method: "PATCH",
        body: { name: name.trim(), phone: phone.trim() || null, birthday: birthday.trim() || null, photo_url: photo },
      });
      await api("/auth/profile", { method: "PATCH", body: { name: name.trim() } });
      await refresh();
      router.back();
    } catch (e: any) {
      setError(e?.message || "Could not save your profile");
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="edit-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20} style={{ flex: 1 }}>Edit Profile</AppText>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickImage} testID="edit-photo">
            <Avatar uri={localUri || photoUrl} name={name} size={110} color={color} ring />
            <View style={[styles.camBadge, { backgroundColor: c.brand, borderColor: c.surfaceSecondary }]}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          </Pressable>
          <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>Tap to change photo</AppText>
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <TextField label="Name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your name" testID="edit-name" />
          <TextField label="Phone" icon="call-outline" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" testID="edit-phone" />
          <DateField label="Birthday" value={birthday || null} onChange={setBirthday} placeholder="Select your birthday" maxToday testID="edit-birthday" />

          <View>
            <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: 6 }}>Email</AppText>
            <View style={[styles.readonly, { backgroundColor: c.surfaceTertiary, borderColor: c.border }]}>
              <Ionicons name="mail-outline" size={20} color={c.onSurfaceTertiary} />
              <AppText size={15} color={c.onSurfaceTertiary} style={{ flex: 1 }}>{user?.email}</AppText>
              <Ionicons name="lock-closed" size={16} color={c.onSurfaceTertiary} />
            </View>
          </View>
        </View>

        {error ? <AppText size={13} color={c.error} style={{ marginTop: spacing.md }}>{error}</AppText> : null}

        <Button label={saving ? "Saving…" : "Save Profile"} onPress={save} disabled={saving} testID="edit-save" style={{ marginTop: spacing.xl }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  avatarWrap: { alignItems: "center", marginTop: spacing.md },
  camBadge: { position: "absolute", bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 3 },
  readonly: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, height: 54 },
});
