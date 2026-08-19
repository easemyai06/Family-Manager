import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, Linking } from "react-native";
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

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const COMMON_ALLERGIES = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Shellfish", "Fish", "Soy", "Wheat/Gluten", "Pollen", "Dust", "Penicillin", "Bee stings", "Latex", "Pet dander"];
const INSURANCE_TYPES: { key: string; label: string; icon: string }[] = [
  { key: "health", label: "Health insurance", icon: "medkit-outline" },
  { key: "critical", label: "Critical illness", icon: "pulse-outline" },
  { key: "term", label: "Term life", icon: "shield-checkmark-outline" },
  { key: "vehicle", label: "Vehicle insurance", icon: "car-outline" },
];
const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: "medication", label: "Important medication" },
  { key: "conditions", label: "Conditions" },
  { key: "hospital", label: "Preferred hospital" },
  { key: "emergency_contact", label: "Emergency contact" },
];

function parseAllergies(raw?: string): { picks: string[]; custom: string[] } {
  const parts = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  const picks: string[] = [];
  const custom: string[] = [];
  for (const p of parts) {
    const match = COMMON_ALLERGIES.find((a) => a.toLowerCase() === p.toLowerCase());
    if (match) picks.push(match);
    else custom.push(p);
  }
  return { picks, custom };
}

