import React from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { AppText } from "./ui/AppText";
import { Avatar } from "./ui/Avatar";
import { SmartImage } from "./ui/SmartImage";
import { REACTIONS, REACTION_MAP } from "@/src/lib/constants";
import { timeAgo } from "@/src/lib/time";

export type Post = {
  post_id: string;
  caption: string;
  media: { url: string; type: string }[];
  location?: string | null;
  category?: string | null;
  created_at: string;
  author?: { name: string; relationship: string; color: string; photo_url?: string | null } | null;
  reaction_summary: Record<string, number>;
  reaction_total: number;
  my_reaction?: string | null;
  comment_count: number;
};

interface Props {
  post: Post;
  onReact: (type: string) => void;
  onOpen: () => void;
}

export function PostCard({ post, onReact, onOpen }: Props) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const media = post.media?.[0];
  const topReactions = Object.entries(post.reaction_summary || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => REACTION_MAP[k] || "❤️");

  const handleReact = (type: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(type);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`post-${post.post_id}`}>
      {/* header */}
      <View style={styles.header}>
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

      {/* media */}
      {media ? (
        <Pressable onPress={onOpen} testID={`post-media-${post.post_id}`}>
          <SmartImage uri={media.url} style={[styles.media, { height: width * 0.7 }]} />
          {post.location ? (
            <LinearGradient
              colors={["transparent", "rgba(44,44,40,0.7)"]}
              style={styles.scrim}
            >
              <Ionicons name="location" size={13} color="#fff" />
              <AppText size={12} weight="semibold" color="#fff">
                {post.location}
              </AppText>
            </LinearGradient>
          ) : null}
        </Pressable>
      ) : null}

      {/* caption */}
      {post.caption ? (
        <Pressable onPress={onOpen} style={styles.captionWrap}>
          <AppText size={14} color={c.onSurface} style={{ lineHeight: 20 }}>
            {post.caption}
          </AppText>
        </Pressable>
      ) : null}

      {/* reaction chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.reactionRow}
      >
        {REACTIONS.map((r) => {
          const active = post.my_reaction === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => handleReact(r.key)}
              testID={`react-${r.key}-${post.post_id}`}
              style={[
                styles.reactionChip,
                {
                  backgroundColor: active ? c.brandTertiary : c.surfaceSecondary,
                  borderColor: active ? c.brand : "transparent",
                },
              ]}
            >
              <AppText size={16}>{r.emoji}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {topReactions.length > 0 ? (
            <AppText size={13} color={c.onSurfaceSecondary}>
              {topReactions.join(" ")} {post.reaction_total}
            </AppText>
          ) : (
            <AppText size={13} color={c.onSurfaceTertiary}>
              Be the first to react
            </AppText>
          )}
        </View>
        <Pressable onPress={onOpen} style={styles.commentBtn} testID={`comments-${post.post_id}`}>
          <Ionicons name="chatbubble-outline" size={16} color={c.onSurfaceSecondary} />
          <AppText size={13} color={c.onSurfaceSecondary}>
            {post.comment_count}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  media: { width: "100%", backgroundColor: "#EAE4D9" },
  scrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    padding: spacing.md,
  },
  captionWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  reactionRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  reactionChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    flexShrink: 0,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  footerLeft: { flexDirection: "row", alignItems: "center" },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
});
