import React, { useCallback, useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const PRIORITY_COLOR: Record<string, string> = { high: "#E05757", normal: "#A3B18A", low: "#B5835A" };

export default function TodoItems() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api(`/todos/lists/${id}/items`));
    } catch {}
  }, [id]);

  useEffect(() => {
    api("/families/members").then(setMembers).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = async () => {
    if (!text.trim()) return;
    const item = await api(`/todos/lists/${id}/items`, {
      method: "POST",
      body: { title: text.trim(), priority, assignee_member_id: assignee },
    });
    setItems((prev) => [...prev, item]);
    setText("");
    setPriority("normal");
    setAssignee(null);
  };

  const toggle = async (item: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.map((i) => (i.item_id === item.item_id ? { ...i, done: !i.done } : i)));
    await api(`/todos/items/${item.item_id}/toggle`, { method: "POST" });
  };

  const del = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.item_id !== itemId));
    await api(`/todos/items/${itemId}`, { method: "DELETE" });
  };

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const Row = ({ item }: { item: any }) => (
    <View style={[styles.row, { borderBottomColor: c.divider }]} testID={`todo-${item.item_id}`}>
      <Pressable onPress={() => toggle(item)} hitSlop={8} testID={`todo-toggle-${item.item_id}`}>
        <View style={[styles.checkbox, { borderColor: item.done ? c.success : c.borderStrong, backgroundColor: item.done ? c.success : "transparent" }]}>
          {item.done ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
        </View>
      </Pressable>
      {!item.done && item.priority === "high" ? <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR.high }]} /> : null}
      <AppText size={15} weight="semibold" style={{ flex: 1, textDecorationLine: item.done ? "line-through" : "none", color: item.done ? c.onSurfaceTertiary : c.onSurface }}>
        {item.title}
      </AppText>
      {item.assignee ? <Avatar uri={item.assignee.photo_url} name={item.assignee.name} size={24} color={item.assignee.color} /> : null}
      <Pressable onPress={() => del(item.item_id)} hitSlop={8} testID={`del-todo-${item.item_id}`}>
        <Ionicons name="trash-outline" size={17} color={c.onSurfaceTertiary} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="todoitems-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20} numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {name || "To-Do"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={[styles.addCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={styles.addRow}>
            <View style={{ flex: 1 }}>
              <TextField placeholder="Add a task…" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" testID="task-title-input" />
            </View>
            <Pressable onPress={add} style={[styles.addBtn, { backgroundColor: c.brand }]} testID="add-task-btn">
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.optionsRow}>
            <Pressable
              onPress={() => setPriority((p) => (p === "high" ? "normal" : "high"))}
              style={[styles.optChip, { backgroundColor: priority === "high" ? PRIORITY_COLOR.high + "22" : c.surfaceSecondary }]}
              testID="priority-toggle"
            >
              <Ionicons name="flag" size={14} color={priority === "high" ? PRIORITY_COLOR.high : c.onSurfaceTertiary} />
              <AppText size={12} weight="semibold" color={priority === "high" ? PRIORITY_COLOR.high : c.onSurfaceTertiary}>
                High
              </AppText>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }}>
              {members.map((m) => (
                <Pressable key={m.member_id} onPress={() => setAssignee((a) => (a === m.member_id ? null : m.member_id))} style={{ opacity: assignee === m.member_id ? 1 : 0.45 }} testID={`assign-${m.member_id}`}>
                  <Avatar uri={m.photo_url} name={m.name} size={30} color={m.color} ring={assignee === m.member_id} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>✅</AppText>
            <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
              No tasks yet — add your first one
            </AppText>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            {pending.map((item) => (
              <Row key={item.item_id} item={item} />
            ))}
            {done.length > 0 ? (
              <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
                COMPLETED ({done.length})
              </AppText>
            ) : null}
            {done.map((item) => (
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
  addCard: { borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.lg },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  addBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  optionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  optChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  listCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
