import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
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

export default function NewChat() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member: me } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api("/families/members").then((d: any) => setMembers(d.filter((m: any) => m.member_id !== me?.member_id)));
  }, [me?.member_id]);

  const toggle = (mid: string) => {
    setSelected((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));
  };

  const openDirect = async (mid: string) => {
    const chat = await api("/chats", { method: "POST", body: { type: "direct", member_ids: [mid] } });
    router.replace(`/chat/${chat.chat_id}?name=${encodeURIComponent(chat.display_name)}`);
  };

  const createGroup = async () => {
    if (selected.length < 1) return;
    setCreating(true);
    try {
      const isGroup = selected.length > 1 || !!groupName.trim();
      const chat = await api("/chats", {
        method: "POST",
        body: { type: isGroup ? "group" : "direct", member_ids: selected, name: groupName.trim() || "Family Group" },
      });
      router.replace(`/chat/${chat.chat_id}?name=${encodeURIComponent(chat.display_name)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="newchat-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          New Conversation
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <AppText size={13} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.md }}>
          Tap a person to start a direct chat, or select several to create a group.
        </AppText>

        {selected.length > 1 ? (
          <View style={{ marginBottom: spacing.lg }}>
            <TextField label="Group Name" icon="people-outline" placeholder="e.g. Parents, Vacation Planning" value={groupName} onChangeText={setGroupName} testID="group-name-input" />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {members.map((m, i) => {
            const sel = selected.includes(m.member_id);
            return (
              <View key={m.member_id} style={[styles.row, i < members.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                <Avatar uri={m.photo_url} name={m.name} size={44} color={m.color} ring />
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={15}>
                    {m.name}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {m.relationship}
                  </AppText>
                </View>
                <Pressable onPress={() => toggle(m.member_id)} hitSlop={8} style={[styles.check, { borderColor: sel ? c.brand : c.borderStrong, backgroundColor: sel ? c.brand : "transparent" }]} testID={`select-${m.member_id}`}>
                  {sel ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </Pressable>
                <Pressable onPress={() => openDirect(m.member_id)} hitSlop={8} style={[styles.chatBtn, { backgroundColor: c.brandTertiary }]} testID={`direct-${m.member_id}`}>
                  <Ionicons name="chatbubble" size={16} color={c.brand} />
                </Pressable>
              </View>
            );
          })}
        </View>

        {selected.length >= 1 ? (
          <Button
            label={selected.length > 1 || groupName.trim() ? `Create Group (${selected.length})` : "Start Chat"}
            onPress={createGroup}
            loading={creating}
            style={{ marginTop: spacing.xl }}
            testID="create-chat-btn"
          />
        ) : null}
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
  chatBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
