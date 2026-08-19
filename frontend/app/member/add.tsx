import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, memberPalette } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { choosePhoto } from "@/src/lib/pickImage";
import { shareInvite, shareInviteWhatsApp } from "@/src/lib/invite";

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
  const [invite, setInvite] = useState<any>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    api("/families/invite")
      .then(setInvite)
      .catch(() => {});
  }, []);

  const pickImage = () => {
    choosePhoto("photo", (uri) => setLocalUri(uri), { allowsEditing: true, aspect: [1, 1] });
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
      setAdded(name.trim());
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
          {added ? "Member Added" : "Add Family Member"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      {added ? (
        <View style={styles.successWrap}>
          <View style={[styles.successBadge, { backgroundColor: c.success + "22" }]}>
            <Ionicons name="checkmark-circle" size={44} color={c.success} />
          </View>
          <AppText family="display" weight="bold" size={20} center style={{ marginTop: spacing.lg }}>
            {added} added to the family 🎉
          </AppText>
          <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginTop: 8, lineHeight: 20 }}>
            Invite them to join so they can see everything. They’ll appear as{" "}
            <AppText size={14} weight="bold" color={c.warning}>
              Pending
            </AppText>{" "}
            until they join.
          </AppText>

          {invite ? (
            <View style={[styles.codePill, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <AppText size={12} color={c.onSurfaceTertiary}>
                Invite code
              </AppText>
              <AppText family="display" weight="bold" size={22} color={c.brand} style={{ letterSpacing: 2 }}>
                {invite.invite_code}
              </AppText>
            </View>
          ) : null}

          <View style={{ alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xl }}>
            <Pressable
              onPress={() => invite && shareInviteWhatsApp(invite.invite_code, invite.family_name)}
              style={[styles.waBtn, { backgroundColor: "#25D366" }]}
              testID="invite-whatsapp-btn"
            >
              <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              <AppText size={15} weight="bold" color="#fff">
                Invite via WhatsApp
              </AppText>
            </Pressable>
            <Button
              label="Share invite link"
              variant="secondary"
              onPress={() => invite && shareInvite(invite.invite_code, invite.family_name)}
              testID="invite-share-link-btn"
            />
            <Button label="Done" variant="ghost" onPress={() => router.back()} testID="add-member-done" />
          </View>
        </View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickImage} style={styles.avatarPick} testID="member-photo-pick">
          <Avatar uri={localUri} name={name || "?"} size={96} color={color} ring />
          <View style={[styles.cameraBadge, { backgroundColor: c.brand }]}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>

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
      )}
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
  successWrap: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing["2xl"] },
  successBadge: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  codePill: { alignItems: "center", borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  waBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: 15 },
});
