import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function CapsuleDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [cap, setCap] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setCap(await api(`/capsules/${id}`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remove = () => {
    Alert.alert("Delete capsule?", "This time capsule will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/capsules/${id}`, { method: "DELETE" });
            router.back();
          } catch {}
        },
      },
    ]);
  };

  if (!cap) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const isAuthor = me?.member_id === cap.author?.member_id;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient
          colors={cap.is_locked ? ["#6E6A63", "#3A3833"] : ["#FF9E9E", "#FF6B6B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.md }]}
        >
          <View style={[styles.heroBar, { top: insets.top + spacing.sm }]}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.circleBtn} testID="capsule-detail-back">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            {isAuthor ? (
              <Pressable onPress={remove} hitSlop={12} style={styles.circleBtn} testID="capsule-delete">
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </Pressable>
            ) : (
              <View style={{ width: 38 }} />
            )}
          </View>
          <AppText size={44} style={{ marginTop: spacing.sm }}>
            {cap.is_locked ? "🔒" : "💌"}
          </AppText>
          <AppText family="display" weight="bold" size={22} color="#fff" center style={{ marginTop: spacing.sm }}>
            {cap.is_locked ? "Sealed until" : "Unlocked"}
          </AppText>
          <AppText size={14} color="rgba(255,255,255,0.92)" style={{ marginTop: 2 }}>
            {dayjs(cap.unlock_date).format("D MMMM YYYY")}
          </AppText>
        </LinearGradient>

        <View style={{ padding: spacing.lg }}>
          <View style={styles.byRow}>
            <Avatar uri={cap.author?.photo_url} name={cap.author?.name} size={40} color={cap.author?.color} ring />
            <View>
              <AppText size={12} color={c.onSurfaceTertiary}>
                Written by
              </AppText>
              <AppText family="display" weight="bold" size={15} color={cap.author?.color}>
                {cap.author?.name}
              </AppText>
            </View>
          </View>

          {cap.is_locked ? (
            <View style={[styles.lockedBox, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="hourglass-outline" size={40} color={c.onSurfaceTertiary} />
              <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.md }}>
                Opens in {cap.days_until} {cap.days_until === 1 ? "day" : "days"}
              </AppText>
              <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
                The message is kept a secret until {dayjs(cap.unlock_date).format("D MMM YYYY")}. Good things are worth the wait ✨
              </AppText>
            </View>
          ) : (
            <>
              <View style={[styles.messageBox, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                <AppText size={16} color={c.onSurface} style={{ lineHeight: 25 }}>
                  {cap.message}
                </AppText>
              </View>
              {cap.media?.length ? (
                <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                  {cap.media.map((img: any, i: number) => (
                    <SmartImage key={i} uri={img.url} style={{ width: "100%", height: width * 0.6, borderRadius: radius.lg, backgroundColor: "#EAE4D9" }} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", paddingBottom: spacing.xl, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  heroBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  byRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  lockedBox: { alignItems: "center", borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl, marginTop: spacing.lg },
  messageBox: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.lg },
});
