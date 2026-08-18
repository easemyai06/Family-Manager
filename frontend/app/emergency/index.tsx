import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, Linking } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { callNumber } from "@/src/lib/dial";

const SHORTCUTS = [
  { key: "contacts", label: "Contacts & Numbers", icon: "call", color: "#7FA9C9", route: "/emergency/contacts" },
  { key: "instructions", label: "What To Do", icon: "list", color: "#E8A33D", route: "/emergency/instructions" },
  { key: "plan", label: "Family Plan", icon: "home", color: "#8AB07D", route: "/emergency/plan" },
  { key: "medical", label: "Medical Cards", icon: "medkit", color: "#E86A6A", route: "/emergency/medical" },
  { key: "access", label: "Trusted Access", icon: "shield-checkmark", color: "#9B8AC9", route: "/emergency/access" },
];

export default function EmergencyHome() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [medical, setMedical] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [cs, a, md] = await Promise.all([
        api("/emergency/contacts"),
        api("/emergency/sos/active"),
        api("/emergency/medical"),
      ]);
      setContacts(cs);
      setActive(a);
      setMedical(md);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const critical = contacts.filter((c2) => c2.critical).slice(0, 3);
  const medicalKnown = medical.filter((m) => m.blood_group || m.allergies);

  const doSos = async () => {
    setConfirm(false);
    setSending(true);
    let coords: any = {};
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== "granted" && perm.canAskAgain) status = (await Location.requestForegroundPermissionsAsync()).status;
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {}
    try {
      await api("/emergency/sos", { method: "POST", body: coords });
      await load();
      setToast("🚨 SOS sent — your family has been alerted in the chat");
      setTimeout(() => setToast(""), 3000);
    } catch (e: any) {
      setToast(e.message || "Couldn't send SOS");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSending(false);
    }
  };

  const resolve = async (sos_id: string) => {
    try {
      await api(`/emergency/sos/${sos_id}/resolve`, { method: "POST" });
      load();
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="emergency-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Emergency 🚨
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {active.map((a) => (
          <View key={a.sos_id} style={[styles.activeAlert, shadow(2)]} testID={`active-sos-${a.sos_id}`}>
            <AppText size={14} weight="bold" color="#fff">
              🚨 {a.member_name} triggered an SOS
            </AppText>
            {(a.blood_group || a.allergies) ? (
              <View style={styles.sosMedRow}>
                {a.blood_group ? (
                  <View style={styles.sosMedChip}>
                    <Ionicons name="water" size={12} color="#fff" />
                    <AppText size={12} weight="bold" color="#fff">
                      {a.blood_group}
                    </AppText>
                  </View>
                ) : null}
                {a.allergies ? (
                  <View style={[styles.sosMedChip, { flexShrink: 1 }]}>
                    <Ionicons name="warning" size={12} color="#fff" />
                    <AppText size={12} weight="bold" color="#fff" numberOfLines={1}>
                      Allergies: {a.allergies}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
            {a.location ? (
              <Pressable onPress={() => Linking.openURL(a.location.maps_url)}>
                <AppText size={13} color="#fff" style={{ textDecorationLine: "underline", marginTop: 4 }}>
                  📍 View shared location
                </AppText>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable onPress={() => resolve(a.sos_id)} style={styles.resolveBtn} testID={`resolve-sos-${a.sos_id}`}>
                <AppText size={12} weight="bold" color="#C74B4B">
                  Mark safe
                </AppText>
              </Pressable>
            </View>
          </View>
        ))}

        {/* SOS button */}
        <Pressable onPress={() => setConfirm(true)} disabled={sending} testID="sos-button" accessibilityRole="button" accessibilityLabel="Send emergency SOS alert to your family">
          <LinearGradient colors={["#FF6B6B", "#D63A3A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sos, shadow(3)]}>
            <Ionicons name="warning" size={40} color="#fff" />
            <AppText family="display" weight="bold" size={26} color="#fff" style={{ marginTop: spacing.sm }}>
              {sending ? "Sending…" : "SOS"}
            </AppText>
            <AppText size={13} color="rgba(255,255,255,0.9)">
              Alert your whole family instantly
            </AppText>
          </LinearGradient>
        </Pressable>

        {/* quick call */}
        {critical.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              QUICK CALL
            </AppText>
            {critical.map((ct) => (
              <View key={ct.contact_id} style={[styles.callRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                <AppText size={26}>{ct.icon || "📞"}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16}>
                    {ct.name}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary}>
                    {ct.relationship} · {ct.phone}
                  </AppText>
                </View>
                <Pressable onPress={() => callNumber(ct.phone)} style={styles.callBtn} testID={`call-${ct.contact_id}`} accessibilityRole="button" accessibilityLabel={`Call ${ct.name}`}>
                  <Ionicons name="call" size={20} color="#fff" />
                  <AppText size={14} weight="bold" color="#fff">
                    Call
                  </AppText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* medical at a glance */}
        {medicalKnown.length > 0 ? (
          <View style={{ marginTop: spacing.xl }} testID="medical-quick-view">
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              MEDICAL AT A GLANCE
            </AppText>
            {medicalKnown.map((m) => (
              <Pressable
                key={m.member.member_id}
                onPress={() => router.push(`/emergency/medical/${m.member.member_id}`)}
                style={[styles.medRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                testID={`medquick-${m.member.member_id}`}
              >
                <Avatar uri={m.member.photo_url} name={m.member.name} size={40} color={m.member.color} />
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={15}>
                    {m.member.name}
                  </AppText>
                  {m.allergies ? (
                    <View style={styles.allergyRow}>
                      <Ionicons name="warning" size={13} color="#E86A6A" />
                      <AppText size={12} weight="semibold" color="#C74B4B" numberOfLines={1} style={{ flex: 1 }}>
                        Allergies: {m.allergies}
                      </AppText>
                    </View>
                  ) : (
                    <AppText size={12} color={c.onSurfaceTertiary}>No known allergies</AppText>
                  )}
                </View>
                {m.blood_group ? (
                  <View style={[styles.bloodBadge, { backgroundColor: "#E86A6A" }]}>
                    <AppText size={15} weight="bold" color="#fff">{m.blood_group}</AppText>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* shortcuts */}
        <View style={styles.grid}>
          {SHORTCUTS.map((s) => (
            <Pressable key={s.key} onPress={() => router.push(s.route as any)} style={[styles.shortcut, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`emergency-${s.key}`}>
              <View style={[styles.shortcutIcon, { backgroundColor: s.color + "22" }]}>
                <Ionicons name={s.icon as any} size={22} color={s.color} />
              </View>
              <AppText family="display" weight="bold" size={14}>
                {s.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 24 }, shadow(3)]} testID="sos-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {toast}
          </AppText>
        </View>
      ) : null}

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(false)}>
          <Pressable style={[styles.confirmCard, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.confirmIcon}>
              <Ionicons name="warning" size={34} color="#fff" />
            </View>
            <AppText family="display" weight="bold" size={19} center style={{ marginTop: spacing.md }}>
              Send a Family SOS?
            </AppText>
            <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: 6 }}>
              This alerts everyone in your family right away, in the family chat.
            </AppText>
            <Pressable onPress={doSos} style={[styles.confirmSend, { backgroundColor: "#D63A3A" }]} testID="sos-confirm">
              <AppText size={16} weight="bold" color="#fff">
                Send SOS 🚨
              </AppText>
            </Pressable>
            <Pressable onPress={() => setConfirm(false)} style={styles.confirmCancel} testID="sos-cancel">
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>
                Cancel
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  activeAlert: { backgroundColor: "#C74B4B", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  resolveBtn: { backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  sos: { borderRadius: radius.lg, alignItems: "center", paddingVertical: spacing["3xl"] },
  callRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#4CAF50", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  medRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  sosMedRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  sosMedChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  allergyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  bloodBadge: { minWidth: 44, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xl },
  shortcut: { width: "47%", borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  shortcutIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmCard: { width: "100%", maxWidth: 360, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  confirmIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#D63A3A", alignItems: "center", justifyContent: "center" },
  confirmSend: { alignSelf: "stretch", borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.xl },
  confirmCancel: { alignSelf: "stretch", paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.xs },
});
