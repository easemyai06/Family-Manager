import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function TrustedAccess() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const isParent = member?.role === "admin" || member?.role === "parent";
  const [members, setMembers] = useState<any[]>([]);
  const [trusted, setTrusted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ms, dl] = await Promise.all([api("/families/members"), api("/emergency/delegates")]);
      setMembers(ms as any[]);
      setTrusted(new Set((dl as any[]).map((d) => d.member_id)));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (m: any, on: boolean) => {
    setBusy(m.member_id);
    const next = new Set(trusted);
    if (on) next.add(m.member_id);
    else next.delete(m.member_id);
    setTrusted(next);
    try {
      if (on) await api("/emergency/delegates", { method: "POST", body: { member_id: m.member_id } });
      else await api(`/emergency/delegates/${m.member_id}`, { method: "DELETE" });
    } catch {
      load();
    } finally {
      setBusy(null);
    }
  };

  // adults only (children can't be granted access)
  const adults = members.filter((m) => !(m.is_child || m.role === "child") && m.member_id !== member?.member_id);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="access-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Trusted Access
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: "#9B8AC922", borderColor: "#9B8AC955" }]}>
          <Ionicons name="shield-checkmark" size={22} color="#7A68B8" />
          <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
            Give a trusted adult view-only access to every child's medical cards and insurance
            documents — so they can step in if a parent can't respond. You can turn this off anytime.
          </AppText>
        </View>

        {!isParent ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            <AppText size={14} color={c.onSurfaceTertiary} center>
              Only parents can change who has trusted emergency access.
            </AppText>
          </View>
        ) : adults.length === 0 ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            <AppText size={14} color={c.onSurfaceTertiary} center>
              No other adult relatives yet. Add one from your Family screen first.
            </AppText>
          </View>
        ) : (
          adults.map((m) => {
            const on = trusted.has(m.member_id);
            return (
              <View key={m.member_id} style={[styles.row, { backgroundColor: c.surface, borderColor: on ? "#9B8AC9" : c.border }, shadow(1)]} testID={`access-row-${m.member_id}`}>
                <Avatar uri={m.photo_url} name={m.name} size={44} color={m.color} ring={on} />
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16}>
                    {m.name}
                  </AppText>
                  <AppText size={12} color={on ? "#7A68B8" : c.onSurfaceTertiary}>
                    {on ? "Trusted for emergencies" : m.relationship}
                  </AppText>
                </View>
                <Switch
                  value={on}
                  onValueChange={(v) => toggle(m, v)}
                  disabled={busy === m.member_id}
                  trackColor={{ true: "#9B8AC9" }}
                  testID={`access-toggle-${m.member_id}`}
                />
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  intro: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.md },
});
