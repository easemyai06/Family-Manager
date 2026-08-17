import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { baseOrderFor, rawOrder, SECTION_META, DashPrefs, EMPTY_PREFS } from "@/src/lib/dashboard";

export default function CustomizeDashboard() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();

  const [rows, setRows] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const base = baseOrderFor(member);
    try {
      const prefs = (await api<DashPrefs>("/dashboard/prefs")) || EMPTY_PREFS;
      setRows(rawOrder(base, prefs.order || []));
      setHidden(new Set(prefs.hidden || []));
      setPinned(new Set(prefs.pinned || []));
      setCompact(!!prefs.compact);
    } catch {
      setRows(base);
    }
  }, [member]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    setRows(next);
  };

  const toggleHidden = (k: string) => {
    const next = new Set(hidden);
    next.has(k) ? next.delete(k) : next.add(k);
    setHidden(next);
  };

  const togglePin = (k: string) => {
    const next = new Set(pinned);
    next.has(k) ? next.delete(k) : next.add(k);
    setPinned(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/dashboard/prefs", {
        method: "PUT",
        body: { order: rows, hidden: [...hidden], pinned: [...pinned], compact },
      });
      router.back();
    } catch {}
    setSaving(false);
  };

  const reset = async () => {
    const base = baseOrderFor(member);
    setRows(base);
    setHidden(new Set());
    setPinned(new Set());
    setCompact(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="customize-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>Customize Home</AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>Reorder, hide or pin your cards</AppText>
        </View>
        <Pressable onPress={reset} hitSlop={8} testID="customize-reset">
          <AppText size={13} weight="bold" color={c.brand}>Reset</AppText>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={[styles.compactCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={{ flex: 1 }}>
            <AppText size={15} weight="bold">Compact view</AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>Tighter cards, fewer preview rows</AppText>
          </View>
          <Switch value={compact} onValueChange={setCompact} trackColor={{ true: c.brand }} testID="customize-compact" />
        </View>

        <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          {rows.map((k, i) => {
            const meta = SECTION_META[k] || { label: k, emoji: "•" };
            const isHidden = hidden.has(k);
            const isPinned = pinned.has(k);
            return (
              <View
                key={k}
                style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }, isHidden && { opacity: 0.45 }]}
                testID={`customize-row-${k}`}
              >
                <AppText size={18}>{meta.emoji}</AppText>
                <AppText size={15} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{meta.label}</AppText>

                <Pressable onPress={() => togglePin(k)} hitSlop={6} style={styles.iconBtn} testID={`customize-pin-${k}`}>
                  <Ionicons name={isPinned ? "pin" : "pin-outline"} size={20} color={isPinned ? c.brand : c.onSurfaceTertiary} />
                </Pressable>
                <Pressable onPress={() => toggleHidden(k)} hitSlop={6} style={styles.iconBtn} testID={`customize-hide-${k}`}>
                  <Ionicons name={isHidden ? "eye-off" : "eye"} size={20} color={isHidden ? c.onSurfaceTertiary : c.success} />
                </Pressable>
                <Pressable onPress={() => move(i, -1)} hitSlop={6} style={styles.iconBtn} disabled={i === 0} testID={`customize-up-${k}`}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? c.surfaceTertiary : c.onSurface} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} hitSlop={6} style={styles.iconBtn} disabled={i === rows.length - 1} testID={`customize-down-${k}`}>
                  <Ionicons name="chevron-down" size={22} color={i === rows.length - 1 ? c.surfaceTertiary : c.onSurface} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: c.brand }]} testID="customize-save">
          <AppText size={15} weight="bold" color="#fff">{saving ? "Saving…" : "Save layout"}</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  compactCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  list: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  iconBtn: { padding: 4 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  saveBtn: { borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
});
