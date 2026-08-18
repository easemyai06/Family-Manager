import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";

export default function ForgotPassword() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resetPassword } = useAuth();
  const [phase, setPhase] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter the email for your account");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setPhase("verify");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    setError("");
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    if (password.length < 6) {
      setError("Your new password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      // success — auth gate will route into the app
    } catch (e: any) {
      setError(e?.message || "That code is invalid or has expired. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => (phase === "verify" ? setPhase("request") : router.back())} hitSlop={12} style={styles.back} testID="forgot-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>

        <AppText family="display" weight="bold" size={28} style={{ marginTop: spacing.lg }}>
          {phase === "request" ? "Reset password" : "Enter your code"}
        </AppText>
        <AppText size={15} color={c.onSurfaceSecondary} style={{ marginTop: 6, marginBottom: spacing.xl, lineHeight: 22 }}>
          {phase === "request"
            ? "Enter your account email and we'll send you a 6-digit code to reset your password."
            : `We emailed a 6-digit code to ${email.trim()}. Enter it below with your new password.`}
        </AppText>

        {phase === "request" ? (
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="Email"
              icon="mail-outline"
              placeholder="you@family.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="forgot-email-input"
            />
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="6-digit code"
              icon="keypad-outline"
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              testID="forgot-code-input"
            />
            <TextField
              label="New password"
              icon="lock-closed-outline"
              placeholder="At least 6 characters"
              isPassword
              value={password}
              onChangeText={setPassword}
              testID="forgot-password-input"
            />
          </View>
        )}

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.md }} testID="forgot-error">
            {error}
          </AppText>
        ) : null}

        {phase === "request" ? (
          <Button label="Send reset code" onPress={sendCode} loading={loading} style={{ marginTop: spacing.xl }} testID="forgot-send-btn" />
        ) : (
          <>
            <Button label="Reset password" onPress={doReset} loading={loading} style={{ marginTop: spacing.xl }} testID="forgot-reset-btn" />
            <Pressable onPress={sendCode} style={styles.resend} testID="forgot-resend-btn">
              <AppText size={14} color={c.brand} weight="semibold">
                Didn't get it? Resend code
              </AppText>
            </Pressable>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: "center" },
  resend: { alignItems: "center", marginTop: spacing.lg },
});
