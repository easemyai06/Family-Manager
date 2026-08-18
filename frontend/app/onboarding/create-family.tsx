import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

type Mode = "menu" | "create" | "join";

export default function CreateFamily() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refresh, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("menu");
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  // If the user arrived via an invite deep link, jump straight to Join with the
  // code pre-filled.
  useEffect(() => {
    (async () => {
      const code = await storage.getItem<string>("pendingInviteCode", "");
      if (code) {
        setCode(code);
        setMode("join");
        await storage.removeItem("pendingInviteCode");
      }
    })();
  }, []);

  const run = async (key: string, fn: () => Promise<any>) => {
    setError("");
    setLoading(key);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  const seedDemo = () => run("demo", () => api("/seed/demo", { method: "POST" }));
  const createFamily = () => {
    if (!familyName.trim()) {
      setError("Please enter a family name");
      return;
    }
    run("create", () => api("/families", { method: "POST", body: { name: familyName.trim() } }));
  };
  const joinFamily = () => {
    if (!code.trim()) {
      setError("Please enter an invite code");
      return;
    }
    run("join", () => api("/families/join", { method: "POST", body: { code: code.trim() } }));
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heart, { backgroundColor: c.brandTertiary }]}>
            <AppText size={30}>🏡</AppText>
          </View>
          <AppText family="display" weight="bold" size={28} center style={{ marginTop: spacing.md }}>
            Welcome, {user?.name?.split(" ")[0]} ❤️
          </AppText>
          <AppText size={15} color={c.onSurfaceSecondary} center style={{ marginTop: 6 }}>
            Let's set up your family's private home
          </AppText>
        </View>

        {mode === "menu" && (
          <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
            <Pressable onPress={seedDemo} testID="try-demo-btn">
              <LinearGradient
                colors={[c.brandPrimary, "#FF9E9E"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bigCard, shadow(2)]}
              >
                <AppText size={30}>✨</AppText>
                <AppText family="display" weight="bold" size={19} color="#fff" style={{ marginTop: 8 }}>
                  Explore the Sharma Family
                </AppText>
                <AppText size={14} color="rgba(255,255,255,0.9)" style={{ marginTop: 4, lineHeight: 20 }}>
                  Jump right in with a fully-loaded demo family — posts, calendar, chores & memories.
                </AppText>
                {loading === "demo" ? (
                  <AppText size={13} color="#fff" style={{ marginTop: 8 }}>
                    Setting up your demo home…
                  </AppText>
                ) : null}
              </LinearGradient>
            </Pressable>

            <Card>
              <Pressable onPress={() => setMode("create")} style={styles.optionRow} testID="create-family-option">
                <View style={[styles.optionIcon, { backgroundColor: c.brandTertiary }]}>
                  <Ionicons name="home" size={22} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16}>
                    Create your family
                  </AppText>
                  <AppText size={13} color={c.onSurfaceSecondary}>
                    Start fresh and invite your loved ones
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.onSurfaceTertiary} />
              </Pressable>
            </Card>

            <Card>
              <Pressable onPress={() => setMode("join")} style={styles.optionRow} testID="join-family-option">
                <View style={[styles.optionIcon, { backgroundColor: c.surfaceTertiary }]}>
                  <Ionicons name="people" size={22} color={c.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText family="display" weight="bold" size={16}>
                    Join a family
                  </AppText>
                  <AppText size={13} color={c.onSurfaceSecondary}>
                    Got an invite code? Join here
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.onSurfaceTertiary} />
              </Pressable>
            </Card>
          </View>
        )}

        {mode === "create" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <TextField
              label="Family Name"
              icon="home-outline"
              placeholder="e.g. The Sharma Family"
              value={familyName}
              onChangeText={setFamilyName}
              testID="family-name-input"
            />
            <Button label="Create Family ❤️" onPress={createFamily} loading={loading === "create"} testID="create-family-submit" />
            <Button label="Back" variant="ghost" onPress={() => setMode("menu")} />
          </View>
        )}

        {mode === "join" && (
          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <TextField
              label="Invite Code"
              icon="key-outline"
              placeholder="e.g. A1B2C3D4"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              testID="invite-code-input"
            />
            <Button label="Join Family" onPress={joinFamily} loading={loading === "join"} testID="join-family-submit" />
            <Button label="Back" variant="ghost" onPress={() => setMode("menu")} />
          </View>
        )}

        {error ? (
          <AppText size={13} color={c.error} center style={{ marginTop: spacing.lg }} testID="onboarding-error">
            {error}
          </AppText>
        ) : null}

        <Pressable onPress={logout} style={{ alignItems: "center", marginTop: spacing["2xl"] }} testID="onboarding-logout">
          <AppText size={13} color={c.onSurfaceTertiary}>
            Log out
          </AppText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl },
  hero: { alignItems: "center", marginTop: spacing.lg },
  heart: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  bigCard: { borderRadius: radius.lg, padding: spacing.xl },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  optionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
