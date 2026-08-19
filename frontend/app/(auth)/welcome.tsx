import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { spacing } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";

const HERO = "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&q=80";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginWithGoogle } = useAuth();

  return (
    <View style={styles.container}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(44,44,40,0.15)", "rgba(44,44,40,0.55)", "#2C2C28"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl, paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.top}>
          <View style={styles.logoRow}>
            <AppText family="display" weight="bold" size={26} color="#FFFFFF">
              FamilyHome
            </AppText>
            <AppText size={26}>❤️</AppText>
          </View>
        </View>

        <View style={styles.bottom}>
          <AppText family="display" weight="bold" size={34} color="#FFFFFF" style={{ lineHeight: 42 }}>
            Your family.{"\n"}Your memories.{"\n"}Your little world.
          </AppText>
          <AppText size={16} color="rgba(255,255,255,0.85)" style={{ marginTop: spacing.md, lineHeight: 24 }}>
            One private place for everything your family needs today — and everything you’ll want to remember tomorrow.
          </AppText>

          <View style={styles.actions}>
            <Button label="Get Started" onPress={() => router.push("/(auth)/register")} testID="get-started-btn" />
            <AppleSignInButton variant="white" />
            <Button
              label="Continue with Google"
              variant="secondary"
              onPress={loginWithGoogle}
              testID="google-signin-btn"
              icon={<Ionicons name="logo-google" size={18} color="#2C2C28" />}
            />
            <Button
              label="I already have an account"
              variant="ghost"
              onPress={() => router.push("/(auth)/login")}
              testID="login-link-btn"
              style={{ backgroundColor: "transparent" }}
            />
            <Pressable onPress={() => router.push("/helper-login")} testID="helper-portal-link" style={styles.helperBtn} hitSlop={8}>
              <Ionicons name="briefcase-outline" size={17} color="#FFFFFF" />
              <AppText size={15} weight="bold" color="#FFFFFF">
                I’m a trusted helper
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#2C2C28" },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.xl },
  top: { alignItems: "center", marginTop: spacing.xl },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bottom: {},
  actions: { marginTop: spacing["2xl"], gap: spacing.md },
  helperBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, borderRadius: 999, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)", marginTop: spacing.xs },
});
