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

export default function Login() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e.message || "Login failed");
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
          Welcome back ❤️
        </AppText>
        <AppText size={15} color={c.onSurfaceSecondary} style={{ marginTop: 6, marginBottom: spacing.xl }}>
          Log in to your family's home
        </AppText>

        <View style={{ gap: spacing.lg }}>
          <TextField
            label="Email"
            icon="mail-outline"
            placeholder="you@family.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="login-email-input"
          />
          <TextField
            label="Password"
            icon="lock-closed-outline"
            placeholder="Your password"
            isPassword
            value={password}
            onChangeText={setPassword}
            testID="login-password-input"
          />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.md }} testID="login-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Log In" onPress={submit} loading={loading} style={{ marginTop: spacing.xl }} testID="login-submit-btn" />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={loginWithGoogle}
          style={{ marginTop: spacing.md }}
          testID="login-google-btn"
          icon={<Ionicons name="logo-google" size={18} color={c.onSurface} />}
        />

        <Pressable onPress={() => router.replace("/(auth)/register")} style={styles.switch} testID="go-register-btn">
          <AppText size={14} color={c.onSurfaceSecondary}>
            New here?{" "}
            <AppText size={14} weight="bold" color={c.brand}>
              Create an account
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
