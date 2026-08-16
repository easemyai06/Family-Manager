import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { callNumber, openWhatsApp } from "@/src/lib/dial";

export default function EmergencyContacts() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setContacts(await api("/emergency/contacts"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const critical = contacts.filter((c2) => c2.critical);
  const others = contacts.filter((c2) => !c2.critical);

  const Row = ({ ct }: { ct: any }) => (
    <Pressable
      onPress={() => router.push(`/emergency/contact-edit?id=${ct.contact_id}`)}
      style={[styles.row, { backgroundColor: c.surface, borderColor: ct.critical ? "#E86A6A" : c.border }, shadow(1)]}
      testID={`contact-${ct.contact_id}`}
    >
      <AppText size={26}>{ct.icon || "📞"}</AppText>
      <View style={{ flex: 1 }}>
        <AppText family="display" weight="bold" size={16} numberOfLines={1}>
          {ct.critical ? "⭐ " : ""}{ct.name}
        </AppText>
        <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>
          {ct.relationship ? `${ct.relationship} · ` : ""}{ct.phone}
        </AppText>
      </View>
      {ct.whatsapp ? (
        <Pressable onPress={() => openWhatsApp(ct.whatsapp)} hitSlop={8} style={styles.waBtn} testID={`wa-${ct.contact_id}`}>
          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
        </Pressable>
      ) : null}
      <Pressable onPress={() => callNumber(ct.phone)} style={styles.callBtn} testID={`call-${ct.contact_id}`}>
        <Ionicons name="call" size={18} color="#fff" />
        <AppText size={14} weight="bold" color="#fff">
          Call
        </AppText>
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="contacts-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Contacts & Numbers
        </AppText>
        <Pressable onPress={() => router.push("/emergency/contact-edit")} hitSlop={12} testID="add-contact-btn">
          <Ionicons name="add" size={28} color={c.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {critical.length > 0 ? (
          <>
            <AppText size={12} weight="bold" color="#C74B4B" style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              ⭐ CRITICAL
            </AppText>
            {critical.map((ct) => (
              <Row key={ct.contact_id} ct={ct} />
            ))}
          </>
        ) : null}
        {others.length > 0 ? (
          <>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm }}>
              OTHER CONTACTS
            </AppText>
            {others.map((ct) => (
              <Row key={ct.contact_id} ct={ct} />
            ))}
          </>
        ) : null}
        {contacts.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] }}>
            <AppText size={40}>📞</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
              Add your first emergency contact
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  waBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#25D36618" },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#4CAF50", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
