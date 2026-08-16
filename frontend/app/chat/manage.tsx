import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function ManageGroup() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [chat, mems] = await Promise.all([api(`/chats/${id}`), api("/families/members")]);
        setName(chat.name || chat.display_name || "");
        const ids = (chat.members || []).map((m: any) => m.member_id);
        setOriginal(ids);
        setSelected(ids);
        setMembers(mems);
      } catch {}
    })();
  }, [id]);

  const toggle = (mid: string) => {
    if (mid === me?.member_id) return; // can't remove yourself
    setSelected((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  };

  const save = async () => {
    setError("");
    if (selected.length < 2) {
      setError("A group needs at least 2 people");
      return;
    }
    setSaving(true);
    try {
      const add_member_ids = selected.filter((x) => !original.includes(x));
      const remove_member_ids = original.filter((x) => !selected.includes(x));
      await api(`/chats/${id}`, {
        method: "PATCH",
        body: { name: name.trim() || null, add_member_ids, remove_member_ids },
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Couldn't update the group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="manage-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          Group Info
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <TextField label="Group Name" icon="people-outline" placeholder="e.g. Vacation Planning" value={name} onChangeText={setName} testID="group-rename-input" />

        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Members ({selected.length})
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {members.map((m, i) => {
            const inGroup = selected.includes(m.member_id);
            const isMe = m.member_id === me?.member_id;
            return (
              <View key={m.member_id} style={[styles.row, i < members.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                <Avatar uri={m.photo_url} name={m.name} size={44} color={m.color} ring />
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={15}>
                    {m.name} {isMe ? "(You)" : ""}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {m.relationship}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => toggle(m.member_id)}
                  disabled={isMe}
                  hitSlop={8}
                  style={[styles.check, { borderColor: inGroup ? c.brand : c.borderStrong, backgroundColor: inGroup ? c.brand : "transparent", opacity: isMe ? 0.4 : 1 }]}
                  testID={`manage-toggle-${m.member_id}`}
                >
                  {inGroup ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="manage-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Save Changes" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-group-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
