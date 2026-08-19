import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { formatFileSize } from "@/src/lib/fileMeta";

const AGE_PRESETS = [
  { label: "Older than 90 days", days: 90 },
  { label: "Older than 30 days", days: 30 },
  { label: "Older than 7 days", days: 7 },
  { label: "Everything", days: 0 },
];

// Recursively sum the byte size of a directory (bounded depth so we never hang).
async function dirSize(uri: string, depth = 0): Promise<number> {
  if (depth > 4) return 0;
  try {
    const names = await FileSystem.readDirectoryAsync(uri);
    let total = 0;
    for (const name of names) {
      const child = uri.endsWith("/") ? uri + name : `${uri}/${name}`;
      const info = await FileSystem.getInfoAsync(child, { size: true });
      if (!info.exists) continue;
      if (info.isDirectory) total += await dirSize(child, depth + 1);
      else total += (info as any).size || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

async function clearDir(uri: string): Promise<void> {
  try {
    const names = await FileSystem.readDirectoryAsync(uri);
    for (const name of names) {
      const child = uri.endsWith("/") ? uri + name : `${uri}/${name}`;
      await FileSystem.deleteAsync(child, { idempotent: true }).catch(() => {});
    }
  } catch {}
}

export default function StorageSettings() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const isParent = member?.role === "admin" || member?.role === "parent";
  const isWeb = Platform.OS === "web";

  const [usage, setUsage] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [note, setNote] = useState("");

  // family cleanup modal
  const [confirm, setConfirm] = useState<null | { scope: "chat_media" | "chat_history"; days: number; label: string }>(null);
  const [running, setRunning] = useState(false);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 3200);
  };

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await api("/storage/usage"));
    } catch {}
    try {
      const bd = await api("/storage/breakdown");
      setBreakdown(bd.months || []);
    } catch {}
  }, []);

  const measureCache = useCallback(async () => {
    if (isWeb) return;
    const dirs = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter(Boolean) as string[];
    let total = 0;
    for (const d of dirs) total += await dirSize(d);
    setCacheBytes(total);
  }, [isWeb]);

  useFocusEffect(
    useCallback(() => {
      loadUsage();
      measureCache();
    }, [loadUsage, measureCache])
  );

  const clearCache = async () => {
    if (isWeb) return;
    setClearingCache(true);
    try {
      if (FileSystem.cacheDirectory) await clearDir(FileSystem.cacheDirectory);
      await measureCache();
      flash("Freed up space on this phone 🧹");
    } catch {
      flash("Couldn't clear the cache");
    }
    setClearingCache(false);
  };

  const runCleanup = async () => {
    if (!confirm) return;
    setRunning(true);
    try {
      const res = await api("/storage/cleanup", {
        method: "POST",
        body: { scope: confirm.scope, older_than_days: confirm.days },
      });
      const n = res.media_removed ?? res.messages_removed ?? 0;
      flash(
        confirm.scope === "chat_media"
          ? `Removed ${n} attachment${n === 1 ? "" : "s"} for the family`
          : `Deleted ${n} message${n === 1 ? "" : "s"} for the family`
      );
      await loadUsage();
    } catch (e: any) {
      flash(e?.message || "Couldn't clear family data");
    }
    setRunning(false);
    setConfirm(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="storage-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Storage & Cleanup
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* usage summary */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.md }}>
            FAMILY CHAT DATA
          </AppText>
          <View style={styles.statsRow}>
            <Stat n={usage?.messages ?? 0} label="Messages" c={c} />
            <Stat n={usage?.media_messages ?? 0} label="With media" c={c} />
            <Stat n={usage?.media_files ?? 0} label="Stored files" c={c} />
          </View>
        </View>

        {/* per-month breakdown */}
        {breakdown.length > 0 ? (
          <>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
              WHERE YOUR SPACE GOES
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
              {breakdown.map((m, i) => {
                const max = Math.max(...breakdown.map((x) => x.messages || 0), 1);
                const pct = Math.max(0.06, (m.messages || 0) / max);
                return (
                  <View key={m.month} style={[styles.monthRow, i > 0 && { marginTop: spacing.md }]}>
                    <View style={styles.monthTop}>
                      <AppText size={14} weight="semibold">
                        {m.label}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        {m.messages} msg{m.media ? ` · ${m.media} media` : ""}
                      </AppText>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: c.surfaceSecondary }]}>
                      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: c.brand }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Option A — device cache */}
        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
          FREE UP SPACE ON THIS PHONE
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={styles.optRow}>
            <View style={[styles.optIcon, { backgroundColor: "#7FA9C922" }]}>
              <Ionicons name="phone-portrait" size={20} color="#5A86AE" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={15}>
                Clear downloaded files
              </AppText>
              <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: 2, lineHeight: 19 }}>
                Removes cached photos and files stored on this device only. Nothing is deleted for your family — everything re-downloads when you need it.
              </AppText>
            </View>
          </View>
          {isWeb ? (
            <View style={[styles.infoBox, { backgroundColor: c.surfaceSecondary }]}>
              <AppText size={13} color={c.onSurfaceTertiary}>
                This works in the FamilyHome mobile app on your phone.
              </AppText>
            </View>
          ) : (
            <>
              <View style={[styles.infoBox, { backgroundColor: c.surfaceSecondary }]}>
                <Ionicons name="folder-open" size={16} color={c.onSurfaceTertiary} />
                <AppText size={13} color={c.onSurfaceSecondary}>
                  {cacheBytes == null ? "Calculating…" : cacheBytes > 0 ? `${formatFileSize(cacheBytes)} of cached files` : "No cached files to clear"}
                </AppText>
              </View>
              <Button
                label={clearingCache ? "Clearing…" : "Clear downloaded files"}
                variant="secondary"
                loading={clearingCache}
                disabled={clearingCache || !cacheBytes}
                onPress={clearCache}
                testID="storage-clear-cache"
                style={{ marginTop: spacing.md }}
              />
            </>
          )}
        </View>

        {/* Option B — family cloud cleanup */}
        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
          CLEAR FAMILY CHAT DATA
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={styles.optRow}>
            <View style={[styles.optIcon, { backgroundColor: "#E86A6A22" }]}>
              <Ionicons name="cloud-offline" size={20} color="#D45151" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={15}>
                Delete old chat data
              </AppText>
              <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: 2, lineHeight: 19 }}>
                Permanently removes old chat messages or attachments for everyone in the family. This can’t be undone.
              </AppText>
            </View>
          </View>

          {!isParent ? (
            <View style={[styles.infoBox, { backgroundColor: c.surfaceSecondary }]}>
              <Ionicons name="lock-closed" size={16} color={c.onSurfaceTertiary} />
              <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
                Only a parent or the family organizer can clear shared family data.
              </AppText>
            </View>
          ) : (
            <>
              <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                Remove attachments only
              </AppText>
              <View style={styles.chipRow}>
                {AGE_PRESETS.map((p) => (
                  <Pressable
                    key={`m${p.days}`}
                    onPress={() => setConfirm({ scope: "chat_media", days: p.days, label: p.label })}
                    style={[styles.chip, { borderColor: c.border, backgroundColor: c.surfaceSecondary }]}
                    testID={`cleanup-media-${p.days}`}
                  >
                    <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>
                      {p.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}>
                Delete whole messages
              </AppText>
              <View style={styles.chipRow}>
                {AGE_PRESETS.map((p) => (
                  <Pressable
                    key={`h${p.days}`}
                    onPress={() => setConfirm({ scope: "chat_history", days: p.days, label: p.label })}
                    style={[styles.chip, { borderColor: "#E86A6A55", backgroundColor: "#E86A6A11" }]}
                    testID={`cleanup-history-${p.days}`}
                  >
                    <AppText size={12} weight="semibold" color="#C24B4B">
                      {p.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* confirmation */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.confirmCard, { backgroundColor: c.surface }, shadow(3)]}>
            <View style={[styles.optIcon, { backgroundColor: "#E86A6A22", alignSelf: "center", marginBottom: spacing.md }]}>
              <Ionicons name="warning" size={22} color="#D45151" />
            </View>
            <AppText family="display" weight="bold" size={18} center>
              {confirm?.scope === "chat_media" ? "Remove attachments?" : "Delete messages?"}
            </AppText>
            <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginTop: spacing.sm, lineHeight: 20 }}>
              {confirm?.days === 0
                ? confirm?.scope === "chat_media"
                  ? "This removes every chat attachment for the whole family. Chats stay, but photos and files are gone."
                  : "This permanently deletes ALL family chat messages for everyone. This can’t be undone."
                : `This affects family chat ${confirm?.scope === "chat_media" ? "attachments" : "messages"} ${confirm?.label.toLowerCase()}, for everyone. This can’t be undone.`}
            </AppText>
            <Button
              label={running ? "Working…" : "Delete for everyone"}
              loading={running}
              onPress={runCleanup}
              testID="cleanup-confirm"
              style={{ marginTop: spacing.lg, backgroundColor: "#D45151" }}
            />
            <Pressable onPress={() => setConfirm(null)} style={{ paddingVertical: spacing.md, alignItems: "center" }} testID="cleanup-cancel">
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>
                Cancel
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>

      {note ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="storage-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ n, label, c }: { n: number; label: string; c: any }) {
  return (
    <View style={styles.stat}>
      <AppText family="display" weight="bold" size={24}>
        {n}
      </AppText>
      <AppText size={12} color={c.onSurfaceTertiary} center>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center", flex: 1 },
  monthRow: {},
  monthTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  barTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  optRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  optIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  infoBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  confirmCard: { borderRadius: 22, padding: spacing.xl },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow(3) },
});
