import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";

export type Section = { h: string; p: string };

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  footer,
}: {
  title: string;
  updated?: string;
  intro?: string;
  sections: Section[];
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="legal-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19} numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {updated ? (
          <AppText size={12} color={c.onSurfaceTertiary} style={{ marginBottom: spacing.md }}>
            Last updated: {updated}
          </AppText>
        ) : null}

        {intro ? (
          <AppText size={14} color={c.onSurfaceSecondary} style={{ lineHeight: 21, marginBottom: spacing.lg }}>
            {intro}
          </AppText>
        ) : null}

        {sections.map((s, i) => (
          <View key={i} style={{ marginBottom: spacing.lg }}>
            <AppText family="display" weight="bold" size={16} style={{ marginBottom: 6 }}>
              {s.h}
            </AppText>
            <AppText size={14} color={c.onSurfaceSecondary} style={{ lineHeight: 21 }}>
              {s.p}
            </AppText>
          </View>
        ))}

        {footer}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
