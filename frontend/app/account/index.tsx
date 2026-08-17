import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";

export default function AccountData() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, member, logout } = useAuth();
  const isAdmin = member?.role === "admin";
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const version = Constants.expoConfig?.version || "1.0.0";

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
});
