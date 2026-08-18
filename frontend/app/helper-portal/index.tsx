import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, RefreshControl, Modal, Linking, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { helperApi, helperUpload, setHelperToken } from "@/src/lib/helperApi";
import { setMediaToken } from "@/src/lib/api";

const CAT_ICON: Record<string, string> = {
  chore: "🧹", meal: "🍳", pickup: "🚗", care: "🧡", shopping: "🛒", other: "📌",
};
const ISSUE_REASONS = [
  "Unable to complete", "Missing item", "Child needs assistance", "Delay", "Something is wrong", "Other",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function clockOf(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export default function HelperPortal() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const [doneTask, setDoneTask] = useState<any>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [issueTask, setIssueTask] = useState<any>(null);
  const [issueReason, setIssueReason] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [liveTask, setLiveTask] = useState<string | null>(null);
  const liveWatch = useRef<any>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/dashboard");
      if (d?.media_token) setMediaToken(d.media_token);
      setData(d);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) {
        await setHelperToken(null);
        router.replace("/helper-login");
      }
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const signOut = async () => {
    try {
      await helperApi("/helper/signout", { method: "POST" });
    } catch {}
    await setHelperToken(null);
    router.replace("/helper-login");
  };

  const startTask = async (t: any) => {
    try {
      await helperApi(`/helper/tasks/${t.task_id}/start`, { method: "POST" });
      flash("Started ✍️");
      load();
    } catch {
      flash("Couldn't start");
    }
  };

  const openDone = (t: any) => {
    setDoneTask(t);
    setNote("");
    setPhoto(null);
  };

  const pickProof = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      flash("Allow photos to attach a picture");
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      setBusy(true);
      const up = await helperUpload(res.assets[0].uri);
      setPhoto(up.url);
    } catch {
      flash("Couldn't upload photo");
    }
    setBusy(false);
  };

  const submitDone = async () => {
    if (!doneTask) return;
    setBusy(true);
    try {
      await helperApi(`/helper/tasks/${doneTask.task_id}/complete`, {
        method: "POST",
        body: { note: note.trim() || null, photo_url: photo },
      });
      setDoneTask(null);
      flash("Marked done ✅");
      load();
    } catch (e: any) {
      flash(e?.message || "Couldn't complete");
    }
    setBusy(false);
  };

  const submitIssue = async () => {
    if (!issueTask || !issueReason) return;
    setBusy(true);
    try {
      await helperApi(`/helper/tasks/${issueTask.task_id}/issue`, {
        method: "POST",
        body: { reason: issueReason, note: issueNote.trim() || null },
      });
      setIssueTask(null);
      setIssueReason("");
      setIssueNote("");
      flash("The family has been notified 🔔");
      load();
    } catch {
      flash("Couldn't report");
    }
    setBusy(false);
  };

  const advanceTrip = async (t: any, stage: "en_route" | "picked_up" | "reached") => {
    try {
      await helperApi(`/helper/tasks/${t.task_id}/trip`, { method: "POST", body: { stage } });
      if (stage === "reached") stopShare();
      flash(stage === "en_route" ? "Trip started 🚗" : stage === "picked_up" ? "Picked up 🧒" : "Reached home ✅");
      load();
    } catch {
      flash("Couldn't update");
    }
  };

  const reachHome = async (t: any) => {
    // Ask the driver to snap a quick arrival photo (optional proof).
    let proof_url: string | null = null;
    try {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      let status = perm.status;
      if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestCameraPermissionsAsync()).status;
      if (status === "granted") {
        const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!res.canceled && res.assets?.[0]) {
          flash("Uploading arrival photo…");
          const up = await helperUpload(res.assets[0].uri);
          proof_url = up.url;
        }
      }
    } catch {}
    try {
      await helperApi(`/helper/tasks/${t.task_id}/trip`, { method: "POST", body: { stage: "reached", proof_url } });
      stopShare();
      flash(proof_url ? "Reached — arrival photo sent 📸" : "Reached home ✅");
      load();
    } catch {
      flash("Couldn't update");
    }
  };

  const checkIn = async () => {
    try {
      await helperApi("/helper/checkin", { method: "POST" });
      flash("You're on duty 🟢");
      load();
    } catch {
      flash("Couldn't check in");
    }
  };

  const checkOut = async () => {
    try {
      await helperApi("/helper/checkout", { method: "POST" });
      flash("Checked out 👋");
      load();
    } catch {
      flash("Couldn't check out");
    }
  };

  const ensureLocation = async () => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) return true;
    }
    flash("Enable location in Settings to share your live position");
    if (Platform.OS !== "web" && !perm.canAskAgain) Linking.openSettings();
    return false;
  };

  const stopShare = () => {
    if (liveWatch.current) {
      try { liveWatch.current.remove(); } catch {}
      liveWatch.current = null;
    }
    setLiveTask(null);
  };

  const startShare = async (t: any) => {
    if (!(await ensureLocation())) return;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await helperApi(`/helper/tasks/${t.task_id}/location`, { method: "POST", body: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      setLiveTask(t.task_id);
      flash("Sharing your live location 📍");
      if (Platform.OS === "web") return; // web can't keep a background watcher
      liveWatch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 30 },
        (p) => {
          helperApi(`/helper/tasks/${t.task_id}/location`, { method: "POST", body: { lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => {});
        }
      );
    } catch {
      flash("Couldn't get your location");
    }
  };

  const tasks = data?.tasks || [];
  const proofNeeded = doneTask?.require_proof;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText size={13} color={c.onSurfaceSecondary}>
            {greeting()},
          </AppText>
          <AppText family="display" weight="bold" size={24}>
            {data?.name || "Helper"} 👋
          </AppText>
          <AppText size={13} color={c.onSurfaceTertiary}>
            {data?.role_label}{data?.family_name ? ` · ${data.family_name}` : ""}
          </AppText>
        </View>
        <Pressable onPress={() => router.push("/helper-portal/notifications")} hitSlop={10} testID="helper-notif-btn" style={[styles.iconBtn, { backgroundColor: c.surface, marginRight: spacing.sm }]}>
          <Ionicons name="notifications-outline" size={20} color={c.onSurface} />
          {data?.notif_unread ? (
            <View style={[styles.headerBadge, { backgroundColor: c.error }]} testID="helper-notif-badge">
              <AppText size={10} weight="bold" color="#fff">{data.notif_unread > 9 ? "9+" : data.notif_unread}</AppText>
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={signOut} hitSlop={10} testID="helper-signout" style={[styles.iconBtn, { backgroundColor: c.surface }]}>
          <Ionicons name="log-out-outline" size={20} color={c.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brandPrimary} />}
      >
        <View style={[styles.progress, { backgroundColor: c.brandTertiary }]}>
          <AppText family="display" weight="bold" size={16} color={c.onBrandTertiary}>
            Today's Work
          </AppText>
          <AppText size={13} color={c.onBrandTertiary}>
            {data ? `${data.done} of ${data.total} done` : "…"}
          </AppText>
        </View>

        {data?.rated_up_today ? (
          <View style={[styles.praise, { backgroundColor: c.success + "18", borderColor: c.success + "40" }]} testID="portal-praise">
            <AppText size={20}>👍</AppText>
            <AppText size={13} weight="semibold" color={c.success} style={{ flex: 1 }}>
              The family appreciated your work today. Thank you!
            </AppText>
          </View>
        ) : null}

        {data?.shift ? (
          <View
            style={[styles.shift, {
              backgroundColor: data.shift.reminder ? c.warning + "20" : data.shift.on_duty ? c.success + "18" : c.surfaceSecondary,
              borderColor: data.shift.reminder ? c.warning + "55" : data.shift.on_duty ? c.success + "40" : c.border,
            }]}
            testID="portal-shift"
          >
            <AppText size={20}>{data.shift.reminder ? "⏰" : data.shift.on_duty ? "🟢" : "🗓️"}</AppText>
            <AppText size={13} weight="semibold" color={c.onSurface} style={{ flex: 1 }}>
              {data.shift.reminder
                ? `Your shift starts at ${data.shift.start_time} — about ${data.shift.minutes_until} min to go. Get ready!`
                : data.shift.on_duty
                ? `You're on shift${data.shift.end_time ? ` until ${data.shift.end_time}` : ""}.`
                : data.shift.today
                ? `Today's shift: ${data.shift.start_time}${data.shift.end_time ? `–${data.shift.end_time}` : ""}`
                : `Next shift at ${data.shift.start_time}`}
            </AppText>
          </View>
        ) : null}

        {data ? (
          !data.checkin?.checked_in_at ? (
            <Pressable onPress={checkIn} style={[styles.checkinBtn, { backgroundColor: c.success }]} testID="portal-checkin">
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <AppText size={15} weight="bold" color="#fff">I've arrived — start my shift</AppText>
            </Pressable>
          ) : !data.checkin?.checked_out_at ? (
            <View style={[styles.checkinRow, { backgroundColor: c.success + "18", borderColor: c.success + "40" }]} testID="portal-onduty">
              <AppText size={13} weight="semibold" color={c.success} style={{ flex: 1 }}>
                🟢 On duty since {clockOf(data.checkin.checked_in_at)}
              </AppText>
              <Pressable onPress={checkOut} style={[styles.checkoutBtn, { borderColor: c.border }]} testID="portal-checkout">
                <AppText size={13} weight="bold" color={c.onSurface}>Check out</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.checkinRow, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="portal-checkedout">
              <AppText size={13} weight="semibold" color={c.onSurfaceSecondary}>
                ✅ Shift ended at {clockOf(data.checkin.checked_out_at)}
              </AppText>
            </View>
          )
        ) : null}

        <View style={styles.navRow}>
          {data?.can_chat ? (
            <Pressable onPress={() => router.push("/helper-portal/chat")} style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="portal-chat-btn">
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.brandPrimary} />
              <AppText size={13} weight="bold" color={c.onSurface}>Chat</AppText>
              {data?.unread_chat ? (
                <View style={[styles.navBadge, { backgroundColor: c.error }]}>
                  <AppText size={10} weight="bold" color="#fff">{data.unread_chat}</AppText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {data?.can_chat ? (
            <Pressable onPress={() => router.push("/helper-portal/care-team")} style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="portal-careteam-btn">
              <Ionicons name="people-outline" size={20} color={c.brandPrimary} />
              <AppText size={13} weight="bold" color={c.onSurface}>Care Team</AppText>
              {data?.care_team_unread ? (
                <View style={[styles.navBadge, { backgroundColor: c.error }]}>
                  <AppText size={10} weight="bold" color="#fff">{data.care_team_unread}</AppText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push("/helper-portal/handover")} style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="portal-handover-btn">
            <Ionicons name="clipboard-outline" size={20} color={c.brandPrimary} />
            <AppText size={13} weight="bold" color={c.onSurface}>Handover</AppText>
            {data?.handover_today ? (
              <View style={[styles.navDot, { backgroundColor: c.brandPrimary }]} />
            ) : null}
          </Pressable>
          {data?.can_view_medical ? (
            <Pressable onPress={() => router.push("/helper-portal/medical")} style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="portal-medical-btn">
              <Ionicons name="medkit-outline" size={20} color="#C24B4B" />
              <AppText size={13} weight="bold" color={c.onSurface}>Medical</AppText>
            </Pressable>
          ) : null}
        </View>

        {tasks.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🌤️</AppText>
            <AppText size={15} color={c.onSurfaceTertiary} style={{ marginTop: spacing.md }}>
              No tasks for today. Enjoy your day!
            </AppText>
          </View>
        ) : (
          tasks.map((t: any) => (
            <View key={t.task_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: t.done ? 0.7 : 1 }, shadow(1)]} testID={`htask-${t.task_id}`}>
              <View style={styles.cardTop}>
                {t.due_time ? (
                  <View style={[styles.timePill, { backgroundColor: c.surfaceSecondary }]}>
                    <AppText size={12} weight="bold" color={c.onSurfaceSecondary}>
                      {t.due_time}
                    </AppText>
                  </View>
                ) : null}
                {t.priority === "high" ? (
                  <View style={[styles.timePill, { backgroundColor: "#E86A6A22" }]}>
                    <AppText size={11} weight="bold" color="#C24B4B">
                      Important
                    </AppText>
                  </View>
                ) : null}
                {t.done ? (
                  <View style={[styles.timePill, { backgroundColor: c.success + "22" }]}>
                    <Ionicons name="checkmark-circle" size={14} color={c.success} />
                    <AppText size={11} weight="bold" color={c.success}>
                      Done
                    </AppText>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardBody}>
                <AppText size={26}>{CAT_ICON[t.category] || "📌"}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16} style={{ textDecorationLine: t.done ? "line-through" : "none" }}>
                    {t.title}
                  </AppText>
                  {t.member ? (
                    <AppText size={13} color={c.onSurfaceSecondary}>
                      For {t.member.name}
                    </AppText>
                  ) : null}
                  {t.instructions ? (
                    <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                      {t.instructions}
                    </AppText>
                  ) : null}
                  {t.category === "pickup" && (t.pickup_from || t.pickup_to) ? (
                    <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: 4 }}>
                      🚗 {t.pickup_from || "—"} → {t.pickup_to || "—"}
                    </AppText>
                  ) : null}
                  {t.require_proof ? (
                    <View style={styles.proofTag}>
                      <Ionicons name={t.require_proof === "photo" ? "camera" : "create-outline"} size={12} color={c.onSurfaceTertiary} />
                      <AppText size={11} color={c.onSurfaceTertiary}>
                        {t.require_proof === "photo" ? "Photo needed" : t.require_proof === "note" ? "Note needed" : "Confirm needed"}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>

              {!t.done ? (
                t.category === "pickup" ? (
                  <View style={styles.actions}>
                    {(() => {
                      const stage = t.completion?.trip?.status;
                      if (!stage) {
                        return (
                          <Pressable onPress={() => advanceTrip(t, "en_route")} style={[styles.actBtn, { backgroundColor: c.brandPrimary }]} testID={`trip-start-${t.task_id}`}>
                            <Ionicons name="navigate" size={15} color="#fff" />
                            <AppText size={13} weight="bold" color="#fff">Start Trip</AppText>
                          </Pressable>
                        );
                      }
                      if (stage === "en_route") {
                        return (
                          <>
                            <View style={[styles.tripChip, { backgroundColor: c.brandTertiary }]}>
                              <AppText size={12} weight="bold" color={c.onBrandTertiary}>🚗 On the way</AppText>
                            </View>
                            <Pressable onPress={() => advanceTrip(t, "picked_up")} style={[styles.actBtn, { backgroundColor: c.brandPrimary }]} testID={`trip-pickup-${t.task_id}`}>
                              <Ionicons name="person-add" size={15} color="#fff" />
                              <AppText size={13} weight="bold" color="#fff">Child Picked Up</AppText>
                            </Pressable>
                          </>
                        );
                      }
                      return (
                        <>
                          <View style={[styles.tripChip, { backgroundColor: c.brandTertiary }]}>
                            <AppText size={12} weight="bold" color={c.onBrandTertiary}>🧒 Picked up</AppText>
                          </View>
                          <Pressable onPress={() => reachHome(t)} style={[styles.actBtn, { backgroundColor: c.success }]} testID={`trip-reached-${t.task_id}`}>
                            <Ionicons name="home" size={15} color="#fff" />
                            <AppText size={13} weight="bold" color="#fff">Reached Home</AppText>
                          </Pressable>
                        </>
                      );
                    })()}
                    {["en_route", "picked_up"].includes(t.completion?.trip?.status) ? (
                      <Pressable onPress={() => (liveTask === t.task_id ? stopShare() : startShare(t))} style={[styles.actBtn, { backgroundColor: liveTask === t.task_id ? c.error : c.surfaceSecondary }]} testID={`trip-live-${t.task_id}`}>
                        <Ionicons name={liveTask === t.task_id ? "stop" : "location"} size={15} color={liveTask === t.task_id ? "#fff" : c.onSurface} />
                        <AppText size={13} weight="bold" color={liveTask === t.task_id ? "#fff" : c.onSurface}>
                          {liveTask === t.task_id ? "Stop sharing" : "Share live location"}
                        </AppText>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => { setIssueTask(t); setIssueReason(""); setIssueNote(""); }} style={[styles.actBtn, { backgroundColor: "#E86A6A18" }]} testID={`htask-help-${t.task_id}`}>
                      <Ionicons name="help-buoy-outline" size={15} color="#C24B4B" />
                      <AppText size={13} weight="bold" color="#C24B4B">Need help</AppText>
                    </Pressable>
                  </View>
                ) : (
                <View style={styles.actions}>
                  {!t.started ? (
                    <Pressable onPress={() => startTask(t)} style={[styles.actBtn, { backgroundColor: c.surfaceSecondary }]} testID={`htask-start-${t.task_id}`}>
                      <Ionicons name="play" size={15} color={c.onSurface} />
                      <AppText size={13} weight="bold" color={c.onSurface}>Start</AppText>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => openDone(t)} style={[styles.actBtn, { backgroundColor: c.brandPrimary }]} testID={`htask-done-${t.task_id}`}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <AppText size={13} weight="bold" color="#fff">Mark done</AppText>
                  </Pressable>
                  <Pressable onPress={() => { setIssueTask(t); setIssueReason(""); setIssueNote(""); }} style={[styles.actBtn, { backgroundColor: "#E86A6A18" }]} testID={`htask-help-${t.task_id}`}>
                    <Ionicons name="help-buoy-outline" size={15} color="#C24B4B" />
                    <AppText size={13} weight="bold" color="#C24B4B">Need help</AppText>
                  </Pressable>
                </View>
                )
              ) : (
                t.completion?.note || t.completion?.photo_url ? (
                  <View style={[styles.doneNote, { borderTopColor: c.border }]}>
                    {t.completion?.photo_url ? <SmartImage uri={t.completion.photo_url} style={styles.doneThumb} /> : null}
                    {t.completion?.note ? (
                      <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
                        “{t.completion.note}”
                      </AppText>
                    ) : null}
                  </View>
                ) : null
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Mark done sheet */}
      <Modal visible={!!doneTask} transparent animationType="slide" onRequestClose={() => setDoneTask(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]}>
            <AppText family="display" weight="bold" size={18} center>
              Mark done
            </AppText>
            <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginBottom: spacing.md }}>
              {doneTask?.title}
            </AppText>
            {proofNeeded === "photo" || photo ? (
              <Pressable onPress={pickProof} style={[styles.photoBox, { borderColor: c.border, backgroundColor: c.surfaceSecondary }]} testID="helper-add-proof">
                {photo ? (
                  <SmartImage uri={photo} style={styles.proofImg} />
                ) : (
                  <>
                    <Ionicons name="camera" size={26} color={c.onSurfaceTertiary} />
                    <AppText size={13} color={c.onSurfaceTertiary}>Add a photo</AppText>
                  </>
                )}
              </Pressable>
            ) : null}
            <TextField
              label={proofNeeded === "note" ? "Add a note (required)" : "Add a note (optional)"}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. All done, kitchen cleaned"
              multiline
              testID="helper-done-note"
            />
            <Button
              label={busy ? "Saving…" : "Confirm done"}
              onPress={submitDone}
              loading={busy}
              disabled={busy || (proofNeeded === "photo" && !photo) || (proofNeeded === "note" && !note.trim())}
              testID="helper-done-submit"
              style={{ marginTop: spacing.md }}
            />
            <Pressable onPress={() => setDoneTask(null)} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Need help sheet */}
      <Modal visible={!!issueTask} transparent animationType="slide" onRequestClose={() => setIssueTask(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]}>
            <AppText family="display" weight="bold" size={18} center>
              Need help?
            </AppText>
            <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginBottom: spacing.md }}>
              Tell the family what's happening
            </AppText>
            <View style={styles.reasonWrap}>
              {ISSUE_REASONS.map((r) => {
                const sel = issueReason === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setIssueReason(r)}
                    style={[styles.reasonChip, { borderColor: sel ? c.brandPrimary : c.border, backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary }]}
                    testID={`issue-${r}`}
                  >
                    <AppText size={13} weight={sel ? "bold" : "medium"} color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>
                      {r}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <TextField label="Add details (optional)" value={issueNote} onChangeText={setIssueNote} placeholder="e.g. School bus delayed by 20 minutes" multiline testID="issue-note" />
            <Button label={busy ? "Sending…" : "Send to family"} onPress={submitIssue} loading={busy} disabled={busy || !issueReason} testID="issue-submit" style={{ marginTop: spacing.md }} />
            <Pressable onPress={() => setIssueTask(null)} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="helper-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {toast}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", ...shadow(1) },
  headerBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1.5, borderColor: "#fff" },
  progress: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  navRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  navBtn: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md },
  praise: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  shift: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  checkinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.lg, paddingVertical: spacing.md, marginBottom: spacing.md, ...shadow(1) },
  checkinRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  checkoutBtn: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  navBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  navDot: { width: 8, height: 8, borderRadius: 4 },
  tripChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 9, justifyContent: "center" },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  timePill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  cardBody: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  proofTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 9 },
  doneNote: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md },
  doneThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.xl },
  photoBox: { height: 130, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: spacing.md, overflow: "hidden" },
  proofImg: { width: "100%", height: "100%" },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  reasonChip: { borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: 9 },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
