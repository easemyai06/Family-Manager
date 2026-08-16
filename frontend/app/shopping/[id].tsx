import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function ShoppingItems() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api(`/shopping/lists/${id}/items`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!text.trim()) return;
    const item = await api(`/shopping/lists/${id}/items`, { method: "POST", body: { name: text.trim(), quantity: qty.trim() || null } });
    setItems((prev) => [...prev, item]);
    setText("");
    setQty("");
  };

  const toggle = async (item: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.map((i) => (i.item_id === item.item_id ? { ...i, checked: !i.checked } : i)));
    await api(`/shopping/items/${item.item_id}/toggle`, { method: "POST" });
  };

  const del = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.item_id !== itemId));
    await api(`/shopping/items/${itemId}`, { method: "DELETE" });
  };

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  const Row = ({ item }: { item: any }) => (
    <View style={[styles.row, { borderBottomColor: c.divider }]} testID={`item-${item.item_id}`}>
      <Pressable onPress={() => toggle(item)} hitSlop={8} testID={`toggle-${item.item_id}`}>
        <View style={[styles.checkbox, { borderColor: item.checked ? c.success : c.borderStrong, backgroundColor: item.checked ? c.success : "transparent" }]}>
          {item.checked ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <AppText size={15} weight="semibold" style={{ textDecorationLine: item.checked ? "line-through" : "none", color: item.checked ? c.onSurfaceTertiary : c.onSurface }}>
          {item.name}
        </AppText>
        {item.quantity ? (
          <AppText size={12} color={c.onSurfaceTertiary}>
            {item.quantity}
            {item.added_by ? ` · added by ${item.added_by}` : ""}
          </AppText>
        ) : null}
      </View>
      <Pressable onPress={() => del(item.item_id)} hitSlop={8} testID={`del-item-${item.item_id}`}>
        <Ionicons name="trash-outline" size={17} color={c.onSurfaceTertiary} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="items-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20} numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {name || "Shopping"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={[styles.addRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={{ flex: 1 }}>
            <TextField placeholder="Add an item…" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" testID="item-name-input" />
          </View>
          <View style={{ width: 74 }}>
            <TextField placeholder="Qty" value={qty} onChangeText={setQty} testID="item-qty-input" />
          </View>
          <Pressable onPress={add} style={[styles.addBtn, { backgroundColor: c.brand }]} testID="add-item-btn">
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🧺</AppText>
            <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
              Nothing here yet — add your first item
            </AppText>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            {unchecked.map((item) => (
              <Row key={item.item_id} item={item} />
            ))}
            {checked.length > 0 ? (
              <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
                DONE ({checked.length})
              </AppText>
            ) : null}
            {checked.map((item) => (
              <Row key={item.item_id} item={item} />
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.lg },
  addBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  listCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
