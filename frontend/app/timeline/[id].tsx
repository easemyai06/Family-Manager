import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, Alert, Platform, useWindowDimensions } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow, fonts } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { formatDMY, timeAgo } from "@/src/lib/time";

export default function MemoryDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const [mem, cs] = await Promise.all([api(`/timeline/${id}`), api(`/timeline/${id}/comments`)]);
      setM(mem);
      setComments(cs);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleLove = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      setM(await api(`/timeline/${id}/react`, { method: "POST" }));
    } catch {}
  };

  const addComment = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const cm = await api(`/timeline/${id}/comments`, { method: "POST", body: { text: body } });
      setComments((prev) => [...prev, cm]);
      setM((prev: any) => (prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev));
    } catch {}
  };

  const remove = () => {
    Alert.alert("Delete memory?", "This memory will be removed from your family story.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/timeline/${id}`, { method: "DELETE" });
            router.back();
          } catch {}
        },
      },
    ]);
  };

  if (!m) return <View style={{ flex: 1, backgroundColor: c.surface }} />;

  const hasMedia = m.media?.length > 0;
  const heroH = Math.min(width * 0.9, 380);

  return (
    <KeyboardAvoidingView behavior="translate-with-padding" style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* hero */}
        <View style={{ height: hasMedia ? heroH : 150 }}>
          {hasMedia ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {m.media.map((img: any, i: number) => (
                <SmartImage key={i} uri={img.url} style={{ width, height: heroH }} />
              ))}
            </ScrollView>
          ) : (
            <LinearGradient colors={[c.brand, "#2C2C28"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.45)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.circleBtn, { top: insets.top + 6, left: spacing.lg }]} testID="memory-detail-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={remove} hitSlop={12} style={[styles.circleBtn, { top: insets.top + 6, right: spacing.lg }]} testID="memory-delete">
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={[styles.body, { backgroundColor: c.surface }]}>
          <View style={styles.tagRow}>
            <View style={[styles.catBadge, { backgroundColor: c.brandTertiary }]}>
              <AppText size={12} weight="bold" color={c.brand}>
                {m.category}
              </AppText>
            </View>
            {m.importance ? (
              <View style={[styles.catBadge, { backgroundColor: c.warning }]}>
                <AppText size={12} weight="bold" color={c.onWarning}>
                  ⭐ Important
                </AppText>
              </View>
            ) : null}
          </View>

          <AppText family="display" weight="bold" size={24} style={{ marginTop: spacing.md }}>
            {m.title}
          </AppText>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={15} color={c.onSurfaceTertiary} />
            <AppText size={14} color={c.onSurfaceSecondary}>
              {formatDMY(m.date)}
            </AppText>
          </View>
          {m.location ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color={c.onSurfaceTertiary} />
              <AppText size={14} color={c.onSurfaceSecondary}>
                {m.location}
              </AppText>
            </View>
          ) : null}

          {m.description ? (
            <AppText size={15} color={c.onSurface} style={{ marginTop: spacing.lg, lineHeight: 23 }}>
              {m.description}
            </AppText>
          ) : null}

          {m.people_members?.length ? (
            <View style={{ marginTop: spacing.xl }}>
              <AppText size={13} weight="bold" color={c.onSurfaceSecondary} style={{ marginBottom: spacing.md }}>
                Who was there
              </AppText>
              <View style={styles.peopleWrap}>
                {m.people_members.map((p: any) => (
                  <Pressable key={p.member_id} onPress={() => router.push(`/member/${p.member_id}`)} style={styles.person} testID={`memory-who-${p.member_id}`}>
                    <Avatar uri={p.photo_url} name={p.name} size={44} color={p.color} ring />
                    <AppText size={12} weight="semibold" numberOfLines={1} style={{ maxWidth: 60 }}>
                      {p.name}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* love + notes */}
          <View style={[styles.loveRow, { borderTopColor: c.divider }]}>
            <Pressable onPress={toggleLove} style={styles.loveBtn} testID="memory-love">
              <Ionicons name={m.my_love ? "heart" : "heart-outline"} size={24} color={m.my_love ? c.brand : c.onSurfaceTertiary} />
              <AppText size={14} weight="semibold" color={m.my_love ? c.brand : c.onSurfaceSecondary}>
                {m.love_count || 0} {m.love_count === 1 ? "love" : "loves"}
              </AppText>
            </Pressable>
            <View style={styles.loveBtn}>
              <Ionicons name="chatbubble-outline" size={21} color={c.onSurfaceTertiary} />
              <AppText size={14} weight="semibold" color={c.onSurfaceSecondary}>
                {m.comment_count || 0} {m.comment_count === 1 ? "note" : "notes"}
              </AppText>
            </View>
          </View>

          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            {comments.length === 0 ? (
              <AppText size={13} color={c.onSurfaceTertiary}>
                Be the first to leave a note on this memory ❤️
              </AppText>
            ) : (
              comments.map((cm) => (
                <View key={cm.comment_id} style={styles.commentRow} testID={`memory-comment-${cm.comment_id}`}>
                  <Avatar uri={cm.author?.photo_url} name={cm.author?.name} size={34} color={cm.author?.color} />
                  <View style={[styles.commentBubble, { backgroundColor: c.surfaceSecondary }]}>
                    <View style={styles.commentTop}>
                      <AppText size={13} weight="bold" color={cm.author?.color}>
                        {cm.author?.name}
                      </AppText>
                      <AppText size={11} color={c.onSurfaceTertiary}>
                        {timeAgo(cm.created_at)}
                      </AppText>
                    </View>
                    <AppText size={14} color={c.onSurface} style={{ marginTop: 2 }}>
                      {cm.text}
                    </AppText>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* composer */}
      <View style={[styles.composer, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Leave a note…"
          placeholderTextColor={c.onSurfaceTertiary}
          style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, fontFamily: fonts.textMedium }]}
          multiline
          testID="memory-comment-input"
        />
        <Pressable onPress={addComment} style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brand : c.surfaceTertiary }]} disabled={!text.trim()} testID="memory-comment-send">
          <Ionicons name="arrow-up" size={20} color={text.trim() ? "#fff" : c.onSurfaceTertiary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 110 },
  circleBtn: { position: "absolute", width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  body: { marginTop: -20, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, minHeight: 300, ...shadow(2) },
  tagRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  catBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  peopleWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  person: { alignItems: "center", gap: 4 },
  loveRow: { flexDirection: "row", alignItems: "center", gap: spacing.xl, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1 },
  loveBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  commentBubble: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  commentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: 15, maxHeight: 110, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
