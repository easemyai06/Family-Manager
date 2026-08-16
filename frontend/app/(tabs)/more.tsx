import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
  soon?: boolean;
};

const ORGANIZE: Row[] = [
  { key: "shopping", label: "Shopping Lists", icon: "cart", color: "#8AB07D", route: "/shopping" },
  { key: "todos", label: "To-Do Lists", icon: "checkbox", color: "#A3B18A", route: "/todos" },
  { key: "chores", label: "Kids Chores", icon: "star", color: "#FFD166", route: "/chores" },
  { key: "meals", label: "Meal Planner", icon: "restaurant", color: "#D98E5A", soon: true },
  { key: "recipes", label: "Recipes", icon: "book", color: "#C96F4A", soon: true },
];

const REMEMBER: Row[] = [
  { key: "albums", label: "Family Albums", icon: "images", color: "#FF6B6B", soon: true },
  { key: "timeline", label: "Our Family Story", icon: "time", color: "#D98E5A", route: "/timeline" },
  { key: "tree", label: "Family Tree", icon: "git-network", color: "#8AB07D", route: "/tree" },
  { key: "capsule", label: "Time Capsules", icon: "cube", color: "#B5835A", soon: true },
];

export default function More() {
  const { c, mode, setMode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, member, logout } = useAuth();
  const [invite, setInvite] = useState<any>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const inv = await api("/families/invite");
      setInvite(inv);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRow = (r: Row) => {
    if (r.soon) {
      setNote(`${r.label} is coming soon ✨`);
      setTimeout(() => setNote(""), 2200);
      return;
    }
    if (r.route) router.push(r.route as any);
  };

  const Section = ({ title, rows }: { title: string; rows: Row[] }) => (
    <View style={styles.section}>
      <AppText family="display" weight="bold" size={16} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
        {title}
      </AppText>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
        {rows.map((r, i) => (
          <Pressable
            key={r.key}
            onPress={() => onRow(r)}
            style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}
            testID={`more-${r.key}`}
          >
            <View style={[styles.rowIcon, { backgroundColor: r.color + "22" }]}>
              <Ionicons name={r.icon} size={20} color={r.color} />
            </View>
            <AppText size={15} weight="semibold" style={{ flex: 1 }}>
              {r.label}
            </AppText>
            {r.soon ? (
              <View style={[styles.soonBadge, { backgroundColor: c.surfaceTertiary }]}>
                <AppText size={11} weight="bold" color={c.onSurfaceTertiary}>
                  Soon
                </AppText>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.header}>
          <AppText family="display" weight="bold" size={26}>
            More
          </AppText>
        </View>

        {/* profile card */}
        <Pressable
          onPress={() => member && router.push(`/member/${member.member_id}`)}
          style={[styles.profileCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
          testID="more-profile"
        >
          <Avatar uri={member?.photo_url} name={member?.name} size={54} color={member?.color} ring />
          <View style={{ flex: 1 }}>
            <AppText family="display" weight="bold" size={17}>
              {member?.name || user?.name}
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary}>
              {member?.relationship} · View my profile
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.onSurfaceTertiary} />
        </Pressable>

        <Section title="Organize" rows={ORGANIZE} />
        <Section title="Remember & Preserve" rows={REMEMBER} />

        {/* invite */}
        {invite ? (
          <View style={styles.section}>
            <AppText family="display" weight="bold" size={16} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
              Invite Family
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              <View style={styles.inviteRow}>
                <View style={{ flex: 1 }}>
                  <AppText size={13} color={c.onSurfaceTertiary}>
                    Share this code with family
                  </AppText>
                  <AppText family="display" weight="bold" size={24} color={c.brand} style={{ letterSpacing: 2, marginTop: 4 }} testID="invite-code">
                    {invite.invite_code}
                  </AppText>
                </View>
                <View style={[styles.rowIcon, { backgroundColor: c.brandTertiary }]}>
                  <Ionicons name="share-social" size={20} color={c.brand} />
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* appearance */}
        <View style={styles.section}>
          <AppText family="display" weight="bold" size={16} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
            Appearance
          </AppText>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: spacing.md }, shadow(1)]}>
            <View style={styles.segment}>
              {(["light", "dark", "system"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.segItem, mode === m && { backgroundColor: c.brand }]}
                  testID={`theme-${m}`}
                >
                  <AppText size={13} weight="bold" color={mode === m ? "#fff" : c.onSurfaceSecondary} style={{ textTransform: "capitalize" }}>
                    {m}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* logout */}
        <View style={styles.section}>
          <Pressable onPress={logout} style={[styles.card, styles.logout, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="logout-btn">
            <Ionicons name="log-out-outline" size={20} color={c.error} />
            <AppText size={15} weight="bold" color={c.error}>
              Log Out
            </AppText>
          </Pressable>
        </View>
      </ScrollView>

      {note ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 80 }]} testID="more-toast">
          <AppText size={14} weight="semibold" color={c.onSurfaceInverse}>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  soonBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  inviteRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  segment: { flexDirection: "row", gap: spacing.xs },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  toast: { position: "absolute", alignSelf: "center", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow(3) },
});
