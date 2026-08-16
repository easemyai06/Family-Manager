import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { AFFECTION_MAP } from "@/src/lib/constants";

export default function Family() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [fam, tl] = await Promise.all([api("/families/me"), api("/affection/timeline")]);
      setFamily(fam.family);
      setMembers(fam.members);
      setTimeline(tl.week || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* cover */}
        <View style={styles.cover}>
          <SmartImage uri={family?.cover_photo} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(44,44,40,0.1)", "rgba(44,44,40,0.75)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.coverContent, { paddingTop: insets.top + spacing.md }]}>
            <AppText family="display" weight="bold" size={26} color="#fff">
              {family?.name || "Your Family"} ❤️
            </AppText>
            <AppText size={13} color="rgba(255,255,255,0.85)">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </AppText>
          </View>
        </View>

        {/* members */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText family="display" weight="bold" size={18}>
              Family Members
            </AppText>
            <Pressable onPress={() => router.push("/member/add")} testID="add-member-btn">
              <AppText size={13} weight="bold" color={c.brand}>
                + Add
              </AppText>
            </Pressable>
          </View>
          <View style={styles.memberGrid}>
            {members.map((m) => (
              <Pressable key={m.member_id} style={styles.memberItem} onPress={() => router.push(`/member/${m.member_id}`)} testID={`member-${m.member_id}`}>
                <Avatar uri={m.photo_url} name={m.name} size={68} color={m.color} ring />
                <AppText size={13} weight="semibold" numberOfLines={1} style={{ marginTop: 6, maxWidth: 78 }}>
                  {m.name}
                </AppText>
                <AppText size={11} color={c.onSurfaceTertiary}>
                  {m.relationship}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* send love */}
        <Pressable onPress={() => router.push("/affection/send")} style={styles.section} testID="send-love-cta">
          <LinearGradient colors={[c.brandPrimary, "#FF9E9E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.loveCard, shadow(2)]}>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={20} color="#fff">
                Send Some Love ❤️
              </AppText>
              <AppText size={13} color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>
                A hug, a kiss, or a "proud of you" — brighten someone's day
              </AppText>
            </View>
            <View style={styles.loveArrow}>
              <Ionicons name="heart" size={26} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* love timeline */}
        <View style={styles.section}>
          <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>
            Love This Week
          </AppText>
          {timeline.length === 0 ? (
            <View style={[styles.emptyLove, { backgroundColor: c.surface, borderColor: c.border }]}>
              <AppText size={13} color={c.onSurfaceTertiary} center>
                No affection yet this week. Be the first to send some love ❤️
              </AppText>
            </View>
          ) : (
            <View style={[styles.timelineCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              {timeline.slice(0, 12).map((row, i) => (
                <View key={i} style={[styles.loveRow, i < Math.min(timeline.length, 12) - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                  <AppText size={22}>{AFFECTION_MAP[row.type]?.emoji || "❤️"}</AppText>
                  <AppText size={14} style={{ flex: 1 }}>
                    <AppText size={14} weight="bold">
                      {row.from?.name}
                    </AppText>{" "}
                    →{" "}
                    <AppText size={14} weight="bold">
                      {row.to?.name}
                    </AppText>
                  </AppText>
                  <View style={[styles.countPill, { backgroundColor: c.brandTertiary }]}>
                    <AppText size={12} weight="bold" color={c.onBrandTertiary}>
                      {row.count}× {AFFECTION_MAP[row.type]?.label}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cover: { height: 200, backgroundColor: "#EAE4D9", justifyContent: "flex-end" },
  coverContent: { padding: spacing.lg },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  memberGrid: { flexDirection: "row", flexWrap: "wrap" },
  memberItem: { alignItems: "center", width: "25%", marginBottom: spacing.lg },
  loveCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, padding: spacing.xl },
  loveArrow: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  timelineCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  loveRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  countPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  emptyLove: { borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1 },
});
