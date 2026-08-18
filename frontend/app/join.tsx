import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { useAuth } from "@/src/auth/AuthContext";
import { storage } from "@/src/utils/storage";

// Landing screen for invite deep links (frontend://join?invite=CODE). It stashes
// the invite code and routes the visitor to the right place — the Join screen
// pre-fills the code once they're signed in without a family.
export default function Join() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const { user, initializing } = useAuth();
  const router = useRouter();
  const { c } = useTheme();

  useEffect(() => {
    const code = String(invite || "").trim().toUpperCase();
    if (code) storage.setItem("pendingInviteCode", code);
  }, [invite]);

  useEffect(() => {
    if (initializing) return;
    if (!user) router.replace("/(auth)/welcome");
    else if (!user.family_id) router.replace("/onboarding/create-family");
    else router.replace("/(tabs)");
  }, [initializing, user, router]);

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ActivityIndicator color={c.brand} />
      <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: spacing.md }}>
        Opening your family invite…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
