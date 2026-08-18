import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { helperApi, setHelperToken } from "@/src/lib/helperApi";

function firstPhone(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/[+]?[\d][\d\s-]{6,}\d/);
  return m ? m[0].replace(/\s|-/g, "") : null;
}

export default function HelperMedical() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/medical");
      setCards(d.cards || []);
    } catch (e: any) {
      if (e?.status === 401) {
        await setHelperToken(null);
        router.replace("/helper-login");
      } else if (e?.status === 403) {
        router.back();
      }
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const call = (phone?: string | null) => {
    const p = firstPhone(phone);
    if (p) Linking.openURL(`tel:${p}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="medical-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18} style={{ flex: 1 }}>Medical Info</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.note, { backgroundColor: "#E86A6A18" }]}>
          <Ionicons name="medkit" size={16} color="#C24B4B" />
          <AppText size={13} color="#C24B4B" style={{ flex: 1 }}>
            For emergencies only. View-only — shared by the family for the children you look after.
          </AppText>
        </View>

        {cards.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🩺</AppText>
            <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
              No medical info shared yet.
            </AppText>
          </View>
        ) : (
          cards.map((card) => {
            const ecPhone = firstPhone(card.emergency_contact);
            return (
              <View key={card.member.member_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`medcard-${card.member.member_id}`}>
                <View style={styles.cardHead}>
                  <Avatar name={card.member.name} uri={card.member.photo_url} size={44} color={card.member.color} />
                  <AppText family="display" weight="bold" size={17} style={{ flex: 1 }}>{card.member.name}</AppText>
                  {card.blood_group ? (
                    <View style={[styles.blood, { backgroundColor: "#E86A6A" }]}>
                      <AppText size={14} weight="bold" color="#fff">{card.blood_group}</AppText>
                    </View>
                  ) : null}
                </View>

                <Row c={c} icon="alert-circle" label="Allergies" value={card.allergies} danger />
                <Row c={c} icon="medical" label="Doctor" value={card.doctor} />
                <Row c={c} icon="business" label="Hospital" value={card.hospital} />
                <Row c={c} icon="call" label="Emergency contact" value={card.emergency_contact} />

                {ecPhone ? (
                  <Pressable onPress={() => call(card.emergency_contact)} style={[styles.callBtn, { backgroundColor: c.success }]} testID={`medcall-${card.member.member_id}`}>
                    <Ionicons name="call" size={16} color="#fff" />
                    <AppText size={14} weight="bold" color="#fff">Call emergency contact</AppText>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
        {Platform.OS === "web" ? (
          <AppText size={12} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.md }}>
            Tap-to-call works on your phone.
          </AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ c, icon, label, value, danger }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={danger && value ? "#C24B4B" : c.onSurfaceTertiary} />
      <View style={{ flex: 1 }}>
        <AppText size={12} color={c.onSurfaceTertiary}>{label}</AppText>
        <AppText size={15} color={value ? c.onSurface : c.onSurfaceTertiary} weight={danger && value ? "bold" : "regular"}>
          {value || "Not provided"}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  note: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  blood: { minWidth: 44, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)" },
  callBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, paddingVertical: spacing.md, marginTop: spacing.md },
});
