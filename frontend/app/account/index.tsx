import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, TextInput, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";

export default function AccountData() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, member, logout, pinSet, setPin: savePin, clearPin } = useAuth();
  const isAdmin = member?.role === "admin";
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState("");
  const [pinModal, setPinModal] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const doSavePin = async () => {
    setPinErr("");
    if (!/^\d{4}$/.test(pinValue)) {
      setPinErr("PIN must be exactly 4 digits");
      return;
    }
    setPinBusy(true);
    try {
      await savePin(pinValue);
      setPinModal(false);
      setPinValue("");
      flash("Quick sign-in PIN saved.");
    } catch {
      setPinErr("Couldn't save your PIN. Please try again.");
    } finally {
      setPinBusy(false);
    }
  };

  const doRemovePin = async () => {
    setPinBusy(true);
    try {
      await clearPin();
      flash("PIN removed.");
    } catch {
    } finally {
      setPinBusy(false);
    }
  };

  const version = Constants.expoConfig?.version || "1.0.0";

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 3000);
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api("/family/export");
      const json = JSON.stringify(data, null, 2);
      const filename = `familyhome-export-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = (globalThis as any).document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        flash("Your data has been downloaded.");
      } else {
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(json);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Export family data" });
        } else {
          flash("Saved to app storage.");
        }
      }
    } catch {
      flash("Couldn't export right now. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api("/auth/account", { method: "DELETE" });
      await logout();
    } catch {
      setDeleting(false);
    }
  };

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="account-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Account & Data
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <Field c={c} label="Name" value={member?.name || user?.name || "—"} />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <Field c={c} label="Email" value={user?.email || "—"} />
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          <Field c={c} label="App version" value={version} />
        </View>

        <AppText size={12} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm, marginLeft: 4 }}>
          To change your name or photo, go to your profile.
        </AppText>

        {/* data export (organizer) */}
        {isAdmin ? (
          <View style={{ marginTop: spacing.xl }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              YOUR DATA
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: spacing.lg }, shadow(1)]}>
              <AppText family="display" weight="bold" size={16} style={{ marginBottom: 6 }}>
                Export family data
              </AppText>
              <AppText size={13} color={c.onSurfaceSecondary} style={{ lineHeight: 20, marginBottom: spacing.md }}>
                Download a complete copy of your family&rsquo;s data as a JSON file — a good idea before deleting your account.
              </AppText>
              <Button
                label={exporting ? "Preparing…" : "Export My Data"}
                variant="secondary"
                loading={exporting}
                onPress={exportData}
                testID="export-data-btn"
              />
            </View>
          </View>
        ) : null}

        {/* sign-in methods (Apple ID linking — iOS only) */}
        {Platform.OS === "ios" ? (
          <View style={{ marginTop: spacing.xl }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              SIGN-IN METHODS
            </AppText>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: spacing.lg }, shadow(1)]}>
              {user?.apple_linked ? (
                <View style={styles.appleLinkedRow}>
                  <Ionicons name="logo-apple" size={22} color={c.onSurface} />
                  <AppText size={15} weight="semibold" style={{ flex: 1 }}>
                    Apple ID linked
                  </AppText>
                  <Ionicons name="checkmark-circle" size={22} color={c.success} />
                </View>
              ) : (
                <>
                  <AppText size={13} color={c.onSurfaceSecondary} style={{ lineHeight: 20, marginBottom: spacing.md }}>
                    Link your Apple ID so you can also sign in with Apple next time.
                  </AppText>
                  <AppleSignInButton
                    action="link"
                    variant="black"
                    onError={flash}
                    onSuccess={() => flash("Apple ID linked.")}
                  />
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* quick sign-in PIN */}
        <View style={{ marginTop: spacing.xl }}>
          <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
            QUICK SIGN-IN
          </AppText>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: spacing.lg }, shadow(1)]}>
            <View style={styles.pinRow}>
              <Ionicons name="keypad-outline" size={22} color={c.onSurface} />
              <View style={{ flex: 1 }}>
                <AppText size={15} weight="semibold">Unlock with a PIN</AppText>
                <AppText size={12} color={c.onSurfaceSecondary} style={{ marginTop: 2 }}>
                  {pinSet ? "On — sign back in fast with a 4-digit PIN" : "Set a 4-digit PIN to sign in quickly on this device"}
                </AppText>
              </View>
              {pinSet ? (
                <View style={[styles.onPill, { backgroundColor: c.success + "22" }]}>
                  <AppText size={11} weight="bold" color={c.success}>ON</AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.pinBtns}>
              <Pressable
                onPress={() => { setPinValue(""); setPinErr(""); setPinModal(true); }}
                style={[styles.pinAction, { backgroundColor: c.brandTertiary }]}
                testID="account-set-pin"
              >
                <AppText size={14} weight="bold" color={c.onBrandTertiary}>
                  {pinSet ? "Change PIN" : "Set up PIN"}
                </AppText>
              </Pressable>
              {pinSet ? (
                <Pressable onPress={doRemovePin} disabled={pinBusy} style={[styles.pinAction, { backgroundColor: c.error + "14" }]} testID="account-remove-pin">
                  <AppText size={14} weight="bold" color={c.error}>Remove</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* danger zone */}
        <View style={{ marginTop: spacing["2xl"] }}>
          <AppText size={12} weight="bold" color={c.error} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
            DANGER ZONE
          </AppText>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.error + "55", padding: spacing.lg }, shadow(1)]}>
            <AppText family="display" weight="bold" size={16} style={{ marginBottom: 6 }}>
              Delete my account
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary} style={{ lineHeight: 20, marginBottom: spacing.md }}>
              {isAdmin
                ? "You are the family organizer. Deleting your account will permanently remove the entire family space and all of its data for everyone. This cannot be undone."
                : "This permanently removes your login and your personal profile from the family. This cannot be undone."}
            </AppText>
            <Button label="Delete Account" variant="danger" onPress={() => setShowConfirm(true)} testID="delete-account-btn" />
          </View>
        </View>
      </ScrollView>

      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.confirmCard, { backgroundColor: c.surface }]}>
            <View style={[styles.warnIcon, { backgroundColor: c.error + "22" }]}>
              <Ionicons name="warning" size={26} color={c.error} />
            </View>
            <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.sm }}>
              Delete account?
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary} center style={{ marginTop: 6, lineHeight: 20 }}>
              {isAdmin
                ? "This will permanently delete the whole family space and everyone’s data. This cannot be undone."
                : "This will permanently delete your account and personal data. This cannot be undone."}
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary} center style={{ marginTop: spacing.md }}>
              Type DELETE to confirm
            </AppText>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={c.onSurfaceTertiary}
              style={[styles.input, { borderColor: canDelete ? c.error : c.border, color: c.onSurface }]}
              testID="delete-confirm-input"
            />
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <Button
                label="Delete Forever"
                variant="danger"
                disabled={!canDelete}
                loading={deleting}
                onPress={doDelete}
                testID="delete-confirm-btn"
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                testID="delete-cancel-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* set / change PIN */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.confirmCard, { backgroundColor: c.surface }]}>
            <View style={[styles.warnIcon, { backgroundColor: c.brandTertiary }]}>
              <Ionicons name="keypad" size={26} color={c.brand} />
            </View>
            <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.sm }}>
              {pinSet ? "Change your PIN" : "Set a quick-sign-in PIN"}
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary} center style={{ marginTop: 6, lineHeight: 20 }}>
              Choose a 4-digit PIN to sign back in fast on this device.
            </AppText>
            <TextInput
              value={pinValue}
              onChangeText={(t) => setPinValue(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={c.onSurfaceTertiary}
              style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              testID="account-pin-input"
            />
            {pinErr ? (
              <AppText size={12} color={c.error} center style={{ marginTop: spacing.sm }}>
                {pinErr}
              </AppText>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, width: "100%" }}>
              <Button label="Cancel" variant="secondary" onPress={() => setPinModal(false)} style={{ flex: 1 }} />
              <Button label="Save PIN" onPress={doSavePin} loading={pinBusy} style={{ flex: 1 }} testID="account-pin-save" />
            </View>
          </View>
        </View>
      </Modal>

      {note ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 30 }]} testID="account-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {note}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Field({ c, label, value }: any) {
  return (
    <View style={styles.field}>
      <AppText size={12} color={c.onSurfaceTertiary}>
        {label}
      </AppText>
      <AppText size={15} weight="semibold" style={{ marginTop: 2 }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  field: { padding: spacing.md },
  appleLinkedRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pinRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  onPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pinBtns: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  pinAction: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: "center" },
  divider: { height: 1, marginHorizontal: spacing.md },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmCard: { width: "100%", maxWidth: 360, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  warnIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  input: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow(3) },
});
