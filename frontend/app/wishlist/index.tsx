import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function WishlistHub() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/wishlists"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="wishlist-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Wish Lists 🎁
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* shared family wishlist */}
        <Pressable onPress={() => router.push("/wishlist/family")} testID="wishlist-family" style={{ marginBottom: spacing.lg }}>
          <LinearGradient colors={["#E86A8C", "#FF9E9E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.familyCard, shadow(2)]}>
            <View style={styles.familyIcon}>
              <AppText size={30}>🏡</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={18} color="#fff">
                Family Wishlist
              </AppText>
              <AppText size={13} color="rgba(255,255,255,0.9)">
                Shared goals & things we all want
              </AppText>
            </View>
            <View style={styles.countPill}>
              <AppText size={14} weight="bold" color="#fff">
                {data?.family?.count ?? 0}
              </AppText>
            </View>
          </LinearGradient>
        </Pressable>

        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
          PERSONAL WISHLISTS
        </AppText>
        {(data?.members || []).map((m: any) => (
          <Pressable
            key={m.member.member_id}
            onPress={() => router.push(`/wishlist/${m.member.member_id}`)}
            style={[styles.memberCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`wishlist-member-${m.member.member_id}`}
          >
            <Avatar uri={m.member.photo_url} name={m.member.name} size={46} color={m.member.color} ring={m.is_me} />
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={16}>
                {m.is_me ? "My Wishlist" : `${m.member.name}'s Wishlist`}
              </AppText>
              <AppText size={12} color={c.onSurfaceTertiary}>
                {m.member.relationship}
              </AppText>
            </View>
            <View style={[styles.memberCount, { backgroundColor: c.brandTertiary }]}>
              <AppText size={13} weight="bold" color={c.brand}>
                {m.count}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  familyCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  familyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  countPill: { minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 8, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  memberCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  memberCount: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
});
