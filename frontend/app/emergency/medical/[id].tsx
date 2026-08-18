import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const FIELDS: { key: string; label: string; big?: boolean }[] = [
  { key: "blood_group", label: "Blood group", big: true },
  { key: "allergies", label: "Allergies", big: true },
  { key: "medication", label: "Important medication" },
  { key: "conditions", label: "Conditions" },
  { key: "doctor", label: "Doctor" },
  { key: "hospital", label: "Preferred hospital" },
  { key: "insurance_provider", label: "Insurance provider" },
  { key: "policy_reference", label: "Policy reference" },
  { key: "emergency_contact", label: "Emergency contact" },
];

export default function MedicalCard() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [card, setCard] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const canEdit = me && (me.member_id === id || ["admin", "parent"].includes(me.role));

  const load = useCallback(async () => {
    try {
      const d = await api(`/emergency/medical/${id}`);
      setCard(d);
      setForm(d);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    setSaving(true);
    try {
      const body: any = { member_id: id };
      FIELDS.forEach((f) => (body[f.key] = (form[f.key] || "").trim() || null));
      const d = await api(`/emergency/medical/${id}`, { method: "PUT", body });
      setCard(d);
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  if (!card) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const m = card.member || {};
  const hasAny = FIELDS.some((f) => card[f.key]);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="medcard-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          Medical Card
        </AppText>
        {canEdit && !editing ? (
          <Pressable onPress={() => setEditing(true)} hitSlop={12} testID="edit-medcard-btn">
            <Ionicons name="create-outline" size={24} color={c.brand} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={[styles.person, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <Avatar uri={m.photo_url} name={m.name} size={48} color={m.color} />
          <View>
            <AppText family="display" weight="bold" size={18}>
              {m.name}
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {m.relationship}
            </AppText>
          </View>
        </View>

        {card.detail_restricted && !editing ? (
          <View style={[styles.noteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="lock-closed" size={16} color={c.onSurfaceTertiary} />
            <AppText size={12} color={c.onSurfaceTertiary} style={{ flex: 1 }}>
              Detailed medical info is private — only {m.name?.split(" ")[0] || "they"}, parents and trusted contacts can view it.
            </AppText>
          </View>
        ) : null}

        {editing ? (
          <>
            {FIELDS.map((f) => (
              <View key={f.key} style={{ marginTop: spacing.md }}>
                <TextField label={f.label} value={form[f.key] || ""} onChangeText={(v) => setForm((p: any) => ({ ...p, [f.key]: v }))} testID={`medcard-${f.key}`} />
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
              <Pressable onPress={() => { setEditing(false); setForm(card); }} style={[styles.cancel, { borderColor: c.border }]}>
                <AppText size={15} weight="bold" color={c.onSurfaceSecondary}>
                  Cancel
                </AppText>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button label="Save Card" onPress={save} loading={saving} testID="save-medcard-btn" />
              </View>
            </View>
          </>
        ) : hasAny ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {FIELDS.filter((f) => f.big && card[f.key]).map((f) => (
                <View key={f.key} style={[styles.bigCard, { backgroundColor: c.surface, borderColor: "#E86A6A" }, shadow(1)]}>
                  <AppText size={12} weight="bold" color="#C74B4B" style={{ letterSpacing: 0.5 }}>
                    {f.label.toUpperCase()}
                  </AppText>
                  <AppText family="display" weight="bold" size={20} style={{ marginTop: 4 }}>
                    {card[f.key]}
                  </AppText>
                </View>
              ))}
            </View>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              {FIELDS.filter((f) => !f.big && card[f.key]).map((f, i, arr) => (
                <View key={f.key} style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                  <AppText size={13} color={c.onSurfaceTertiary}>
                    {f.label}
                  </AppText>
                  <AppText size={14} weight="semibold" style={{ flex: 1, textAlign: "right" }}>
                    {card[f.key]}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] }}>
            <AppText size={40}>🩺</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
              {canEdit ? "Tap edit to add medical info" : "No medical info added"}
            </AppText>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  noteCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  bigCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  cancel: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, paddingVertical: spacing.md },
});
