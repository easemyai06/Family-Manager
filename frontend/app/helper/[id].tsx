import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, Alert, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { TimeField } from "@/src/components/ui/DateTimeField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { timeAgo } from "@/src/lib/time";
import { mapsUrl, staticMapUrl } from "@/src/lib/fileMeta";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const CATS = [
  { key: "chore", label: "Chore" }, { key: "meal", label: "Meal" }, { key: "pickup", label: "Pickup" },
  { key: "care", label: "Care" }, { key: "shopping", label: "Shopping" }, { key: "other", label: "Other" },
];
const TRIP_LABEL: Record<string, string> = {
  en_route: "🚗 On the way", picked_up: "🧒 Picked up", reached: "🏠 Reached home",
};

export default function HelperDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [helper, setHelper] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const [taskModal, setTaskModal] = useState(false);
  const [tTitle, setTTitle] = useState("");
  const [tInstr, setTInstr] = useState("");
  const [tTime, setTTime] = useState<string | null>(null);
  const [tSchedule, setTSchedule] = useState<"once" | "daily" | "weekly">("daily");
  const [tDays, setTDays] = useState<number[]>([]);
  const [tCat, setTCat] = useState("chore");
  const [tProof, setTProof] = useState<"none" | "photo" | "note">("none");
  const [tFor, setTFor] = useState<string | null>(null);
  const [tHigh, setTHigh] = useState(false);
  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");

  const [pinModal, setPinModal] = useState(false);
  const [pUser, setPUser] = useState("");
  const [pPin, setPPin] = useState("");

  const [ratings, setRatings] = useState<any[]>([]);
  const [ratingToday, setRatingToday] = useState<any>(null);
  const [ratingNote, setRatingNote] = useState("");

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const load = useCallback(async () => {
    try {
      const [h, t, a, s, r] = await Promise.all([
        api(`/helpers/${id}`), api(`/helpers/${id}/tasks`), api(`/helpers/${id}/activity`),
        api(`/helpers/${id}/sessions`), api(`/helpers/${id}/ratings`),
      ]);
      setHelper(h.helper);
      setTasks(t.tasks || []);
      setActivity(a.activity || []);
      setSessions(s.sessions || []);
      setRatings(r.ratings || []);
      setRatingToday(r.today || null);
    } catch {}
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rate = async (val: "up" | "down") => {
    setBusy(true);
    try {
      await api(`/helpers/${id}/rating`, { method: "POST", body: { rating: val, note: ratingNote.trim() || null } });
      setRatingNote("");
      flash(val === "up" ? "Thanks — logged 👍" : "Noted 👎");
      load();
    } catch (e: any) {
      flash(e?.message || "Couldn't save");
    }
    setBusy(false);
  };

  const act = async (path: string, method = "POST", body?: any) => {
    setBusy(true);
    try {
      await api(path, { method, body });
      await load();
    } catch (e: any) {
      flash(e?.message || "Something went wrong");
    }
    setBusy(false);
  };

  const confirmRemove = () => {
    Alert.alert("Remove helper?", `${helper?.name} will lose all access immediately. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await act(`/helpers/${id}`, "DELETE"); router.back(); } },
    ]);
  };

  const createTask = async () => {
    if (!tTitle.trim()) { flash("Add a task title"); return; }
    setBusy(true);
    try {
      await api(`/helpers/${id}/tasks`, {
        method: "POST",
        body: {
          title: tTitle.trim(), instructions: tInstr.trim() || null, due_time: tTime,
          schedule: tSchedule, days: tSchedule === "weekly" ? tDays : [], category: tCat,
          require_proof: tProof === "none" ? null : tProof, priority: tHigh ? "high" : "normal",
          for_member_id: tFor,
          pickup_from: tCat === "pickup" ? (tFrom.trim() || null) : null,
          pickup_to: tCat === "pickup" ? (tTo.trim() || null) : null,
        },
      });
      setTaskModal(false);
      setTTitle(""); setTInstr(""); setTTime(null); setTSchedule("daily"); setTDays([]); setTCat("chore"); setTProof("none"); setTFor(null); setTHigh(false); setTFrom(""); setTTo("");
      flash("Task assigned");
      load();
    } catch (e: any) {
      flash(e?.message || "Couldn't add task");
    }
    setBusy(false);
  };

  const deleteTask = (tid: string) => {
    Alert.alert("Delete task?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => act(`/helper-tasks/${tid}`, "DELETE") },
    ]);
  };

  const submitPin = async () => {
    setBusy(true);
    try {
      await api(`/helpers/${id}/reset-pin`, { method: "POST", body: { username: pUser.trim().toLowerCase(), pin: pPin.trim() } });
      setPinModal(false); setPUser(""); setPPin("");
      flash("Login updated");
      load();
    } catch (e: any) {
      flash(e?.message || "Couldn't set login");
    }
    setBusy(false);
  };

  if (!helper) {
    return <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]} />;
  }

  const statusColor = helper.status === "active" ? c.success : helper.status === "paused" ? c.warning : c.onSurfaceTertiary;

  const todayKey = new Date().toISOString().slice(0, 10);
  const tripByTask: Record<string, any> = {};
  for (const a of activity) {
    if (a.date === todayKey && a.trip && !tripByTask[a.task_id]) tripByTask[a.task_id] = a.trip;
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="helper-detail-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18} numberOfLines={1} style={{ flex: 1 }}>{helper.name}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={[styles.roleIcon, { backgroundColor: c.brandTertiary }]}>
              <AppText size={26}>{helper.role_icon}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={18}>{helper.name}</AppText>
              <AppText size={13} color={c.onSurfaceSecondary}>{helper.role_label}</AppText>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              <AppText size={11} weight="bold" color={statusColor}>{helper.status === "pending" ? "Invited" : helper.status[0].toUpperCase() + helper.status.slice(1)}</AppText>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            {helper.status === "active" ? (
              <Pressable onPress={() => act(`/helpers/${id}/pause`)} style={[styles.smallBtn, { backgroundColor: c.warning + "18" }]} testID="pause-btn">
                <Ionicons name="pause" size={15} color={c.warning} /><AppText size={13} weight="bold" color={c.warning}>Pause</AppText>
              </Pressable>
            ) : helper.status === "paused" ? (
              <Pressable onPress={() => act(`/helpers/${id}/resume`)} style={[styles.smallBtn, { backgroundColor: c.success + "18" }]} testID="resume-btn">
                <Ionicons name="play" size={15} color={c.success} /><AppText size={13} weight="bold" color={c.success}>Resume</AppText>
              </Pressable>
            ) : null}
            <Pressable onPress={confirmRemove} style={[styles.smallBtn, { backgroundColor: c.error + "14" }]} testID="remove-btn">
              <Ionicons name="trash-outline" size={15} color={c.error} /><AppText size={13} weight="bold" color={c.error}>Remove</AppText>
            </Pressable>
          </View>
        </View>

        {/* quick actions: private chat + handover notes */}
        <View style={styles.quickRow}>
          <Pressable
            onPress={() => router.push(`/helper/chat?id=${id}&name=${encodeURIComponent(helper.name)}`)}
            style={[styles.quickBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID="helper-chat-btn"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.brandPrimary} />
            <AppText size={13} weight="bold" color={c.onSurface}>Chat</AppText>
            {helper.unread_chat ? (
              <View style={[styles.badge, { backgroundColor: c.error }]}>
                <AppText size={10} weight="bold" color="#fff">{helper.unread_chat}</AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push(`/helper/handover?id=${id}&name=${encodeURIComponent(helper.name)}`)}
            style={[styles.quickBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID="helper-handover-btn"
          >
            <Ionicons name="clipboard-outline" size={20} color={c.brandPrimary} />
            <AppText size={13} weight="bold" color={c.onSurface}>Handover</AppText>
          </Pressable>
        </View>

        {/* assigned to */}
        <SectionTitle c={c}>Helping</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {helper.assigned_all ? (
            <AppText size={14} color={c.onSurface}>👨‍👩‍👧‍👦 The whole household</AppText>
          ) : helper.assigned_members?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
              {helper.assigned_members.map((m: any) => (
                <View key={m.member_id} style={{ alignItems: "center", gap: 4, width: 60 }}>
                  <Avatar name={m.name} uri={m.photo_url} size={44} color={m.color} />
                  <AppText size={12} color={c.onSurfaceSecondary}>{m.name}</AppText>
                </View>
              ))}
            </View>
          ) : (
            <AppText size={14} color={c.onSurfaceTertiary}>No one assigned yet</AppText>
          )}
        </View>

        {/* access summary */}
        <SectionTitle c={c}>Access summary</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {helper.can_access.map((x: string) => (
            <View key={x} style={styles.accRow}><Ionicons name="checkmark-circle" size={17} color={c.success} /><AppText size={14} color={c.onSurface}>{x}</AppText></View>
          ))}
          {helper.cannot_access.map((x: string) => (
            <View key={x} style={styles.accRow}><Ionicons name="close-circle" size={17} color={c.onSurfaceTertiary} /><AppText size={14} color={c.onSurfaceTertiary}>{x}</AppText></View>
          ))}
          <Pressable onPress={() => flash("Tip: re-add the helper to change role defaults; per-permission editing is in Add Helper")} style={{ display: "none" }} />
        </View>

        {/* login */}
        <SectionTitle c={c}>Sign-in</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {helper.username ? (
            <AppText size={14} color={c.onSurface}>Username: <AppText weight="bold">{helper.username}</AppText></AppText>
          ) : helper.invite_code ? (
            <AppText size={14} color={c.onSurface}>Invite code: <AppText weight="bold" testID="detail-invite-code">{helper.invite_code}</AppText></AppText>
          ) : (
            <AppText size={14} color={c.onSurfaceTertiary}>Not set up yet</AppText>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Pressable onPress={() => setPinModal(true)} style={[styles.smallBtn, { backgroundColor: c.surfaceSecondary }]} testID="set-login-btn">
              <Ionicons name="key-outline" size={15} color={c.onSurface} /><AppText size={13} weight="bold" color={c.onSurface}>Set username & PIN</AppText>
            </Pressable>
            <Pressable onPress={() => act(`/helpers/${id}/regenerate-invite`)} style={[styles.smallBtn, { backgroundColor: c.surfaceSecondary }]} testID="regen-invite-btn">
              <Ionicons name="refresh" size={15} color={c.onSurface} /><AppText size={13} weight="bold" color={c.onSurface}>New invite code</AppText>
            </Pressable>
          </View>
        </View>

        {/* tasks */}
        <View style={styles.sectionHead}>
          <SectionTitle c={c} noMargin>Tasks</SectionTitle>
          <Pressable onPress={() => setTaskModal(true)} style={[styles.addTask, { backgroundColor: c.brandPrimary }]} testID="assign-task-btn">
            <Ionicons name="add" size={16} color="#fff" /><AppText size={13} weight="bold" color="#fff">Assign</AppText>
          </Pressable>
        </View>
        {tasks.length === 0 ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <AppText size={14} color={c.onSurfaceTertiary}>No tasks assigned yet</AppText>
          </View>
        ) : (
          tasks.map((t) => (
            <View key={t.task_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: spacing.md }]} testID={`task-${t.task_id}`}>
              <View style={{ flex: 1 }}>
                <AppText size={15} weight="semibold">{t.title}</AppText>
                <AppText size={12} color={c.onSurfaceTertiary}>
                  {t.schedule === "daily" ? "Every day" : t.schedule === "weekly" ? "Weekly" : "One-time"}{t.due_time ? ` · ${t.due_time}` : ""}{t.require_proof ? ` · needs ${t.require_proof}` : ""}
                </AppText>
                {t.category === "pickup" && (t.pickup_from || t.pickup_to) ? (
                  <AppText size={12} color={c.onSurfaceSecondary} style={{ marginTop: 2 }}>
                    🚗 {t.pickup_from || "—"} → {t.pickup_to || "—"}
                  </AppText>
                ) : null}
                {tripByTask[t.task_id] ? (
                  <View style={[styles.tripBadge, { backgroundColor: c.success + "1e" }]}>
                    <AppText size={11} weight="bold" color={c.success}>
                      {TRIP_LABEL[tripByTask[t.task_id].status] || "In progress"}
                    </AppText>
                  </View>
                ) : null}
                {tripByTask[t.task_id]?.lat && ["en_route", "picked_up"].includes(tripByTask[t.task_id]?.status) ? (
                  <Pressable onPress={() => Linking.openURL(mapsUrl(tripByTask[t.task_id].lat, tripByTask[t.task_id].lng))} style={{ marginTop: 8 }} testID={`trip-map-${t.task_id}`}>
                    <SmartImage uri={staticMapUrl(tripByTask[t.task_id].lat, tripByTask[t.task_id].lng, 400, 150)} style={styles.tripMap} />
                    <AppText size={11} color={c.onSurfaceTertiary} style={{ marginTop: 4 }}>
                      📍 Live · updated {timeAgo(tripByTask[t.task_id].loc_updated_at)} · tap to open in Maps
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => deleteTask(t.task_id)} hitSlop={8} testID={`del-task-${t.task_id}`}>
                <Ionicons name="trash-outline" size={18} color={c.onSurfaceTertiary} />
              </Pressable>
            </View>
          ))
        )}

        {/* activity */}
        {activity.length ? (
          <>
            <SectionTitle c={c}>Recent activity</SectionTitle>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              {activity.slice(0, 8).map((a, i) => (
                <View key={a.completion_id || i} style={[styles.accRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm }]}>
                  <Ionicons name={a.status === "done" ? "checkmark-done" : a.status === "issue" ? "alert-circle" : "time-outline"} size={16} color={a.status === "issue" ? c.error : c.success} />
                  <View style={{ flex: 1 }}>
                    <AppText size={13} color={c.onSurface}>
                      {a.task_title}{a.status === "issue" ? ` — needs help` : a.status === "done" ? " — done" : " — started"}
                    </AppText>
                    {a.issue?.reason ? <AppText size={12} color={c.error}>{a.issue.reason}{a.issue.note ? `: ${a.issue.note}` : ""}</AppText> : null}
                    <AppText size={11} color={c.onSurfaceTertiary}>{timeAgo(a.updated_at)}</AppText>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* daily rating */}
        <SectionTitle c={c}>How was today?</SectionTitle>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.rateRow}>
            <Pressable
              onPress={() => rate("up")}
              style={[styles.rateBtn, { borderColor: ratingToday?.rating === "up" ? c.success : c.border, backgroundColor: ratingToday?.rating === "up" ? c.success + "1e" : c.surfaceSecondary }]}
              testID="rate-up"
            >
              <AppText size={22}>👍</AppText>
              <AppText size={13} weight="bold" color={ratingToday?.rating === "up" ? c.success : c.onSurface}>Great</AppText>
            </Pressable>
            <Pressable
              onPress={() => rate("down")}
              style={[styles.rateBtn, { borderColor: ratingToday?.rating === "down" ? c.error : c.border, backgroundColor: ratingToday?.rating === "down" ? c.error + "1e" : c.surfaceSecondary }]}
              testID="rate-down"
            >
              <AppText size={22}>👎</AppText>
              <AppText size={13} weight="bold" color={ratingToday?.rating === "down" ? c.error : c.onSurface}>Needs work</AppText>
            </Pressable>
          </View>
          <TextField label="" value={ratingNote} onChangeText={setRatingNote} placeholder="Add a note (optional)" testID="rate-note" />
          {ratingToday ? (
            <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: 2 }}>
              Today logged: {ratingToday.rating === "up" ? "👍" : "👎"}{ratingToday.note ? ` · ${ratingToday.note}` : ""}
            </AppText>
          ) : null}
          {ratings.length ? (
            <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm }}>
              {ratings.slice(0, 6).map((r) => (
                <View key={r.rating_id} style={styles.rateHist} testID={`rate-hist-${r.rating_id}`}>
                  <AppText size={14}>{r.rating === "up" ? "👍" : "👎"}</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText size={12} color={c.onSurface}>{r.date}{r.note ? ` · ${r.note}` : ""}</AppText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* sessions */}
        {sessions.length ? (
          <>
            <View style={styles.sectionHead}>
              <SectionTitle c={c} noMargin>Devices</SectionTitle>
              <Pressable onPress={() => act(`/helpers/${id}/signout-all`)} testID="signout-all-btn">
                <AppText size={13} weight="bold" color={c.error}>Sign out all</AppText>
              </Pressable>
            </View>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              {sessions.map((s, i) => (
                <View key={s.session_id} style={[styles.accRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm }]}>
                  <Ionicons name="phone-portrait-outline" size={16} color={c.onSurfaceSecondary} />
                  <View style={{ flex: 1 }}>
                    <AppText size={13} color={c.onSurface} numberOfLines={1}>{s.device || "Device"}</AppText>
                    <AppText size={11} color={c.onSurfaceTertiary}>Active {timeAgo(s.last_seen_at)}</AppText>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* assign task modal */}
      <Modal visible={taskModal} transparent animationType="slide" onRequestClose={() => setTaskModal(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.md }]}>
            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} bottomOffset={20}>
              <AppText family="display" weight="bold" size={18} center style={{ marginBottom: spacing.md }}>Assign a task</AppText>
              <TextField label="Task" value={tTitle} onChangeText={setTTitle} placeholder="e.g. Clean living room" testID="task-title" />
              <TextField label="Instructions (optional)" value={tInstr} onChangeText={setTInstr} placeholder="e.g. Vacuum and mop the floor" multiline testID="task-instr" />
              <View style={{ marginTop: spacing.sm }}><TimeField label="Due time (optional)" value={tTime} onChange={setTTime} testID="task-time" /></View>

              <MiniLabel c={c}>Repeat</MiniLabel>
              <View style={styles.segRow}>
                {(["once", "daily", "weekly"] as const).map((s) => (
                  <Pressable key={s} onPress={() => setTSchedule(s)} style={[styles.seg, { backgroundColor: tSchedule === s ? c.brandPrimary : c.surfaceSecondary, borderColor: tSchedule === s ? c.brandPrimary : c.border }]} testID={`sched-${s}`}>
                    <AppText size={13} weight="bold" color={tSchedule === s ? "#fff" : c.onSurfaceSecondary}>{s === "once" ? "One-time" : s === "daily" ? "Daily" : "Weekly"}</AppText>
                  </Pressable>
                ))}
              </View>
              {tSchedule === "weekly" ? (
                <View style={[styles.daysRow, { marginTop: spacing.sm }]}>
                  {DAYS.map((d, i) => (
                    <Pressable key={i} onPress={() => setTDays((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i])} style={[styles.dayBtn, { backgroundColor: tDays.includes(i) ? c.brandPrimary : c.surfaceSecondary, borderColor: tDays.includes(i) ? c.brandPrimary : c.border }]} testID={`tday-${i}`}>
                      <AppText size={13} weight="bold" color={tDays.includes(i) ? "#fff" : c.onSurfaceSecondary}>{d}</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <MiniLabel c={c}>Category</MiniLabel>
              <View style={styles.wrapRow}>
                {CATS.map((cat) => (
                  <Pressable key={cat.key} onPress={() => setTCat(cat.key)} style={[styles.chip, { borderColor: tCat === cat.key ? c.brandPrimary : c.border, backgroundColor: tCat === cat.key ? c.brandTertiary : c.surfaceSecondary }]} testID={`cat-${cat.key}`}>
                    <AppText size={12} weight="semibold" color={tCat === cat.key ? c.onBrandTertiary : c.onSurfaceSecondary}>{cat.label}</AppText>
                  </Pressable>
                ))}
              </View>

              {tCat === "pickup" ? (
                <View style={{ marginTop: spacing.sm }}>
                  <TextField label="Pick up from (optional)" value={tFrom} onChangeText={setTFrom} placeholder="e.g. Delhi Public School" testID="task-from" />
                  <TextField label="Drop to (optional)" value={tTo} onChangeText={setTTo} placeholder="e.g. Home" testID="task-to" />
                </View>
              ) : null}

              {!helper.assigned_all && helper.assigned_members?.length ? (
                <>
                  <MiniLabel c={c}>For (optional)</MiniLabel>
                  <View style={styles.wrapRow}>
                    {helper.assigned_members.map((m: any) => (
                      <Pressable key={m.member_id} onPress={() => setTFor(tFor === m.member_id ? null : m.member_id)} style={[styles.chip, { borderColor: tFor === m.member_id ? c.brandPrimary : c.border, backgroundColor: tFor === m.member_id ? c.brandTertiary : c.surfaceSecondary }]} testID={`tfor-${m.member_id}`}>
                        <AppText size={12} weight="semibold" color={tFor === m.member_id ? c.onBrandTertiary : c.onSurfaceSecondary}>{m.name}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <MiniLabel c={c}>Proof needed?</MiniLabel>
              <View style={styles.segRow}>
                {(["none", "photo", "note"] as const).map((p) => (
                  <Pressable key={p} onPress={() => setTProof(p)} style={[styles.seg, { backgroundColor: tProof === p ? c.brandPrimary : c.surfaceSecondary, borderColor: tProof === p ? c.brandPrimary : c.border }]} testID={`proof-${p}`}>
                    <AppText size={13} weight="bold" color={tProof === p ? "#fff" : c.onSurfaceSecondary}>{p === "none" ? "None" : p === "photo" ? "Photo" : "Note"}</AppText>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={() => setTHigh((v) => !v)} style={[styles.accRow, { marginTop: spacing.md }]} testID="task-high">
                <Ionicons name={tHigh ? "checkbox" : "square-outline"} size={20} color={tHigh ? c.brandPrimary : c.onSurfaceTertiary} />
                <AppText size={14} color={c.onSurface}>Mark as important</AppText>
              </Pressable>

              <Button label={busy ? "Saving…" : "Assign task"} onPress={createTask} loading={busy} disabled={busy} testID="task-submit" style={{ marginTop: spacing.lg }} />
              <Pressable onPress={() => setTaskModal(false)} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
                <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
              </Pressable>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      {/* set pin modal */}
      <Modal visible={pinModal} transparent animationType="slide" onRequestClose={() => setPinModal(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]}>
            <AppText family="display" weight="bold" size={18} center style={{ marginBottom: spacing.md }}>Set login</AppText>
            <TextField label="Username" icon="at-outline" value={pUser} onChangeText={setPUser} placeholder="e.g. sunita_n" autoCapitalize="none" testID="pin-username" />
            <TextField label="PIN (4–6 digits)" icon="lock-closed-outline" value={pPin} onChangeText={(t) => setPPin(t.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••" keyboardType="number-pad" isPassword testID="pin-pin" />
            <Button label={busy ? "Saving…" : "Save login"} onPress={submitPin} loading={busy} disabled={busy || pUser.trim().length < 3 || pPin.trim().length < 4} testID="pin-submit" style={{ marginTop: spacing.md }} />
            <Pressable onPress={() => setPinModal(false)} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="helper-detail-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>{toast}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function SectionTitle({ children, c, noMargin }: { children: React.ReactNode; c: any; noMargin?: boolean }) {
  return (
    <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: noMargin ? 0 : spacing.xl, marginBottom: spacing.sm }}>
      {String(children).toUpperCase()}
    </AppText>
  );
}
function MiniLabel({ children, c }: { children: React.ReactNode; c: any }) {
  return <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, marginBottom: 6 }}>{children}</AppText>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.sm },
  roleIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  quickRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  quickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  tripBadge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 5 },
  tripMap: { width: "100%", height: 130, borderRadius: radius.md },
  rateRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  rateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md },
  rateHist: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  accRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  addTask: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  segRow: { flexDirection: "row", gap: spacing.sm },
  seg: { flex: 1, borderRadius: radius.pill, borderWidth: 1.5, paddingVertical: 10, alignItems: "center" },
  daysRow: { flexDirection: "row", gap: 6, justifyContent: "space-between" },
  dayBtn: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, paddingVertical: 10, alignItems: "center" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: 8 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, maxHeight: "88%" },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
