import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, Dimensions } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, fonts } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { REACTIONS, REACTION_MAP } from "@/src/lib/constants";
import { timeAgo } from "@/src/lib/time";

const { width } = Dimensions.get("window");

export default function PostDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, cm] = await Promise.all([api(`/posts/${id}`), api(`/posts/${id}/comments`)]);
      setPost(p);
      setComments(cm);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const react = async (type: string) => {
    if (!post) return;
    const updated =
      post.my_reaction === type
        ? await api(`/posts/${id}/react`, { method: "DELETE" })
        : await api(`/posts/${id}/react`, { method: "POST", body: { type } });
    setPost(updated);
  };

  const addComment = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText("");
    const c = await api(`/posts/${id}/comments`, { method: "POST", body: { text: body } });
    setComments((prev) => [...prev, c]);
    load();
  };

  const del = async () => {
    await api(`/posts/${id}`, { method: "DELETE" });
    router.back();
  };

  if (!post) return <View style={{ flex: 1, backgroundColor: c.surface }} />;

  const media = post.media?.[0];
  const topReactions = Object.entries(post.reaction_summary || {})
    .sort((a: any, b: any) => b[1] - a[1])
    .map(([k]) => REACTION_MAP[k] || "❤️");

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="post-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={17}>
          Post
        </AppText>
        <Pressable onPress={del} hitSlop={12} testID="post-delete">
          <Ionicons name="trash-outline" size={22} color={c.onSurfaceTertiary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>
        <View style={styles.authorRow}>
          <Avatar uri={post.author?.photo_url} name={post.author?.name} size={44} color={post.author?.color} />
          <View style={{ flex: 1 }}>
            <AppText family="display" weight="bold" size={15}>
              {post.author?.name}
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {post.author?.relationship} · {timeAgo(post.created_at)}
            </AppText>
          </View>
          {post.category ? (
            <View style={[styles.badge, { backgroundColor: c.brandTertiary }]}>
              <AppText size={11} weight="semibold" color={c.onBrandTertiary}>
                {post.category}
              </AppText>
            </View>
          ) : null}
        </View>

        {media ? (
          <View>
            <SmartImage uri={media.url} style={styles.media} />
            {post.location ? (
              <LinearGradient colors={["transparent", "rgba(44,44,40,0.7)"]} style={styles.scrim}>
                <Ionicons name="location" size={13} color="#fff" />
                <AppText size={12} weight="semibold" color="#fff">
                  {post.location}
                </AppText>
              </LinearGradient>
            ) : null}
          </View>
        ) : null}

        {post.caption ? (
          <AppText size={15} style={{ padding: spacing.lg, lineHeight: 22 }}>
            {post.caption}
          </AppText>
        ) : null}

        {/* reactions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionRow}>
          {REACTIONS.map((r) => {
            const active = post.my_reaction === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => react(r.key)}
                style={[styles.reactionChip, { backgroundColor: active ? c.brandTertiary : c.surfaceSecondary, borderColor: active ? c.brand : "transparent" }]}
                testID={`detail-react-${r.key}`}
              >
                <AppText size={18}>{r.emoji}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
        {topReactions.length ? (
          <AppText size={13} color={c.onSurfaceSecondary} style={{ paddingHorizontal: spacing.lg }}>
            {topReactions.join(" ")} {post.reaction_total} reaction{post.reaction_total > 1 ? "s" : ""}
          </AppText>
        ) : null}

        {/* comments */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <AppText family="display" weight="bold" size={15} style={{ marginBottom: spacing.md }}>
            Comments ({comments.length})
          </AppText>
          {comments.length === 0 ? (
            <AppText size={13} color={c.onSurfaceTertiary}>
              No comments yet — say something kind ❤️
            </AppText>
          ) : (
            comments.map((cm) => (
              <View key={cm.comment_id} style={styles.commentRow} testID={`comment-${cm.comment_id}`}>
                <Avatar uri={cm.author?.photo_url} name={cm.author?.name} size={36} color={cm.author?.color} />
                <View style={[styles.commentBubble, { backgroundColor: c.surfaceSecondary }]}>
                  <AppText size={13} weight="bold">
                    {cm.author?.name}
                  </AppText>
                  <AppText size={14} style={{ marginTop: 2, lineHeight: 19 }}>
                    {cm.text}
                  </AppText>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a comment…"
            placeholderTextColor={c.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, fontFamily: fonts.textMedium }]}
            testID="comment-input"
          />
          <Pressable onPress={addComment} style={[styles.sendBtn, { backgroundColor: c.brand }]} testID="send-comment-btn">
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  authorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  media: { width, height: width, backgroundColor: "#EAE4D9" },
  scrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 56, flexDirection: "row", alignItems: "flex-end", gap: 4, padding: spacing.md },
  reactionRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  reactionChip: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, flexShrink: 0 },
  commentRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, alignItems: "flex-start" },
  commentBubble: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
