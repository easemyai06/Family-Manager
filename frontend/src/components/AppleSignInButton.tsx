import React, { useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { radius } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";

/**
 * Native "Continue with Apple" button. Renders only on iOS where Sign in with
 * Apple is available (App Store requirement when other social logins exist).
 * `variant` picks the Apple-approved black/white styling for the background.
 */
export function AppleSignInButton({
  variant = "black",
  onError,
}: {
  variant?: "black" | "white";
  onError?: (msg: string) => void;
}) {
  const { loginWithApple } = useAuth();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (Platform.OS !== "ios" || !available) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        variant === "white"
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={radius.md}
      style={styles.btn}
      onPress={async () => {
        try {
          await loginWithApple();
        } catch (e: any) {
          onError?.(e?.message || "Apple sign-in failed");
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  btn: { width: "100%", height: 52 },
});