export default function MedicalCard() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [card, setCard] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [allergyPicks, setAllergyPicks] = useState<string[]>([]);
  const [allergyCustom, setAllergyCustom] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [insurance, setInsurance] = useState<Record<string, { provider: string; policy_number: string; phone: string }>>({});
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

  const beginEdit = () => {
    setForm({ ...card });
    const a = parseAllergies(card.allergies);
    setAllergyPicks(a.picks);
    setAllergyCustom(a.custom);
    setCustomInput("");
    const ins: any = {};
    INSURANCE_TYPES.forEach((t) => {
      const found = (card.insurance || []).find((x: any) => x.type === t.key) || {};
      ins[t.key] = { provider: found.provider || "", policy_number: found.policy_number || "", phone: found.phone || "" };
    });
    setInsurance(ins);
    setEditing(true);
  };

  const toggleAllergy = (a: string) =>
    setAllergyPicks((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  const addCustomAllergy = () => {
    const v = customInput.trim();
    if (!v) return;
    if (![...allergyPicks, ...allergyCustom].some((x) => x.toLowerCase() === v.toLowerCase())) {
      setAllergyCustom((p) => [...p, v]);
    }
    setCustomInput("");
  };

  const setIns = (type: string, key: "provider" | "policy_number" | "phone", val: string) =>
    setInsurance((p) => ({ ...p, [type]: { ...(p[type] || { provider: "", policy_number: "", phone: "" }), [key]: val } }));

  const save = async () => {
    setSaving(true);
    try {
      const allergies = [...allergyPicks, ...allergyCustom].join(", ");
      const insList = INSURANCE_TYPES
        .map((t) => ({
          type: t.key,
          provider: (insurance[t.key]?.provider || "").trim() || null,
          policy_number: (insurance[t.key]?.policy_number || "").trim() || null,
          phone: (insurance[t.key]?.phone || "").trim() || null,
        }))
        .filter((x) => x.provider || x.policy_number || x.phone);
      const body: any = {
        member_id: id,
        blood_group: (form.blood_group || "").trim() || null,
        allergies: allergies || null,
        doctor: (form.doctor || "").trim() || null,
        doctor_phone: (form.doctor_phone || "").trim() || null,
        insurance: insList,
      };
      TEXT_FIELDS.forEach((f) => (body[f.key] = (form[f.key] || "").trim() || null));
      const d = await api(`/emergency/medical/${id}`, { method: "PUT", body });
      setCard(d);
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  if (!card) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const m = card.member || {};
  const cardAllergies = parseAllergies(card.allergies);
  const allAllergies = [...cardAllergies.picks, ...cardAllergies.custom];
  const cardInsurance = (card.insurance || []).filter((x: any) => x.provider || x.policy_number || x.phone);
  const hasAny = !!(card.blood_group || card.allergies || card.doctor || card.doctor_phone ||
    card.medication || card.conditions || card.hospital || card.emergency_contact || cardInsurance.length);

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
          <Pressable onPress={beginEdit} hitSlop={12} testID="edit-medcard-btn">
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
            {/* Blood group */}
            <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={styles.secLabel}>BLOOD GROUP</AppText>
            <View style={styles.chipWrap}>
              {BLOOD_GROUPS.map((bg) => {
                const on = form.blood_group === bg;
                return (
                  <Pressable key={bg} onPress={() => setForm((p: any) => ({ ...p, blood_group: on ? "" : bg }))}
                    style={[styles.bgChip, { backgroundColor: on ? "#E86A6A" : c.surface, borderColor: on ? "#E86A6A" : c.border }]} testID={`bg-${bg}`}>
                    <AppText size={15} weight="bold" color={on ? "#fff" : c.onSurface}>{bg}</AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Allergies */}
            <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={styles.secLabel}>ALLERGIES</AppText>
            <View style={styles.chipWrap}>
              {COMMON_ALLERGIES.map((a) => {
                const on = allergyPicks.includes(a);
                return (
                  <Pressable key={a} onPress={() => toggleAllergy(a)}
                    style={[styles.pill, { backgroundColor: on ? c.brand : c.surface, borderColor: on ? c.brand : c.border }]} testID={`allergy-${a}`}>
                    <AppText size={13} weight="semibold" color={on ? "#fff" : c.onSurfaceSecondary}>{a}</AppText>
                  </Pressable>
                );
              })}
              {allergyCustom.map((a) => (
                <Pressable key={a} onPress={() => setAllergyCustom((p) => p.filter((x) => x !== a))}
                  style={[styles.pill, { backgroundColor: c.brand, borderColor: c.brand, flexDirection: "row", gap: 4 }]}>
                  <AppText size={13} weight="semibold" color="#fff">{a}</AppText>
                  <Ionicons name="close" size={13} color="#fff" />
                </Pressable>
              ))}
            </View>
            <View style={styles.customRow}>
              <View style={{ flex: 1 }}>
                <TextField label="" value={customInput} onChangeText={setCustomInput} placeholder="Other allergy…" onSubmitEditing={addCustomAllergy} returnKeyType="done" testID="allergy-custom-input" />
              </View>
              <Pressable onPress={addCustomAllergy} style={[styles.addBtn, { backgroundColor: c.brandTertiary }]} testID="allergy-add">
                <Ionicons name="add" size={20} color={c.onBrandTertiary} />
              </Pressable>
            </View>

            {/* Doctor */}
            <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={styles.secLabel}>DOCTOR</AppText>
            <TextField label="Doctor's name" value={form.doctor || ""} onChangeText={(v) => setForm((p: any) => ({ ...p, doctor: v }))} testID="medcard-doctor" />
            <View style={{ marginTop: spacing.md }}>
              <TextField label="Doctor's phone" value={form.doctor_phone || ""} onChangeText={(v) => setForm((p: any) => ({ ...p, doctor_phone: v }))} keyboardType="phone-pad" testID="medcard-doctor_phone" />
            </View>

            {/* Insurance */}
            <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={styles.secLabel}>INSURANCE</AppText>
            {INSURANCE_TYPES.map((t) => (
              <View key={t.key} style={[styles.insCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.insHead}>
                  <Ionicons name={t.icon as any} size={18} color={c.brand} />
                  <AppText size={14} weight="bold">{t.label}</AppText>
                </View>
                <TextField label="Provider" value={insurance[t.key]?.provider || ""} onChangeText={(v) => setIns(t.key, "provider", v)} testID={`ins-${t.key}-provider`} />
                <View style={{ marginTop: spacing.sm }}>
                  <TextField label="Policy number" value={insurance[t.key]?.policy_number || ""} onChangeText={(v) => setIns(t.key, "policy_number", v)} testID={`ins-${t.key}-policy`} />
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <TextField label="Phone (optional)" value={insurance[t.key]?.phone || ""} onChangeText={(v) => setIns(t.key, "phone", v)} keyboardType="phone-pad" testID={`ins-${t.key}-phone`} />
                </View>
              </View>
            ))}

            {/* Other text fields */}
            <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={styles.secLabel}>OTHER</AppText>
            {TEXT_FIELDS.map((f) => (
              <View key={f.key} style={{ marginTop: spacing.md }}>
                <TextField label={f.label} value={form[f.key] || ""} onChangeText={(v) => setForm((p: any) => ({ ...p, [f.key]: v }))} testID={`medcard-${f.key}`} />
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
              <Pressable onPress={() => { setEditing(false); setForm(card); }} style={[styles.cancel, { borderColor: c.border }]}>
                <AppText size={15} weight="bold" color={c.onSurfaceSecondary}>Cancel</AppText>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button label="Save Card" onPress={save} loading={saving} testID="save-medcard-btn" />
              </View>
            </View>
          </>
        ) : hasAny ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            {(card.blood_group || allAllergies.length) ? (
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                {card.blood_group ? (
                  <View style={[styles.bigCard, { backgroundColor: c.surface, borderColor: "#E86A6A" }, shadow(1)]}>
                    <AppText size={12} weight="bold" color="#C74B4B" style={{ letterSpacing: 0.5 }}>BLOOD GROUP</AppText>
                    <AppText family="display" weight="bold" size={22} style={{ marginTop: 4 }}>{card.blood_group}</AppText>
                  </View>
                ) : null}
                {allAllergies.length ? (
                  <View style={[styles.bigCard, { backgroundColor: c.surface, borderColor: "#E86A6A" }, shadow(1)]}>
                    <AppText size={12} weight="bold" color="#C74B4B" style={{ letterSpacing: 0.5 }}>ALLERGIES</AppText>
                    <View style={[styles.chipWrap, { marginTop: 6, gap: 5 }]}>
                      {allAllergies.map((a) => (
                        <View key={a} style={[styles.allergyTag, { backgroundColor: "#FBE9E9" }]}>
                          <AppText size={12} weight="bold" color="#C74B4B">{a}</AppText>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {(card.doctor || card.doctor_phone) ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <AppText size={13} color={c.onSurfaceTertiary}>Doctor</AppText>
                    <AppText size={15} weight="bold">{card.doctor || "—"}</AppText>
                    {card.doctor_phone ? <AppText size={13} color={c.onSurfaceSecondary}>{card.doctor_phone}</AppText> : null}
                  </View>
                  {card.doctor_phone ? (
                    <Pressable onPress={() => Linking.openURL(`tel:${card.doctor_phone}`)} style={[styles.callBtn, { backgroundColor: c.success }]} testID="call-doctor">
                      <Ionicons name="call" size={18} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {cardInsurance.length ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ marginBottom: spacing.sm, letterSpacing: 0.5 }}>INSURANCE</AppText>
                {cardInsurance.map((x: any, i: number) => {
                  const meta = INSURANCE_TYPES.find((t) => t.key === x.type);
                  return (
                    <View key={i} style={[styles.insRow, i < cardInsurance.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                      <Ionicons name={(meta?.icon || "shield-outline") as any} size={18} color={c.brand} />
                      <View style={{ flex: 1 }}>
                        <AppText size={14} weight="bold">{meta?.label || x.type}</AppText>
                        {x.provider ? <AppText size={13} color={c.onSurfaceSecondary}>{x.provider}</AppText> : null}
                        {x.policy_number ? <AppText size={12} color={c.onSurfaceTertiary}>Policy: {x.policy_number}</AppText> : null}
                      </View>
                      {x.phone ? (
                        <Pressable onPress={() => Linking.openURL(`tel:${x.phone}`)} hitSlop={8}>
                          <Ionicons name="call-outline" size={18} color={c.brand} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {(card.medication || card.conditions || card.hospital || card.emergency_contact) ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                {TEXT_FIELDS.filter((f) => card[f.key]).map((f, i, arr) => (
                  <View key={f.key} style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                    <AppText size={13} color={c.onSurfaceTertiary}>{f.label}</AppText>
                    <AppText size={14} weight="semibold" style={{ flex: 1, textAlign: "right" }}>{card[f.key]}</AppText>
                  </View>
                ))}
              </View>
            ) : null}
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
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  cancel: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, paddingVertical: spacing.md },
  secLabel: { letterSpacing: 0.8, marginTop: spacing.xl, marginBottom: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bgChip: { width: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1.5, paddingVertical: 10 },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  allergyTag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  customRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
  addBtn: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  insCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  insHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  insRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
