import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { vaultSession } from "@/src/lib/vaultSession";
import { VaultGate } from "@/src/components/VaultGate";

function expiryColor(days: number | null, c: any) {
  if (days == null) return c.onSurfaceTertiary;
  if (days <= 15) return "#E86A6A";
  if (days <= 30) return "#E8A33D";
  if (days <= 60) return "#D98E5A";
  return "#8AB07D";
}

export default function VaultHome() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [unlocked, setUnlocked] = useState(vaultSession.isUnlocked());
  const [folders, setFolders] = useState<any[]>([]);
  const [expiries, setExpiries] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [f, e] = await Promise.all([api("/vault/folders"), api("/vault/expiries?days=90")]);
      setFolders(f);
      setExpiries(e);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (vaultSession.isUnlocked()) {
        setUnlocked(true);
        vaultSession.touch();
        load();
      }
    }, [load])
  );

  if (!unlocked) {
    return (
      <VaultGate
        onUnlocked={() => {
          vaultSession.unlock();
          setUnlocked(true);
          load();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="vault-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Family Vault 🔐
        </AppText>
        <Pressable
          onPress={() => {
            vaultSession.lock();
            setUnlocked(false);
          }}
          hitSlop={12}
          testID="vault-lock-btn"
          accessibilityRole="button"
          accessibilityLabel="Lock the vault"
        >
          <Ionicons name="lock-closed" size={22} color={c.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        {expiries.length > 0 ? (
          <View style={{ marginBottom: spacing.xl }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              ⏰ UPCOMING EXPIRIES
            </AppText>
            {expiries.map((e) => {
              const col = expiryColor(e.days_until_expiry, c);
              return (
                <Pressable
                  key={e.item_id}
                  onPress={() => router.push(`/vault/item/${e.item_id}`)}
                  style={[styles.expRow, { backgroundColor: c.surface, borderLeftColor: col }, shadow(1)]}
                  testID={`expiry-${e.item_id}`}
                >
                  <View style={{ flex: 1 }}>
                    <AppText family="display" weight="bold" size={15} numberOfLines={2}>
                      {e.title}
                    </AppText>
                    <AppText size={12} color={c.onSurfaceTertiary}>
                      Expires {e.expiry_date}
                    </AppText>
                  </View>
                  <View style={[styles.dayPill, { backgroundColor: col + "22" }]}>
                    <AppText size={13} weight="bold" color={col}>
                      {e.days_until_expiry}d
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
          FOLDERS
        </AppText>
        <View style={styles.grid}>
          {folders.map((f) => (
            <Pressable
              key={f.folder_id}
              onPress={() => router.push(`/vault/folder/${f.folder_id}?name=${encodeURIComponent(f.name)}`)}
              style={[styles.folder, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              testID={`vault-folder-${f.folder_id}`}
            >
              <View style={[styles.folderIcon, { backgroundColor: c.brandTertiary }]}>
                <Ionicons name={(f.icon || "folder") as any} size={22} color={c.brand} />
              </View>
              <AppText family="display" weight="bold" size={15} numberOfLines={2}>
                {f.name}
              </AppText>
              <AppText size={12} color={c.onSurfaceTertiary}>
                {f.count} item{f.count === 1 ? "" : "s"}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Pressable onPress={() => router.push("/vault/create")} style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]} testID="vault-add-btn" accessibilityRole="button" accessibilityLabel="Add to vault">
        <Ionicons name="add" size={26} color="#fff" />
        <AppText size={14} weight="bold" color="#fff">
          Add to Vault
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  expRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderLeftWidth: 4, padding: spacing.md, marginBottom: spacing.sm },
  dayPill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  folder: { width: "47%", borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 4 },
  folderIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  fab: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
