import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { vaultSession } from "@/src/lib/vaultSession";

export default function VaultFolder() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!vaultSession.isUnlocked()) {
      router.replace("/vault");
      return;
    }
    vaultSession.touch();
    try {
      setItems(await api(`/vault/items?folder_id=${id}`));
    } catch {}
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="vault-folder-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19} numberOfLines={1}>
          {name || "Folder"}
        </AppText>
        <Pressable onPress={() => router.push(`/vault/create?folder_id=${id}`)} hitSlop={12} testID="vault-folder-add">
          <Ionicons name="add" size={28} color={c.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🔐</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.md }}>
              Nothing here yet — tap + to add a document or policy
            </AppText>
          </View>
        ) : (
          items.map((it) => {
            const isIns = it.kind === "insurance";
            const days = it.days_until_expiry;
            return (
              <Pressable key={it.item_id} onPress={() => router.push(`/vault/item/${it.item_id}`)} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`vault-item-${it.item_id}`}>
                <View style={[styles.icon, { backgroundColor: isIns ? "#7FA9C922" : "#8AB07D22" }]}>
                  <Ionicons name={isIns ? "shield-checkmark" : "document-text"} size={22} color={isIns ? "#5A87AB" : "#6B8E5A"} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                    {it.title}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>
                    {isIns ? it.provider || "Insurance" : it.owner?.name ? `${it.owner.name}'s document` : "Document"}
                    {it.files?.length ? `  ·  📎 ${it.files.length}` : ""}
                  </AppText>
                </View>
                {days != null ? (
                  <View style={[styles.expChip, { backgroundColor: days <= 30 ? "#E8A33D22" : c.surfaceTertiary }]}>
                    <AppText size={11} weight="bold" color={days <= 30 ? "#C57F1E" : c.onSurfaceTertiary}>
                      {days < 0 ? "expired" : `${days}d`}
                    </AppText>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  expChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
