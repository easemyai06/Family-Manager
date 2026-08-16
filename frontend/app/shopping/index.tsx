import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const CAT_ICON: Record<string, string> = { Grocery: "🛒", Pharmacy: "💊", School: "🎒", Household: "🏠", Gifts: "🎁" };

export default function ShoppingLists() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      setLists(await api("/shopping/lists"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!name.trim()) return;
    await api("/shopping/lists", { method: "POST", body: { name: name.trim(), category: name.trim() } });
    setName("");
    setAdding(false);
    load();
  };

  const del = async (id: string) => {
    setLists((prev) => prev.filter((l) => l.list_id !== id));
    await api(`/shopping/lists/${id}`, { method: "DELETE" });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="shopping-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Shopping Lists
        </AppText>
        <Pressable onPress={() => setAdding((a) => !a)} hitSlop={12} testID="toggle-add-list">
          <Ionicons name={adding ? "close" : "add"} size={26} color={c.brand} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {adding ? (
          <View style={[styles.addCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            <TextField placeholder="List name, e.g. Grocery" value={name} onChangeText={setName} testID="list-name-input" />
            <Button label="Create List" onPress={add} style={{ marginTop: spacing.md }} testID="create-list-btn" />
          </View>
        ) : null}

        {lists.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🛒</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No lists yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Add a list and shop together in real-time
            </AppText>
          </View>
        ) : (
          lists.map((l) => {
            const pct = l.total ? l.done / l.total : 0;
            return (
              <Pressable
                key={l.list_id}
                onPress={() => router.push(`/shopping/${l.list_id}?name=${encodeURIComponent(l.name)}`)}
                style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                testID={`shopping-list-${l.list_id}`}
              >
                <View style={[styles.listIcon, { backgroundColor: c.brandTertiary }]}>
                  <AppText size={22}>{CAT_ICON[l.category] || "🛍️"}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16}>
                    {l.name}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {l.done}/{l.total} bought
                  </AppText>
                  <View style={[styles.progressTrack, { backgroundColor: c.surfaceTertiary }]}>
                    <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: c.success }]} />
                  </View>
                </View>
                <Pressable onPress={() => del(l.list_id)} hitSlop={8} testID={`del-list-${l.list_id}`}>
                  <Ionicons name="trash-outline" size={18} color={c.onSurfaceTertiary} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  addCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.lg },
  listCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.md },
  listIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
