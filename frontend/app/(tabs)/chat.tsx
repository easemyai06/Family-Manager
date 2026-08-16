import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";

export default function Chat() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText family="display" weight="bold" size={26}>
          Family Chat
        </AppText>
      </View>
      <View style={styles.content}>
        <LinearGradient colors={[c.brandTertiary, c.surface]} style={styles.iconWrap}>
          <AppText size={48}>💬</AppText>
        </LinearGradient>
        <AppText family="display" weight="bold" size={20} center style={{ marginTop: spacing.xl }}>
          Private family chat is coming soon
        </AppText>
        <AppText size={15} color={c.onSurfaceSecondary} center style={{ marginTop: spacing.sm, lineHeight: 22, paddingHorizontal: spacing.lg }}>
          Soon you'll be able to message the whole family, one-on-one, or in custom groups — all completely private.
        </AppText>
        <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.xl }}>
          In the meantime…
        </AppText>
        <Button label="Send Some Love ❤️" onPress={() => router.push("/affection/send")} style={{ marginTop: spacing.md }} testID="chat-send-love" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  iconWrap: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
});
