import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { formatDate } from "@/src/lib/time";

const REACTIONS = ["❤️", "👍", "✅", "🎉"];

export default function NoticeDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [n, setN] = useState<any>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showSeen, setShowSeen] = useState(false);

  const load = useCallback(async () => {
    try {
      setN(await api(`/notices/${id}`));
      // record that this member has now seen the note
      try {
        setN(await api(`/notices/${id}/seen`, { method: "POST" }));
      } catch {}
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const react = async (emoji: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      setN(await api(`/notices/${id}/react`, { method: "POST", body: { emoji } }));
    } catch {}
  };

  const sendReply = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      setN(await api(`/notices/${id}/replies`, { method: "POST", body: { text: text.trim() } }));
      setText("");
    } catch {}
    setSending(false);
  };

  if (!n) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]} />;
  }

  const mineReaction = (emoji: string) => (n.reaction_summary || []).find((r: any) => r.emoji === emoji);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="notice-detail-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18} style={{ flex: 1 }} numberOfLines={1}>Note</AppText>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: n.priority === "high" ? c.error : c.border }, shadow(1)]}>
          <View style={styles.cardTop}>
            {n.pinned ? <Ionicons name="pin" size={16} color={c.brand} /> : null}
            <AppText family="display" weight="bold" size={20} style={{ flex: 1 }}>{n.title}</AppText>
            {n.priority === "high" ? (
              <View style={[styles.urgent, { backgroundColor: c.error }]}>
                <AppText size={10} weight="bold" color="#fff">URGENT</AppText>
              </View>
            ) : null}
          </View>
          {n.note ? <AppText size={15} color={c.onSurfaceSecondary} style={{ marginTop: spacing.sm }}>{n.note}</AppText> : null}
          {n.photo_url ? <SmartImage uri={n.photo_url} style={styles.detailPhoto} /> : null}
          <View style={styles.byRow}>
            <Avatar uri={n.owner?.photo_url} name={n.owner?.name} size={22} color={n.owner?.color} />
            <AppText size={12} color={c.onSurfaceTertiary} style={{ flex: 1 }}>
              {n.owner?.name}{n.days_until_expiry != null ? ` · expires in ${n.days_until_expiry}d` : ""}
            </AppText>
          </View>
        </View>

        {/* reactions */}
        <View style={styles.reactBar}>
          {REACTIONS.map((emoji) => {
            const g = mineReaction(emoji);
            const mine = g?.mine;
            return (
              <Pressable
                key={emoji}
                onPress={() => react(emoji)}
                style={[styles.reactChip, { backgroundColor: mine ? c.brandTertiary : c.surface, borderColor: mine ? c.brand : c.border }]}
                testID={`react-${emoji}`}
              >
                <AppText size={16}>{emoji}</AppText>
                {g?.count ? <AppText size={12} weight="bold" color={mine ? c.brand : c.onSurfaceSecondary}>{g.count}</AppText> : null}
              </Pressable>
            );
          })}
        </View>

        {/* seen by */}
        {n.seen_count ? (
          <View style={{ marginTop: spacing.md }}>
            <Pressable onPress={() => setShowSeen((s) => !s)} style={styles.seenRow} testID="notice-seen-toggle">
              <Ionicons name="eye-outline" size={16} color={c.onSurfaceTertiary} />
              <AppText size={13} weight="semibold" color={c.onSurfaceSecondary}>
                Seen by {n.seen_count}
              </AppText>
              <Ionicons name={showSeen ? "chevron-up" : "chevron-down"} size={15} color={c.onSurfaceTertiary} />
            </Pressable>
            {showSeen ? (
              <View style={[styles.seenList, { backgroundColor: c.surface, borderColor: c.border }]} testID="notice-seen-list">
                {(n.seen_members || []).map((m: any) => (
                  <View key={m.member_id} style={styles.seenMember}>
                    <Avatar uri={m.photo_url} name={m.name} size={26} color={m.color} />
                    <AppText size={13} color={c.onSurface}>{m.name}</AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* replies */}
        <AppText family="display" weight="bold" size={16} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Replies {n.reply_count ? `(${n.reply_count})` : ""}
        </AppText>
        {(n.replies || []).length === 0 ? (
          <AppText size={13} color={c.onSurfaceTertiary}>No replies yet — start the conversation.</AppText>
        ) : (
          <View style={{ gap: spacing.md }}>
            {n.replies.map((r: any) => (
              <View key={r.reply_id} style={styles.replyRow}>
                <Avatar uri={r.member?.photo_url} name={r.member?.name} size={34} color={r.member?.color} />
                <View style={[styles.bubble, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <AppText size={13} weight="bold" color={r.member?.color}>{r.member?.name}</AppText>
                  <AppText size={14} color={c.onSurface}>{r.text}</AppText>
                  <AppText size={10} color={c.onSurfaceTertiary} style={{ marginTop: 2 }}>{formatDate(r.created_at, "D MMM, HH:mm")}</AppText>
                </View>
              </View>
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8, backgroundColor: c.surface, borderTopColor: c.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a reply…"
          placeholderTextColor={c.onSurfaceTertiary}
          style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
          testID="notice-reply-input"
          onSubmitEditing={sendReply}
        />
        <Pressable onPress={sendReply} disabled={!text.trim() || sending} style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brand : c.surfaceTertiary }]} testID="notice-reply-send">
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.lg },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  urgent: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  byRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  detailPhoto: { width: "100%", height: 200, borderRadius: radius.md, marginTop: spacing.md },
  reactBar: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  reactChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1 },
  seenRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  seenList: { marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  seenMember: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  replyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  bubble: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
