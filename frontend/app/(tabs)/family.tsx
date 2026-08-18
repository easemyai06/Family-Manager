import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { shareInvite as shareInviteMsg } from "@/src/lib/invite";

export default function Family() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [invite, setInvite] = useState<any>(null);
  const [manage, setManage] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fam, tl, inv] = await Promise.all([
        api("/families/me"),
        api("/affection/timeline"),
        api("/families/invite").catch(() => null),
      ]);
      setFamily(fam.family);
      setMembers(fam.members);
      setCanManage(!!fam.can_manage);
      setTimeline(tl.week || []);
      setInvite(inv);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shareInvite = async () => {
    if (!invite) return;
    try {
      await shareInviteMsg(invite.invite_code, invite.family_name);
    } catch {}
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await api(`/families/members/${removeTarget.member_id}`, { method: "DELETE" });
      setRemoveTarget(null);
      await load();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const removable = (m: any) => canManage && manage && !m.is_me && m.role !== "admin";

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* cover */}
        <View style={styles.cover}>
          <SmartImage uri={family?.cover_photo} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(44,44,40,0.1)", "rgba(44,44,40,0.75)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.coverContent, { paddingTop: insets.top + spacing.md }]}>
            <AppText family="display" weight="bold" size={26} color="#fff">
              {family?.name || "Your Family"} ❤️
            </AppText>
            <AppText size={13} color="rgba(255,255,255,0.85)">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </AppText>
          </View>
        </View>

        {/* members */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText family="display" weight="bold" size={18}>
              Family Members
            </AppText>
            {canManage ? (
              <View style={styles.headActions}>
                <Pressable onPress={() => setManage((v) => !v)} testID="manage-members-btn" hitSlop={8}>
                  <AppText size={13} weight="bold" color={manage ? c.error : c.onSurfaceSecondary}>
                    {manage ? "Done" : "Manage"}
                  </AppText>
                </Pressable>
                {!manage ? (
                  <Pressable onPress={() => router.push("/member/add")} testID="add-member-btn" hitSlop={8}>
                    <AppText size={13} weight="bold" color={c.brand}>
                      + Add
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {manage ? (
            <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: -6, marginBottom: spacing.md }}>
              Tap ✕ to remove a member from the family
            </AppText>
          ) : null}

          <View style={styles.memberGrid}>
            {members.map((m) => (
              <Pressable
                key={m.member_id}
                style={styles.memberItem}
                onPress={() => (removable(m) ? setRemoveTarget(m) : router.push(`/member/${m.member_id}`))}
                testID={`member-${m.member_id}`}
              >
                <View>
                  <Avatar uri={m.photo_url} name={m.name} size={68} color={m.color} ring />
                  {removable(m) ? (
                    <View style={[styles.removeBadge, { backgroundColor: c.error }]} testID={`remove-${m.member_id}`}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </View>
                  ) : null}
                </View>
                <AppText size={13} weight="semibold" numberOfLines={1} style={{ marginTop: 6, maxWidth: 78 }}>
                  {m.name}
                </AppText>
                <AppText size={11} color={c.onSurfaceTertiary} numberOfLines={1} style={{ maxWidth: 78 }}>
                  {m.relationship}
                </AppText>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: (m.joined ? c.success : c.warning) + "26" },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: m.joined ? c.success : c.warning }]} />
                  <AppText size={10} weight="bold" color={m.joined ? c.success : c.warning}>
                    {m.joined ? "Joined" : "Pending"}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>

          {/* invite CTA */}
          {invite && canManage ? (
            <Pressable
              onPress={shareInvite}
              style={[styles.inviteCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              testID="family-invite-share"
            >
              <View style={[styles.inviteIcon, { backgroundColor: c.brandTertiary }]}>
                <Ionicons name="person-add" size={20} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size={14} weight="bold">
                  Invite a family member
                </AppText>
                <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: 2 }}>
                  Share a link — code {invite.invite_code} fills in for them
                </AppText>
              </View>
              <Ionicons name="share-social" size={20} color={c.brand} />
            </Pressable>
          ) : null}
        </View>

        {/* send love */}
        <Pressable onPress={() => router.push("/affection/send")} style={styles.section} testID="send-love-cta">
          <LinearGradient colors={[c.brandPrimary, "#FF9E9E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.loveCard, shadow(2)]}>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={20} color="#fff">
                Send Some Love ❤️
              </AppText>
              <AppText size={13} color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>
                A hug, a kiss, or a "proud of you" — brighten someone's day
              </AppText>
            </View>
            <View style={styles.loveArrow}>
              <Ionicons name="heart" size={26} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* love timeline */}
        <View style={styles.section}>
          <AppText family="display" weight="bold" size={18} style={{ marginBottom: spacing.md }}>
            Love This Week
          </AppText>
          {timeline.length === 0 ? (
            <View style={[styles.emptyLove, { backgroundColor: c.surface, borderColor: c.border }]}>
              <AppText size={13} color={c.onSurfaceTertiary} center>
                No affection yet this week. Be the first to send some love ❤️
              </AppText>
            </View>
          ) : (
            <View style={[styles.timelineCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              {timeline.slice(0, 12).map((row, i) => (
                <View key={i} style={[styles.loveRow, i < Math.min(timeline.length, 12) - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                  <AppText size={22}>{AFFECTION_MAP[row.type]?.emoji || "❤️"}</AppText>
                  <AppText size={14} style={{ flex: 1 }}>
                    <AppText size={14} weight="bold">
                      {row.from?.name}
                    </AppText>{" "}
                    →{" "}
                    <AppText size={14} weight="bold">
                      {row.to?.name}
                    </AppText>
                  </AppText>
                  <View style={[styles.countPill, { backgroundColor: c.brandTertiary }]}>
                    <AppText size={12} weight="bold" color={c.onBrandTertiary}>
                      {row.count}× {AFFECTION_MAP[row.type]?.label}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* remove confirmation */}
      <Modal visible={!!removeTarget} transparent animationType="fade" onRequestClose={() => setRemoveTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => !busy && setRemoveTarget(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={() => {}}>
            <View style={[styles.warnIcon, { backgroundColor: c.error + "1A" }]}>
              <Ionicons name="person-remove" size={26} color={c.error} />
            </View>
            <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.md }}>
              Remove {removeTarget?.name}?
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary} center style={{ marginTop: 6 }}>
              {removeTarget?.joined
                ? "They'll lose access to your family and will need a new invite to re-join."
                : "This pending member will be removed from your family."}
            </AppText>
            <Pressable
              onPress={confirmRemove}
              disabled={busy}
              style={[styles.removeBtn, { backgroundColor: c.error }]}
              testID="confirm-remove-member"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText size={15} weight="bold" color="#fff">
                  Remove from family
                </AppText>
              )}
            </Pressable>
            <Pressable onPress={() => !busy && setRemoveTarget(null)} style={styles.cancelBtn} testID="cancel-remove-member">
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
  cover: { height: 200, backgroundColor: "#EAE4D9", justifyContent: "flex-end" },
  coverContent: { padding: spacing.lg },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  headActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  memberGrid: { flexDirection: "row", flexWrap: "wrap" },
  memberItem: { alignItems: "center", width: "25%", marginBottom: spacing.lg },
  removeBadge: { position: "absolute", top: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  inviteCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginTop: spacing.xs },
  inviteIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  loveCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, padding: spacing.xl },
  loveArrow: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  timelineCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  loveRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  countPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  emptyLove: { borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: { width: "100%", maxWidth: 380, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  warnIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  removeBtn: { alignSelf: "stretch", borderRadius: radius.lg, paddingVertical: 14, alignItems: "center", marginTop: spacing.xl },
  cancelBtn: { alignSelf: "stretch", borderRadius: radius.lg, paddingVertical: 12, alignItems: "center", marginTop: spacing.xs },
});
