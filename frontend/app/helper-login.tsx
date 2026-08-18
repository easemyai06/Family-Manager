import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { helperApi, setHelperToken } from "@/src/lib/helperApi";
import { setMediaToken } from "@/src/lib/api";

export default function HelperLogin() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();

  const [mode, setMode] = useState<"login" | "activate">(codeParam ? "activate" : "login");
  const [code, setCode] = useState((codeParam || "").toString().toUpperCase());
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (codeParam) {
      setMode("activate");
      setCode((codeParam || "").toString().toUpperCase());
    }
  }, [codeParam]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const path = mode === "activate" ? "/helper/activate" : "/helper/login";
      const body =
        mode === "activate"
          ? { code: code.trim().toUpperCase(), username: username.trim().toLowerCase(), pin: pin.trim() }
          : { username: username.trim().toLowerCase(), pin: pin.trim() };
      const res = await helperApi(path, { method: "POST", body, auth: false });
      await setHelperToken(res.token);
      if (res.media_token) setMediaToken(res.media_token);
      router.replace("/helper-portal");
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    }
    setBusy(false);
  };

  const canSubmit =
    pin.trim().length >= 4 && username.trim().length >= 3 && (mode === "login" || code.trim().length >= 4);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <Pressable onPress={() => router.replace("/(auth)/welcome")} hitSlop={12} testID="helper-back" style={{ marginBottom: spacing.lg }}>
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>

        <View style={[styles.badge, { backgroundColor: c.brandTertiary }]}>
          <AppText size={30}>🤝</AppText>
        </View>
        <AppText family="display" weight="bold" size={26} style={{ marginTop: spacing.lg }}>
          Trusted Helper
        </AppText>
        <AppText size={15} color={c.onSurfaceSecondary} style={{ marginTop: spacing.xs, lineHeight: 21 }}>
          {mode === "activate"
            ? "Set up your account with the invite code the family shared with you."
            : "Sign in to see your tasks and schedule for today."}
        </AppText>

        <View style={{ height: spacing.xl }} />

        {mode === "activate" ? (
          <TextField
            label="Invite code"
            icon="key-outline"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="e.g. F5E28989"
            autoCapitalize="characters"
            testID="helper-code"
          />
        ) : null}
        <TextField
          label="Username"
          icon="person-outline"
          value={username}
          onChangeText={setUsername}
          placeholder="your username"
          autoCapitalize="none"
          testID="helper-username"
        />
        <TextField
          label={mode === "activate" ? "Create a PIN (4–6 digits)" : "PIN"}
          icon="lock-closed-outline"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="••••"
          keyboardType="number-pad"
          isPassword
          testID="helper-pin"
        />

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.sm }} testID="helper-error">
            {error}
          </AppText>
        ) : null}

        <Button
          label={mode === "activate" ? "Create account & continue" : "Sign in"}
          onPress={submit}
          loading={busy}
          disabled={busy || !canSubmit}
          testID="helper-submit"
          style={{ marginTop: spacing.xl }}
        />

        <Pressable
          onPress={() => {
            setError("");
            setMode(mode === "activate" ? "login" : "activate");
          }}
          style={{ paddingVertical: spacing.lg, alignItems: "center" }}
          testID="helper-toggle-mode"
        >
          <AppText size={14} color={c.brandPrimary} weight="semibold">
            {mode === "activate" ? "I already have an account" : "I have an invite code"}
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", ...shadow(1) },
});
