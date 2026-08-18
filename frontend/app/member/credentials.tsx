import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function MemberCredentials() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string; username?: string; hasLogin?: string }>();
  const hasLogin = params.hasLogin === "1";
  const firstName = (params.name || "this member").split(" ")[0];

  const [username, setUsername] = useState((params.username as string) || "");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const save = async () => {
    setError("");
    const body: any = {};
    if (username.trim()) body.username = username.trim();
    if (password) body.password = password;
    if (pin) body.pin = pin;
    if (!hasLogin && !body.username) {
      setError("Choose a username for " + firstName);
      return;
    }
    if (!hasLogin && !body.password && !body.pin) {
      setError("Set a password or a PIN so they can sign in");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits");
      return;
    }
    if (password && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!body.username && !body.password && !body.pin) {
      setError("Nothing to update");
      return;
    }
    setLoading(true);
    try {
      await api(`/families/members/${params.id}/credentials`, { method: "POST", body });
      setDone(true);
      setTimeout(() => router.back(), 1100);
    } catch (e: any) {
      setError(e?.message || "Couldn't save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <AppText family="display" weight="bold" size={19} style={{ flex: 1 }}>
          {hasLogin ? "Reset login" : "Set up login"}
        </AppText>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="cred-close" accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.info, { backgroundColor: c.brandTertiary }]}>
          <AppText size={13} color={c.onSurface} style={{ lineHeight: 20 }}>
            {hasLogin
              ? `Give ${firstName} a new password or PIN. They sign in by picking their name and typing their PIN, or with their username and password.`
              : `Create a username and a PIN (or password) for ${firstName}. Kids don't need an email — they sign in by tapping their name and entering their PIN.`}
          </AppText>
        </View>

        <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
          <TextField
            label="Username"
            icon="at-outline"
            placeholder="e.g. aarav"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
            testID="cred-username"
          />
          <TextField
            label={hasLogin ? "New PIN (4 digits)" : "PIN (4 digits)"}
            icon="keypad-outline"
            placeholder="1234"
            keyboardType="number-pad"
            maxLength={4}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
            testID="cred-pin"
          />
          <TextField
            label={hasLogin ? "New password (optional)" : "Password (optional)"}
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            isPassword
            value={password}
            onChangeText={setPassword}
            testID="cred-password"
          />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.md }} testID="cred-error">
            {error}
          </AppText>
        ) : null}
        {done ? (
          <View style={[styles.doneRow, { backgroundColor: c.success + "1A" }]} testID="cred-done">
            <Ionicons name="checkmark-circle" size={18} color={c.success} />
            <AppText size={13} weight="semibold" color={c.success}>
              Login saved for {firstName}
            </AppText>
          </View>
        ) : null}

        <Button label={hasLogin ? "Update login" : "Create login"} onPress={save} loading={loading} style={{ marginTop: spacing.xl }} testID="cred-save" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  info: { borderRadius: radius.lg, padding: spacing.lg },
  doneRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
});
