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

export default function Register() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register, loginWithGoogle } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e.message || "Sign up failed");
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>

        <AppText family="display" weight="bold" size={30} style={{ marginTop: spacing.lg }}>
          Create your account
        </AppText>
        <AppText size={15} color={c.onSurfaceSecondary} style={{ marginTop: 6, marginBottom: spacing.xl }}>
          Start building your family's private digital home ❤️
        </AppText>

        <View style={{ gap: spacing.lg }}>
          <TextField
            label="Your Name"
            icon="person-outline"
            placeholder="e.g. Raj Sharma"
            value={name}
            onChangeText={setName}
            testID="register-name-input"
          />
          <TextField
            label="Email"
            icon="mail-outline"
            placeholder="you@family.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="register-email-input"
          />
          <TextField
            label="Password"
            icon="lock-closed-outline"
            placeholder="At least 6 characters"
            isPassword
            value={password}
            onChangeText={setPassword}
            testID="register-password-input"
          />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.md }} testID="register-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Create Account" onPress={submit} loading={loading} style={{ marginTop: spacing.xl }} testID="register-submit-btn" />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={loginWithGoogle}
          style={{ marginTop: spacing.md }}
          testID="register-google-btn"
          icon={<Ionicons name="logo-google" size={18} color={c.onSurface} />}
        />

        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.switch} testID="go-login-btn">
          <AppText size={14} color={c.onSurfaceSecondary}>
            Already have an account?{" "}
            <AppText size={14} weight="bold" color={c.brand}>
              Log in
            </AppText>
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl },
  back: { width: 40, height: 40, justifyContent: "center" },
  switch: { alignItems: "center", marginTop: spacing.xl },
});
