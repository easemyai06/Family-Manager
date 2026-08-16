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
import { timeAgo } from "@/src/lib/time";
import { useAuth } from "@/src/auth/AuthContext";

const FIELDS: { key: string; label: string; icon: string }[] = [
  { key: "home_address", label: "Home address", icon: "home" },
  { key: "meeting_point", label: "Emergency meeting point", icon: "flag" },
  { key: "alt_meeting_point", label: "Alternate meeting point", icon: "flag-outline" },
  { key: "parent_numbers", label: "Parent contact numbers", icon: "call" },
  { key: "neighbour", label: "Trusted neighbour", icon: "people" },
  { key: "school_contact", label: "School contact", icon: "school" },
  { key: "doctor", label: "Family doctor", icon: "medkit" },
  { key: "hospital", label: "Preferred hospital", icon: "business" },
  { key: "insurance_number", label: "Insurance emergency no.", icon: "shield" },
  { key: "building_security", label: "Building security", icon: "lock-closed" },
  { key: "notes", label: "Notes", icon: "text" },
];

export default function FamilyPlan() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const canEdit = member && ["admin", "parent"].includes(member.role);
  const [plan, setPlan] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api("/emergency/plan");
      setPlan(p);
      setForm(p);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {};
      FIELDS.forEach((f) => (body[f.key] = (form[f.key] || "").trim() || null));
      const p = await api("/emergency/plan", { method: "PUT", body });
      setPlan(p);
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  const reviewed = plan.last_reviewed ? timeAgo(plan.last_reviewed) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="plan-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Family Plan
        </AppText>
        {canEdit && !editing ? (
          <Pressable onPress={() => setEditing(true)} hitSlop={12} testID="edit-plan-btn">
            <Ionicons name="create-outline" size={24} color={c.brand} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {reviewed ? (
          <View style={[styles.reviewChip, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="time-outline" size={16} color={c.onSurfaceTertiary} />
            <AppText size={12} color={c.onSurfaceTertiary}>
              Last reviewed {reviewed}
            </AppText>
          </View>
        ) : null}

        {editing ? (
          <>
            {FIELDS.map((f) => (
              <View key={f.key} style={{ marginTop: spacing.md }}>
                <TextField label={f.label} icon={f.icon as any} value={form[f.key] || ""} onChangeText={(v) => setForm((p: any) => ({ ...p, [f.key]: v }))} testID={`plan-${f.key}`} />
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
              <Pressable onPress={() => { setEditing(false); setForm(plan); }} style={[styles.cancel, { borderColor: c.border }]}>
                <AppText size={15} weight="bold" color={c.onSurfaceSecondary}>
                  Cancel
                </AppText>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button label="Save Plan" onPress={save} loading={saving} testID="save-plan-btn" />
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            {FIELDS.filter((f) => plan[f.key]).map((f, i, arr) => (
              <View key={f.key} style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                <Ionicons name={f.icon as any} size={18} color={c.brand} />
                <View style={{ flex: 1 }}>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {f.label}
                  </AppText>
                  <AppText size={15} weight="semibold">
                    {plan[f.key]}
                  </AppText>
                </View>
              </View>
            ))}
            {FIELDS.every((f) => !plan[f.key]) ? (
              <AppText size={13} color={c.onSurfaceTertiary} style={{ padding: spacing.lg }}>
                {canEdit ? "Tap edit to fill in your family emergency plan." : "No plan set yet."}
              </AppText>
            ) : null}
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  reviewChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  cancel: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, paddingVertical: spacing.md },
});
