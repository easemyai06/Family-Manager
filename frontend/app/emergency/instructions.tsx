import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function EmergencyInstructions() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const canEdit = member && ["admin", "parent"].includes(member.role);
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api("/emergency/instructions"));
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
        <Pressable onPress={() => router.back()} hitSlop={12} testID="instructions-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          What To Do
        </AppText>
        {canEdit ? (
          <Pressable onPress={() => router.push("/emergency/instruction-edit")} hitSlop={12} testID="add-instruction-btn">
            <Ionicons name="add" size={28} color={c.brand} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const expanded = open === it.instruction_id;
          return (
            <View key={it.instruction_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              <Pressable onPress={() => setOpen(expanded ? null : it.instruction_id)} style={styles.cardHead} testID={`instruction-${it.instruction_id}`}>
                <AppText size={26}>{it.icon || "🚨"}</AppText>
                <AppText family="display" weight="bold" size={16} style={{ flex: 1 }}>
                  {it.title}
                </AppText>
                {canEdit ? (
                  <Pressable onPress={() => router.push(`/emergency/instruction-edit?id=${it.instruction_id}`)} hitSlop={8} testID={`edit-instruction-${it.instruction_id}`}>
                    <Ionicons name="create-outline" size={18} color={c.onSurfaceTertiary} />
                  </Pressable>
                ) : null}
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={c.onSurfaceTertiary} />
              </Pressable>
              {expanded ? (
                <View style={styles.steps}>
                  {(it.steps || []).map((s: string, i: number) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={[styles.stepNum, { backgroundColor: c.brand }]}>
                        <AppText size={12} weight="bold" color="#fff">
                          {i + 1}
                        </AppText>
                      </View>
                      <AppText size={14} style={{ flex: 1, lineHeight: 20 }}>
                        {s}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] }}>
            <AppText size={40}>🚨</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
              {canEdit ? "Add instructions for emergencies" : "No instructions yet"}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md, overflow: "hidden" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  steps: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
