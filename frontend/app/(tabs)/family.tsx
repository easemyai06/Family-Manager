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
import { birthdayCountdown, daysUntilBirthday } from "@/src/lib/time";
import { shareInvite as shareInviteMsg, shareInviteWhatsApp } from "@/src/lib/invite";

export default function Family() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [invite, setInvite] = useState<any>(null);
  const [helpers, setHelpers] = useState<any[]>([]);
  const [careUnread, setCareUnread] = useState(0);
  const [manage, setManage] = useState(false);
  const [actionMember, setActionMember] = useState<any>(null);
  const [removePhase, setRemovePhase] = useState(false);
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
      if (fam.can_manage) {
        try {
          const h = await api("/helpers");
          setHelpers(h.helpers || []);
          const cu = await api("/care-team/unread").catch(() => null);
          setCareUnread(cu?.count || 0);
        } catch {}
      }
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

  const closeActions = () => {
    setActionMember(null);
    setRemovePhase(false);
  };

  const changeRole = async (role: string) => {
    if (!actionMember || busy) return;
    setBusy(true);
    try {
      await api(`/families/members/${actionMember.member_id}`, { method: "PATCH", body: { role } });
      setActionMember((prev: any) => (prev ? { ...prev, role, is_child: role === "child" } : prev));
      await load();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!actionMember) return;
    setBusy(true);
    try {
      await api(`/families/members/${actionMember.member_id}`, { method: "DELETE" });
      closeActions();
      await load();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  // A member has admin actions if the viewer manages the family and it's not
  // themselves or the family admin.
  const hasActions = (m: any) => canManage && !m.is_me && m.role !== "admin";

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
              Tap a member to change their role, resend an invite, or remove them
            </AppText>
          ) : null}

          <View style={styles.memberGrid}>
            {members.map((m) => (
              <Pressable
                key={m.member_id}
                style={styles.memberItem}
                onPress={() =>
                  manage && hasActions(m) ? setActionMember(m) : router.push(`/member/${m.member_id}`)
                }
                testID={`member-${m.member_id}`}
              >
                <View>
                  <Avatar uri={m.photo_url} name={m.name} size={68} color={m.color} ring />
                  {manage && hasActions(m) ? (
                    <View style={[styles.manageBadge, { backgroundColor: c.brand }]} testID={`manage-${m.member_id}`}>
                      <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
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
                {(() => {
                  const bd = daysUntilBirthday(m.birthday);
                  if (bd == null || bd > 30) return null;
                  return (
                    <View style={[styles.bdayBadge, { backgroundColor: c.brandTertiary }]} testID={`bday-${m.member_id}`}>
                      <AppText size={10} weight="bold" color={c.onBrandTertiary}>
                        🎂 {birthdayCountdown(m.birthday)}
                      </AppText>
                    </View>
                  );
                })()}
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

        {/* trusted helpers */}
        {canManage ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText family="display" weight="bold" size={18}>
                Trusted Helpers
              </AppText>
              <Pressable onPress={() => router.push("/helper/add")} testID="add-helper-cta" hitSlop={8}>
                <AppText size={13} weight="bold" color={c.brand}>
                  + Add
                </AppText>
              </Pressable>
            </View>
            <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: -6, marginBottom: spacing.md }}>
              Nannies, cooks, drivers & more — limited access, never full family info
            </AppText>
            {helpers.length === 0 ? (
              <Pressable
                onPress={() => router.push("/helper/add")}
                style={[styles.inviteCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                testID="helpers-empty"
              >
                <View style={[styles.inviteIcon, { backgroundColor: c.brandTertiary }]}>
                  <Ionicons name="people-circle-outline" size={22} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="bold">Add your first helper</AppText>
                  <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: 2 }}>
                    Assign tasks & schedules without sharing private family life
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
              </Pressable>
            ) : (
              helpers.map((h) => (
                <Pressable
                  key={h.helper_id}
                  onPress={() => router.push(`/helper/${h.helper_id}`)}
                  style={[styles.helperCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                  testID={`helper-card-${h.helper_id}`}
                >
                  <View style={[styles.roleIcon, { backgroundColor: c.brandTertiary }]}>
                    <AppText size={22}>{h.role_icon}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size={15} weight="bold">{h.name}</AppText>
                    <AppText size={12} color={c.onSurfaceSecondary}>
                      {h.role_label}
                      {h.status === "active" && h.tasks_total ? ` · ${h.tasks_done}/${h.tasks_total} tasks today` : ""}
                    </AppText>
                    {h.checked_in_at && !h.checked_out_at ? (
                      <AppText size={11} weight="semibold" color={c.success} style={{ marginTop: 1 }}>🟢 On duty</AppText>
                    ) : null}
                  </View>
                  {h.unread_chat ? (
                    <View style={[styles.helperUnread, { backgroundColor: c.error }]} testID={`helper-unread-${h.helper_id}`}>
                      <Ionicons name="chatbubble" size={10} color="#fff" />
                      <AppText size={10} weight="bold" color="#fff">{h.unread_chat}</AppText>
                    </View>
                  ) : null}
                  <View style={[styles.helperStatus, {
                    backgroundColor: (h.status === "active" ? c.success : h.status === "paused" ? c.warning : c.onSurfaceTertiary) + "22",
                  }]}>
                    <AppText size={10} weight="bold" color={h.status === "active" ? c.success : h.status === "paused" ? c.warning : c.onSurfaceTertiary}>
                      {h.status === "pending" ? "Invited" : h.status === "active" ? (h.on_duty ? "On duty" : "Active") : "Paused"}
                    </AppText>
                  </View>
                </Pressable>
              ))
            )}
            {helpers.some((h) => h.status === "active") ? (
              <Pressable
                onPress={() => router.push("/care-team")}
                style={[styles.careTeamCard, { backgroundColor: c.brandTertiary }]}
                testID="care-team-cta"
              >
                <View style={[styles.roleIcon, { backgroundColor: c.surface }]}>
                  <AppText size={20}>👥</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size={15} weight="bold" color={c.onBrandTertiary}>Care Team Chat</AppText>
                  <AppText size={12} color={c.onBrandTertiary}>Coordinate with all your helpers together</AppText>
                </View>
                {careUnread ? (
                  <View style={[styles.helperUnread, { backgroundColor: c.error }]} testID="care-team-unread">
                    <Ionicons name="chatbubble" size={10} color="#fff" />
                    <AppText size={10} weight="bold" color="#fff">{careUnread}</AppText>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={c.onBrandTertiary} />
                )}
              </Pressable>
            ) : null}
          </View>
        ) : null}

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

      {/* member actions: role / resend invite / remove */}
      <Modal visible={!!actionMember} transparent animationType="fade" onRequestClose={closeActions}>
        <Pressable style={styles.backdrop} onPress={() => !busy && closeActions()}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={() => {}}>
            {actionMember && !removePhase ? (
              <>
                <Avatar uri={actionMember.photo_url} name={actionMember.name} size={64} color={actionMember.color} ring />
                <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.sm }}>
                  {actionMember.name}
                </AppText>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: (actionMember.joined ? c.success : c.warning) + "26", marginTop: 4 },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: actionMember.joined ? c.success : c.warning }]} />
                  <AppText size={11} weight="bold" color={actionMember.joined ? c.success : c.warning}>
                    {actionMember.joined ? "Joined" : "Pending invite"}
                  </AppText>
                </View>

                {/* role editor */}
                <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.sheetLabel}>
                  ROLE
                </AppText>
                <View style={styles.roleRow}>
                  {["parent", "child", "adult"].map((r) => {
                    const sel = actionMember.role === r;
                    return (
                      <Pressable
                        key={r}
                        disabled={busy}
                        onPress={() => changeRole(r)}
                        style={[styles.roleChip, { backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary, borderColor: sel ? c.brand : "transparent" }]}
                        testID={`role-${r}`}
                      >
                        <AppText size={13} weight="bold" color={sel ? c.onBrandTertiary : c.onSurfaceSecondary} style={{ textTransform: "capitalize" }}>
                          {r}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* login & PIN (parent-managed; kids / pending members only) */}
                {actionMember.manage_login ? (
                  <>
                    <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.sheetLabel}>
                      LOGIN &amp; PIN
                    </AppText>
                    <Pressable
                      onPress={() => {
                        const m = actionMember;
                        closeActions();
                        router.push(
                          `/member/credentials?id=${m.member_id}&name=${encodeURIComponent(m.name)}&hasLogin=${m.has_login ? "1" : "0"}&username=${encodeURIComponent(m.username || "")}` as any
                        );
                      }}
                      style={[styles.sheetBtn, { backgroundColor: c.surfaceSecondary }]}
                      testID="member-credentials"
                    >
                      <Ionicons name="key-outline" size={18} color={c.onSurface} />
                      <AppText size={14} weight="semibold" color={c.onSurface}>
                        {actionMember.has_login ? "Reset login & PIN" : "Set up login & PIN"}
                      </AppText>
                    </Pressable>
                  </>
                ) : null}

                {/* resend invite (pending only) */}
                {!actionMember.joined && invite ? (
                  <>
                    <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.sheetLabel}>
                      RESEND INVITE
                    </AppText>
                    <Pressable
                      onPress={() => shareInviteWhatsApp(invite.invite_code, invite.family_name)}
                      style={[styles.waBtn, { backgroundColor: "#25D366" }]}
                      testID="resend-whatsapp"
                    >
                      <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                      <AppText size={14} weight="bold" color="#fff">
                        Invite via WhatsApp
                      </AppText>
                    </Pressable>
                    <Pressable onPress={shareInvite} style={[styles.sheetBtn, { backgroundColor: c.surfaceSecondary }]} testID="resend-share">
                      <Ionicons name="share-social" size={18} color={c.onSurface} />
                      <AppText size={14} weight="semibold" color={c.onSurface}>
                        Share invite link
                      </AppText>
                    </Pressable>
                  </>
                ) : null}

                {/* remove */}
                <Pressable onPress={() => setRemovePhase(true)} style={[styles.sheetBtn, { backgroundColor: c.error + "12", marginTop: spacing.lg }]} testID="open-remove">
                  <Ionicons name="person-remove" size={18} color={c.error} />
                  <AppText size={14} weight="bold" color={c.error}>
                    Remove from family
                  </AppText>
                </Pressable>
                <Pressable onPress={closeActions} style={styles.cancelBtn} testID="close-actions">
                  <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>
                    Done
                  </AppText>
                </Pressable>
              </>
            ) : null}

            {actionMember && removePhase ? (
              <>
                <View style={[styles.warnIcon, { backgroundColor: c.error + "1A" }]}>
                  <Ionicons name="person-remove" size={26} color={c.error} />
                </View>
                <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.md }}>
                  Remove {actionMember.name}?
                </AppText>
                <AppText size={13} color={c.onSurfaceSecondary} center style={{ marginTop: 6 }}>
                  {actionMember.joined
                    ? "They'll lose access to your family and will need a new invite to re-join."
                    : "This pending member will be removed from your family."}
                </AppText>
                <Pressable onPress={confirmRemove} disabled={busy} style={[styles.removeBtn, { backgroundColor: c.error }]} testID="confirm-remove-member">
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <AppText size={15} weight="bold" color="#fff">
                      Remove from family
                    </AppText>
                  )}
                </Pressable>
                <Pressable onPress={() => !busy && setRemovePhase(false)} style={styles.cancelBtn} testID="cancel-remove-member">
                  <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>
                    Back
                  </AppText>
                </Pressable>
              </>
            ) : null}
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
  manageBadge: { position: "absolute", top: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  bdayBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  helperCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  roleIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  helperStatus: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  helperUnread: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  careTeamCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
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
  sheetLabel: { alignSelf: "flex-start", marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 },
  roleRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch" },
  roleChip: { flex: 1, alignItems: "center", borderRadius: radius.pill, paddingVertical: 11, borderWidth: 1.5 },
  waBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: 13 },
  sheetBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: 13, marginTop: spacing.sm },
  warnIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  removeBtn: { alignSelf: "stretch", borderRadius: radius.lg, paddingVertical: 14, alignItems: "center", marginTop: spacing.xl },
  cancelBtn: { alignSelf: "stretch", borderRadius: radius.lg, paddingVertical: 12, alignItems: "center", marginTop: spacing.xs },
});
