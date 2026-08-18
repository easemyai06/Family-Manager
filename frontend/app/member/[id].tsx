import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { ageFrom, formatDMY } from "@/src/lib/time";

export default function MemberProfile() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member: myMember } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [member, setMember] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [stars, setStars] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await api(`/families/members/${id}`);
      setMember(d.member);
      setPosts(d.posts);
      setStars(d.stars);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!member) return <View style={{ flex: 1, backgroundColor: c.surface }} />;

  const details = [
    member.birthday ? { icon: "gift-outline", label: "Birthday", value: `${formatDMY(member.birthday)} · ${ageFrom(member.birthday)} yrs` } : null,
    member.phone ? { icon: "call-outline", label: "Phone", value: member.phone } : null,
    member.favorite_food ? { icon: "fast-food-outline", label: "Favourite Food", value: member.favorite_food } : null,
    member.favorite_color ? { icon: "color-palette-outline", label: "Favourite Colour", value: member.favorite_color } : null,
    member.hobbies ? { icon: "happy-outline", label: "Hobbies", value: member.hobbies } : null,
  ].filter(Boolean) as any[];

  const isMe = myMember?.member_id === member.member_id;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.cover}>
          <LinearGradient colors={[member.color, "#2C2C28"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + 6 }]} testID="member-back">
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          {isMe ? (
            <Pressable onPress={() => router.push("/member/edit")} hitSlop={12} style={[styles.editTop, { top: insets.top + 6 }]} testID="member-edit">
              <Ionicons name="create-outline" size={22} color="#fff" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.profileTop}>
          <View style={styles.avatarWrap}>
            <Avatar uri={member.photo_url} name={member.name} size={104} color={member.color} ring />
          </View>
          <AppText family="display" weight="bold" size={24} style={{ marginTop: spacing.md }}>
            {member.name}
          </AppText>
          <View style={[styles.relBadge, { backgroundColor: member.color + "22" }]}>
            <AppText size={13} weight="bold" color={member.color}>
              {member.relationship} ❤️
            </AppText>
          </View>
          <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: 6 }}>
            Part of the family
          </AppText>

          {member.is_child && stars > 0 ? (
            <View style={[styles.starsPill, { backgroundColor: c.warning }]}>
              <AppText size={14} weight="bold" color={c.onWarning}>
                ⭐ {stars} stars earned
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <Button label="Send Some Love ❤️" onPress={() => router.push(`/affection/send?member=${member.member_id}`)} testID="member-send-love" />
          <Button
            label={`${member.name}'s Story 📖`}
            variant="secondary"
            onPress={() => router.push(`/timeline?member=${member.member_id}&name=${encodeURIComponent(member.name)}`)}
            testID="member-view-story"
          />
          <Button
            label="Birthday Wishes 🎂"
            variant="secondary"
            onPress={() => router.push(`/birthday/${member.member_id}`)}
            testID="member-birthday-wishes"
          />
          <Button
            label="Emergency Info 🚑"
            variant="secondary"
            onPress={() => router.push(`/emergency/medical/${member.member_id}`)}
            testID="member-emergency-info"
          />
        </View>

        {details.length ? (
          <View style={styles.section}>
            <View style={[styles.detailsCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              {details.map((d, i) => (
                <View key={i} style={[styles.detailRow, i < details.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                  <Ionicons name={d.icon} size={18} color={member.color} />
                  <AppText size={13} color={c.onSurfaceTertiary} style={{ width: 120 }}>
                    {d.label}
                  </AppText>
                  <AppText size={14} weight="semibold" style={{ flex: 1 }}>
                    {d.value}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText family="display" weight="bold" size={17} style={{ marginBottom: spacing.md }}>
            {member.name}'s Moments
          </AppText>
          {posts.length === 0 ? (
            <AppText size={13} color={c.onSurfaceTertiary}>
              No posts yet.
            </AppText>
          ) : (
            <View style={styles.grid}>
              {posts.map((p) => (
                <Pressable key={p.post_id} onPress={() => router.push(`/post/${p.post_id}`)} style={styles.gridItem} testID={`profile-post-${p.post_id}`}>
                  {p.media?.[0] ? (
                    <SmartImage uri={p.media[0].url} style={styles.gridImg} />
                  ) : (
                    <View style={[styles.gridImg, styles.gridText, { backgroundColor: c.surface }]}>
                      <AppText size={12} numberOfLines={4} color={c.onSurfaceSecondary}>
                        {p.caption}
                      </AppText>
                    </View>
                  )}
                </Pressable>
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
  cover: { height: 150 },
  back: { position: "absolute", left: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  editTop: { position: "absolute", right: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  profileTop: { alignItems: "center", marginTop: -52 },
  avatarWrap: { borderRadius: 60, padding: 4, backgroundColor: "transparent" },
  relBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: spacing.sm },
  starsPill: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 8, marginTop: spacing.md },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  detailsCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridItem: { width: "48.5%", aspectRatio: 1, borderRadius: radius.md, overflow: "hidden", marginBottom: spacing.sm },
  gridImg: { width: "100%", height: "100%", backgroundColor: "#EAE4D9" },
  gridText: { padding: spacing.md, justifyContent: "center", borderRadius: radius.md },
});
