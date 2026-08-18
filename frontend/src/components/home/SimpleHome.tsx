import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { AffectionAnimation } from "@/src/components/AffectionAnimation";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { greeting } from "@/src/lib/time";

type Props = {
  home: any;
  incoming: any;
  onDismissAffection: () => void;
  onSendBack: () => void;
};

const TILES: { emoji: string; label: string; route: string; bg: string }[] = [
  { emoji: "📅", label: "Family Calendar", route: "/(tabs)/calendar", bg: "#EAF1F6" },
  { emoji: "💬", label: "Messages", route: "/(tabs)/chat", bg: "#E9F3EC" },
  { emoji: "❤️", label: "Send Love", route: "/affection/send", bg: "#FBE9E9" },
  { emoji: "📸", label: "Memories", route: "/timeline", bg: "#F4ECDD" },
  { emoji: "🎂", label: "Birthdays", route: "/(tabs)/calendar", bg: "#F1EAF6" },
  { emoji: "🚨", label: "Emergency", route: "/emergency", bg: "#FBE4E1" },
];

export function SimpleHome({ home, incoming, onDismissAffection, onSendBack }: Props) {
  const { c, highContrast } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = home?.me;
  const nextEvent = (home?.events_today || [])[0];

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <AppText family="display" weight="bold" size={28} accessibilityRole="header">
          {greeting()}, {me?.name || "there"} 👋
        </AppText>
        <AppText size={17} color={c.onSurfaceSecondary} style={{ marginTop: 4 }}>
          {nextEvent ? `Next: ${nextEvent.title}${nextEvent.start_time ? ` at ${nextEvent.start_time}` : ""}` : "Nothing scheduled today."}
        </AppText>

        <View style={styles.grid}>
          {TILES.map((t) => (
            <Pressable
              key={t.label}
              onPress={() => router.push(t.route as any)}
              style={[
                styles.tile,
                { backgroundColor: highContrast ? c.surface : t.bg, borderColor: c.border },
                shadow(1),
              ]}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              testID={`simple-tile-${t.label.split(" ")[0].toLowerCase()}`}
            >
              <AppText size={46}>{t.emoji}</AppText>
              <AppText family="display" weight="bold" size={20} center style={{ marginTop: spacing.sm }}>
                {t.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {incoming ? (
        <AffectionAnimation
          visible={!!incoming}
          type={incoming.type}
          title={`${incoming.from?.name} sent you ${AFFECTION_MAP[incoming.type]?.label || "love"} ${AFFECTION_MAP[incoming.type]?.emoji || "❤️"}`}
          subtitle={incoming.message}
          onDismiss={onDismissAffection}
          onSendBack={onSendBack}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xl },
  tile: {
    width: "47.5%",
    minHeight: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
});
