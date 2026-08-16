import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { storage } from "@/src/utils/storage";

const PIN_KEY = "vault_pin";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function VaultGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"loading" | "enter" | "setup" | "confirm">("loading");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.secureGet<string>(PIN_KEY, "");
      const hw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      setBioAvailable(!!hw && !!enrolled);
      setMode(saved ? "enter" : "setup");
    })();
  }, []);

  const tryBiometric = useCallback(async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Family Vault", disableDeviceFallback: false });
      if (res.success) onUnlocked();
    } catch {}
  }, [onUnlocked]);

  useEffect(() => {
    if (mode === "enter" && bioAvailable) tryBiometric();
  }, [mode, bioAvailable, tryBiometric]);

  const submit = useCallback(
    async (value: string) => {
      if (mode === "setup") {
        setFirstPin(value);
        setPin("");
        setMode("confirm");
        return;
      }
      if (mode === "confirm") {
        if (value === firstPin) {
          await storage.secureSet(PIN_KEY, value);
          onUnlocked();
        } else {
          setError("PINs didn't match — try again");
          setPin("");
          setFirstPin("");
          setMode("setup");
        }
        return;
      }
      // enter
      const saved = await storage.secureGet<string>(PIN_KEY, "");
      if (value === saved) {
        onUnlocked();
      } else {
        setError("Wrong PIN");
        setPin("");
      }
    },
    [mode, firstPin, onUnlocked]
  );

  const press = (k: string) => {
    setError("");
    if (k === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!k) return;
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) setTimeout(() => submit(next), 120);
      return next;
    });
  };

  const title = mode === "setup" ? "Create a Vault PIN" : mode === "confirm" ? "Confirm your PIN" : "Enter Vault PIN";
  const subtitle =
    mode === "setup"
      ? "This 4-digit PIN protects your family's private documents"
      : mode === "confirm"
      ? "Re-enter the same 4 digits"
      : "Your documents are private & locked";

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top + spacing.xl }]}>
      <View style={[styles.lockCircle, { backgroundColor: c.brandTertiary }]}>
        <Ionicons name="lock-closed" size={40} color={c.brand} />
      </View>
      <AppText family="display" weight="bold" size={22} center style={{ marginTop: spacing.lg }}>
        {title}
      </AppText>
      <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: 6, paddingHorizontal: spacing.xl }}>
        {subtitle}
      </AppText>

      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, { borderColor: c.brand, backgroundColor: i < pin.length ? c.brand : "transparent" }]} />
        ))}
      </View>
      {error ? (
        <AppText size={13} color={c.error} center testID="vault-pin-error">
          {error}
        </AppText>
      ) : (
        <View style={{ height: 18 }} />
      )}

      <View style={styles.keypad}>
        {KEYS.map((k, i) => (
          <Pressable
            key={i}
            onPress={() => press(k)}
            disabled={!k}
            style={[styles.key, k ? { backgroundColor: c.surfaceSecondary } : { backgroundColor: "transparent" }]}
            testID={k ? `vault-key-${k}` : undefined}
          >
            {k === "del" ? (
              <Ionicons name="backspace-outline" size={24} color={c.onSurface} />
            ) : (
              <AppText family="display" weight="bold" size={24}>
                {k}
              </AppText>
            )}
          </Pressable>
        ))}
      </View>

      {mode === "enter" && bioAvailable ? (
        <Pressable onPress={tryBiometric} style={styles.bioBtn} testID="vault-biometric-btn">
          <Ionicons name="finger-print" size={22} color={c.brand} />
          <AppText size={14} weight="semibold" color={c.brand}>
            Unlock with biometrics
          </AppText>
        </Pressable>
      ) : (
        <View style={{ height: 44 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", paddingHorizontal: spacing.lg },
  lockCircle: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.lg },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 300, justifyContent: "space-between", rowGap: spacing.md },
  key: { width: 88, height: 72, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  bioBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xl, paddingVertical: spacing.md },
});
