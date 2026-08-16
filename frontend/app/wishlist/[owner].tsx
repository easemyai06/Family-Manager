import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { categoryMeta, occasionMeta, priorityMeta, STATUS_META } from "@/src/lib/wishMeta";

export default function OwnerWishlist() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { owner } = useLocalSearchParams<{ owner: string }>();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/wishlists/${owner}`));
    } catch {}
  }, [owner]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const title = data?.is_family ? "Family Wishlist" : data?.owner_member ? `${data.owner_member.name}'s Wishlist` : "Wishlist";

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="owner-wishlist-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, justifyContent: "center" }}>
          {data?.owner_member ? <Avatar uri={data.owner_member.photo_url} name={data.owner_member.name} size={26} color={data.owner_member.color} /> : <AppText size={18}>🎁</AppText>}
          <AppText family="display" weight="bold" size={18} numberOfLines={1}>
            {title}
          </AppText>
        </View>
        {data?.can_add ? (
          <Pressable onPress={() => router.push(`/wishlist/create?owner=${owner}`)} hitSlop={12} testID="add-wish-btn">
            <Ionicons name="add" size={28} color={c.brand} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {!data ? null : data.items.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={44}>🎁</AppText>
            <AppText family="display" weight="bold" size={17} center style={{ marginTop: spacing.md }}>
              No wishes yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              {data.can_add ? "Tap + to add the first wish" : "Nothing on this list right now"}
            </AppText>
          </View>
        ) : (
          data.items.map((it: any) => {
            const occ = occasionMeta(it.occasion);
            const cat = categoryMeta(it.category);
            const st = STATUS_META[it.status] || STATUS_META.wished;
            return (
              <Pressable
                key={it.wish_id}
                onPress={() => router.push(`/wishlist/item/${it.wish_id}`)}
                style={[styles.card, { backgroundColor: c.surface, borderColor: it.is_reserved ? st.color : c.border }, shadow(1)]}
                testID={`wishitem-${it.wish_id}`}
              >
                <View style={styles.cardTop}>
                  {it.photo_url ? (
                    <SmartImage uri={it.photo_url} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <AppText size={26}>{cat?.emoji || "🎁"}</AppText>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AppText family="display" weight="bold" size={16} numberOfLines={2}>
                      {it.name}
                    </AppText>
                    <View style={styles.metaRow}>
                      {it.price ? (
                        <AppText size={14} weight="bold" color={c.brand}>
                          {it.price}
                        </AppText>
                      ) : null}
                      <AppText size={12}>{priorityMeta(it.priority).stars}</AppText>
                    </View>
                    <View style={styles.chipRow}>
                      {occ ? (
                        <View style={[styles.chip, { backgroundColor: c.surfaceTertiary }]}>
                          <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
                            {occ.emoji} {occ.label}
                          </AppText>
                        </View>
                      ) : null}
                      {cat && cat.key !== occ?.key ? (
                        <View style={[styles.chip, { backgroundColor: c.surfaceTertiary }]}>
                          <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
                            {cat.emoji} {cat.label}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                {(it.size || it.color) ? (
                  <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
                    {[it.size ? `Size ${it.size}` : null, it.color ? `Colour ${it.color}` : null].filter(Boolean).join("  ·  ")}
                  </AppText>
                ) : null}
                {it.is_reserved ? (
                  <View style={[styles.reservedBar, { backgroundColor: st.color + "22" }]}>
                    <AppText size={12} weight="bold" color={st.color}>
                      {st.emoji} {it.reserved_by ? `${it.reserved_by.name} is getting this` : st.label} — hidden from them 🤫
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  card: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  reservedBar: { marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
