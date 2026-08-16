import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const ICONS = ["🔥", "🚑", "🧒", "🏠", "⚡", "💧", "🚨", "☎️"];

export default function InstructionEdit() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("🚨");
  const [steps, setSteps] = useState<string[]>(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      api("/emergency/instructions").then((list: any[]) => {
        const it = list.find((x) => x.instruction_id === id);
        if (it) {
          setTitle(it.title || "");
          setIcon(it.icon || "🚨");
          setSteps(it.steps?.length ? it.steps : [""]);
        }
      }).catch(() => {});
    }
  }, [id, editing]);

  const setStep = (i: number, v: string) => setSteps((p) => p.map((s, idx) => (idx === i ? v : s)));
  const addStep = () => setSteps((p) => [...p, ""]);
  const removeStep = (i: number) => setSteps((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Give this a title");
      return;
    }
    const body = { title: title.trim(), icon, steps: steps.map((s) => s.trim()).filter(Boolean), contact_ids: [] };
    setSaving(true);
    try {
      if (editing) await api(`/emergency/instructions/${id}`, { method: "PATCH", body });
      else await api("/emergency/instructions", { method: "POST", body });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete instruction?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/emergency/instructions/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-instruction-edit">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          {editing ? "Edit Instruction" : "New Instruction"}
        </AppText>
        {editing ? (
          <Pressable onPress={remove} hitSlop={12} testID="delete-instruction-btn">
            <Ionicons name="trash-outline" size={22} color={c.error} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={styles.emojiWrap}>
          {ICONS.map((e) => (
            <Pressable key={e} onPress={() => setIcon(e)} style={[styles.emoji, { backgroundColor: icon === e ? c.brandTertiary : c.surfaceSecondary, borderColor: icon === e ? c.brand : "transparent" }]} testID={`instruction-emoji-${e}`}>
              <AppText size={22}>{e}</AppText>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Title" placeholder="e.g. Fire" value={title} onChangeText={setTitle} testID="instruction-title-input" />
        </View>

        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Steps
        </AppText>
        {steps.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={{ flex: 1 }}>
              <TextField placeholder={`Step ${i + 1}`} value={s} onChangeText={(v) => setStep(i, v)} testID={`instruction-step-${i}`} />
            </View>
            <Pressable onPress={() => removeStep(i)} hitSlop={8} style={{ paddingBottom: 2 }} testID={`instruction-step-remove-${i}`}>
              <Ionicons name="remove-circle-outline" size={22} color={c.onSurfaceTertiary} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={addStep} style={[styles.addStep, { borderColor: c.border }]} testID="add-step-btn">
          <Ionicons name="add" size={18} color={c.brand} />
          <AppText size={14} weight="semibold" color={c.brand}>
            Add step
          </AppText>
        </Pressable>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="instruction-error">
            {error}
          </AppText>
        ) : null}
        <Button label={editing ? "Save Changes" : "Add Instruction"} onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-instruction-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emojiWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emoji: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  addStep: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", paddingVertical: spacing.md, marginTop: spacing.xs },
});
