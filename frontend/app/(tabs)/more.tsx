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
import { shareInvite as shareInviteMsg } from "@/src/lib/invite";
import Constants from "expo-constants";

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route?: string;
  soon?: boolean;
};

const PILLARS: { title: string; rows: Row[] }[] = [
  {
    title: "❤️ Connect",
    rows: [{ key: "affection", label: "Send Some Love", icon: "heart", color: "#E86A8C", route: "/affection/send" }],
  },
  {
    title: "📅 Organize",
    rows: [
      { key: "shopping", label: "Shopping Lists", icon: "cart", color: "#8AB07D", route: "/shopping" },
      { key: "todos", label: "To-Do Lists", icon: "checkbox", color: "#A3B18A", route: "/todos" },
      { key: "chores", label: "Kids Chores", icon: "star", color: "#FFD166", route: "/chores" },
      { key: "meals", label: "Meal Planner", icon: "restaurant", color: "#D98E5A", route: "/meals" },
      { key: "recipes", label: "Recipes", icon: "book", color: "#C96F4A", route: "/recipes" },
    ],
  },
  {
    title: "📸 Remember",
    rows: [
      { key: "timeline", label: "Our Family Story", icon: "time", color: "#D98E5A", route: "/timeline" },
      { key: "albums", label: "Family Albums", icon: "images", color: "#FF6B6B", route: "/albums" },
      { key: "places", label: "Places We've Been", icon: "map", color: "#8AB07D", route: "/places" },
      { key: "highlights", label: "Weekly Highlights", icon: "sparkles", color: "#FFB84D", route: "/highlights" },
    ],
  },
  {
    title: "🌳 Preserve",
    rows: [
      { key: "tree", label: "Family Tree", icon: "git-network", color: "#7FA9C9", route: "/tree" },
      { key: "capsule", label: "Time Capsules", icon: "cube", color: "#B5835A", route: "/capsule" },
    ],
  },
  {
    title: "🎁 Celebrate & Wish",
    rows: [
      { key: "wishlist", label: "Wish Lists", icon: "gift", color: "#E86A8C", route: "/wishlist" },
      { key: "rewards", label: "Family Rewards", icon: "trophy", color: "#E8A33D", route: "/rewards" },
    ],
  },
  {
    title: "🛡️ Protect",
    rows: [
      { key: "vault", label: "Family Vault", icon: "lock-closed", color: "#6B8E5A", route: "/vault" },
      { key: "emergency", label: "Emergency Center", icon: "medkit", color: "#E86A6A", route: "/emergency" },
    ],
  },
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

  const shareInvite = async () => {
    if (!invite) return;
    try {
      await shareInviteMsg(invite.invite_code, invite.family_name);
    } catch {
      setNote(`Invite code: ${invite.invite_code}`);
      setTimeout(() => setNote(""), 2600);
    }
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
          <Pressable onPress={() => router.push("/member/edit")} hitSlop={10} style={styles.editPencil} testID="more-edit-profile">
            <Ionicons name="create-outline" size={20} color={c.brand} />
          </Pressable>
        </Pressable>

        {/* invite family — prominent, tap to share */}
        {invite ? (
          <View style={styles.section}>
            <AppText family="display" weight="bold" size={16} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
              Invite Family
            </AppText>
            <Pressable
              onPress={shareInvite}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              testID="invite-share"
            >
              <View style={styles.inviteRow}>
                <View style={{ flex: 1 }}>
                  <AppText size={13} color={c.onSurfaceTertiary}>
                    Share this code to add family
                  </AppText>
                  <AppText family="display" weight="bold" size={24} color={c.brand} style={{ letterSpacing: 2, marginTop: 4 }} testID="invite-code">
                    {invite.invite_code}
                  </AppText>
                  <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: 4 }}>
                    Tap to share the invite
                  </AppText>
                </View>
                <View style={[styles.rowIcon, { backgroundColor: c.brandTertiary }]}>
                  <Ionicons name="share-social" size={20} color={c.brand} />
                </View>
              </View>
            </Pressable>
          </View>
        ) : null}

        {PILLARS.map((p) => (
          <Section key={p.title} title={p.title} rows={p.rows} />
        ))}

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

        {/* preferences */}
        <Section
          title="🔔 Preferences"
          rows={[
            { key: "accessibility", label: "Accessibility & Display", icon: "eye", color: "#7FA9C9", route: "/settings/accessibility" },
            { key: "notifications", label: "Notifications", icon: "notifications", color: "#E8A33D", route: "/settings/notifications" },
            { key: "storage", label: "Storage & Cleanup", icon: "cloud", color: "#5A8FE0", route: "/settings/storage" },
          ]}
        />

        {/* support & legal */}
        <Section
          title="ℹ️ Support & Legal"
          rows={[
            { key: "support", label: "Help & Support", icon: "help-buoy", color: "#7FA9C9", route: "/legal/support" },
            { key: "account", label: "Account & Data", icon: "person-circle", color: "#8AB07D", route: "/account" },
            { key: "privacy", label: "Privacy Policy", icon: "shield-checkmark", color: "#9B8AC9", route: "/legal/privacy" },
            { key: "terms", label: "Terms of Use", icon: "document-text", color: "#D98E5A", route: "/legal/terms" },
          ]}
        />

        {/* logout */}
        <View style={styles.section}>
          <Pressable onPress={logout} style={[styles.card, styles.logout, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="logout-btn">
            <Ionicons name="log-out-outline" size={20} color={c.error} />
            <AppText size={15} weight="bold" color={c.error}>
              Log Out
            </AppText>
          </Pressable>
        </View>

        <AppText size={12} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.lg }}>
          FamilyHome v{Constants.expoConfig?.version || "1.0.0"} · by Ease My Ai Pvt Ltd
        </AppText>
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
  editPencil: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
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
