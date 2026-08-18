import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, RefreshControl, Modal, Linking, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { helperApi, helperUpload, setHelperToken } from "@/src/lib/helperApi";

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

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  const load = useCallback(async () => {
    try {
      setData(await helperApi("/helper/dashboard"));
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
      flash(stage === "en_route" ? "Trip started 🚗" : stage === "picked_up" ? "Picked up 🧒" : "Reached home ✅");
      load();
    } catch {
      flash("Couldn't update");
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
          <Pressable onPress={() => router.push("/helper-portal/handover")} style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID="portal-handover-btn">
            <Ionicons name="clipboard-outline" size={20} color={c.brandPrimary} />
            <AppText size={13} weight="bold" color={c.onSurface}>Handover</AppText>
            {data?.handover_today ? (
              <View style={[styles.navDot, { backgroundColor: c.brandPrimary }]} />
            ) : null}
          </Pressable>
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
                          <Pressable onPress={() => advanceTrip(t, "reached")} style={[styles.actBtn, { backgroundColor: c.success }]} testID={`trip-reached-${t.task_id}`}>
                            <Ionicons name="home" size={15} color="#fff" />
                            <AppText size={13} weight="bold" color="#fff">Reached Home</AppText>
                          </Pressable>
                        </>
                      );
                    })()}
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
  progress: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  navRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md },
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
