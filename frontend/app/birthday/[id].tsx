import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow, fonts } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { formatDate, timeAgo } from "@/src/lib/time";

const EMOJIS = ["🎂", "🎉", "🥳", "🎈", "🎁", "❤️", "🌟", "🍰"];

export default function BirthdayWishes() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("🎂");

  const load = useCallback(async () => {
    try {
      setData(await api(`/birthdays/${id}/wishes`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setText("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const w = await api(`/birthdays/${id}/wishes`, { method: "POST", body: { message, emoji } });
      setData((prev: any) => (prev ? { ...prev, wishes: [w, ...prev.wishes] } : prev));
    } catch {}
  };

  if (!data) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const m = data.member;
  const wishes = data.wishes || [];

  return (
    <KeyboardAvoidingView behavior="translate-with-padding" style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* celebration header */}
        <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + spacing.sm }]} testID="birthday-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <AppText size={30} style={{ marginTop: spacing.sm }}>
            🎈🎂🎉
          </AppText>
          <View style={{ marginVertical: spacing.md }}>
            <Avatar uri={m.photo_url} name={m.name} size={92} color={m.color} ring />
          </View>
          <AppText family="display" weight="bold" size={24} color="#fff" center>
            Happy Birthday, {m.name}!
          </AppText>
          {m.birthday ? (
            <AppText size={13} color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }}>
              {formatDate(m.birthday, "D MMMM")} · {wishes.length} {wishes.length === 1 ? "wish" : "wishes"}
            </AppText>
          ) : null}
        </LinearGradient>

        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {wishes.length === 0 ? (
            <View style={styles.empty}>
              <AppText size={34}>💌</AppText>
              <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.sm }}>
                No wishes yet
              </AppText>
              <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 2 }}>
                Be the first to send {m.name} some love
              </AppText>
            </View>
          ) : (
            wishes.map((w: any) => (
              <View key={w.wish_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`wish-${w.wish_id}`}>
                <Avatar uri={w.from?.photo_url} name={w.from?.name} size={40} color={w.from?.color} />
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTop}>
                    <AppText size={14} weight="bold" color={w.from?.color}>
                      {w.from?.name}
                    </AppText>
                    <AppText size={11} color={c.onSurfaceTertiary}>
                      {timeAgo(w.created_at)}
                    </AppText>
                  </View>
                  <AppText size={15} color={c.onSurface} style={{ marginTop: 2 }}>
                    {w.emoji} {w.message}
                  </AppText>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* composer */}
      <View style={[styles.composerWrap, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiChip, { backgroundColor: emoji === e ? c.brandTertiary : c.surfaceSecondary, borderColor: emoji === e ? c.brand : "transparent" }]} testID={`wish-emoji-${e}`}>
              <AppText size={20}>{e}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Write a wish for ${m.name}…`}
            placeholderTextColor={c.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, fontFamily: fonts.textMedium }]}
            multiline
            testID="wish-input"
          />
          <Pressable onPress={send} style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brand : c.surfaceTertiary }]} disabled={!text.trim()} testID="wish-send">
            <Ionicons name="send" size={18} color={text.trim() ? "#fff" : c.onSurfaceTertiary} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  back: { position: "absolute", left: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  card: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composerWrap: { borderTopWidth: 1, paddingTop: spacing.sm },
  emojiRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  emojiChip: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: { flex: 1, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 15, maxHeight: 110, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
