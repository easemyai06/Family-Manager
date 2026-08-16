import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { AppText } from "./ui/AppText";
import { SmartImage } from "./ui/SmartImage";

export type StoryGroup = {
  member: { member_id: string; name: string; color: string; photo_url?: string | null } | null;
  stories: { story_id: string; media_url: string; caption?: string | null }[];
};

interface Props {
  groups: StoryGroup[];
  onAdd: () => void;
  onOpen: (group: StoryGroup) => void;
}

export function StoryBar({ groups, onAdd, onOpen }: Props) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Pressable style={styles.item} onPress={onAdd} testID="add-story-btn">
        <View style={[styles.addCircle, { borderColor: c.brand, backgroundColor: c.surfaceSecondary }]}>
          <Ionicons name="add" size={26} color={c.brand} />
        </View>
        <AppText size={12} weight="medium" color={c.onSurfaceSecondary}>
          Your Story
        </AppText>
      </Pressable>

      {groups.map((g) => (
        <Pressable
          key={g.member?.member_id}
          style={styles.item}
          onPress={() => onOpen(g)}
          testID={`story-${g.member?.member_id}`}
        >
          <View style={[styles.storyRing, { backgroundColor: g.member?.color }]}>
            <View style={[styles.storyInner, { borderColor: c.surface }]}>
              <SmartImage uri={g.stories[0]?.media_url} style={styles.storyImg} />
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.4)"]} style={styles.storyScrim} />
            </View>
          </View>
          <AppText size={12} weight="medium" numberOfLines={1} style={{ maxWidth: 66 }}>
            {g.member?.name}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  item: { alignItems: "center", gap: 6, width: 72 },
  addCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 3, alignItems: "center", justifyContent: "center" },
  storyInner: { width: "100%", height: "100%", borderRadius: 30, borderWidth: 2, overflow: "hidden" },
  storyImg: { width: "100%", height: "100%" },
  storyScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 24 },
});
