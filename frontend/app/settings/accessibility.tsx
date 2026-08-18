import React from "react";
import { View, StyleSheet, Pressable, ScrollView, Switch, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";

const SCALES: { key: number; label: string }[] = [
  { key: 1, label: "Default" },
  { key: 1.2, label: "Large" },
  { key: 1.45, label: "Extra Large" },
];

export default function AccessibilitySettings() {
  const {
    c,
    textScale,
    highContrast,
    largeButtons,
    reduceMotion,
    iconLabels,
    setTextScale,
    setHighContrast,
    setLargeButtons,
    setReduceMotion,
    setIconLabels,
  } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const ToggleRow = ({
    icon,
    color,
    title,
    desc,
    value,
    onValueChange,
    testID,
    first,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    desc: string;
    value: boolean;
    onValueChange: (b: boolean) => void;
    testID: string;
    first?: boolean;
  }) => (
    <View style={[styles.row, { borderTopColor: c.divider, borderTopWidth: first ? 0 : 1 }]}>
      <View style={[styles.rowIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText size={16} weight="semibold">
          {title}
        </AppText>
        <AppText size={13} color={c.onSurfaceSecondary} style={{ marginTop: 2, lineHeight: 18 }}>
          {desc}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.borderStrong, true: c.brand }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={c.borderStrong}
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: value }}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="a11y-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Accessibility & Display
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Text size */}
        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.sectionLabel}>
          TEXT SIZE
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={styles.segment}>
            {SCALES.map((s) => {
              const sel = Math.abs(textScale - s.key) < 0.001;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setTextScale(s.key)}
                  style={[styles.segItem, { backgroundColor: sel ? c.brand : c.surfaceSecondary }]}
                  testID={`text-size-${s.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Text size ${s.label}`}
                  accessibilityState={{ selected: sel }}
                >
                  <AppText size={14} weight="bold" color={sel ? "#FFFFFF" : c.onSurfaceSecondary}>
                    {s.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.preview, { borderTopColor: c.divider }]}>
            <AppText size={18} weight="semibold">
              Family dinner is at 7:00 PM tonight.
            </AppText>
            <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: 4 }}>
              This is how your text will look.
            </AppText>
          </View>
        </View>

        {/* Display toggles */}
        <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.sectionLabel}>
          DISPLAY
        </AppText>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, paddingVertical: 0 }, shadow(1)]}>
          <ToggleRow
            icon="contrast"
            color="#4A4A43"
            title="High Contrast"
            desc="Stronger text and borders that are easier to read."
            value={highContrast}
            onValueChange={setHighContrast}
            testID="toggle-contrast"
            first
          />
          <ToggleRow
            icon="resize"
            color="#8AB07D"
            title="Larger Buttons"
            desc="Bigger, easier-to-tap buttons across the app."
            value={largeButtons}
            onValueChange={setLargeButtons}
            testID="toggle-large-buttons"
          />
          <ToggleRow
            icon="pulse"
            color="#E86A8C"
            title="Reduce Motion"
            desc="Calmer screens with fewer animations."
            value={reduceMotion}
            onValueChange={setReduceMotion}
            testID="toggle-reduce-motion"
          />
          <ToggleRow
            icon="text"
            color="#7FA9C9"
            title="Show Text With Icons"
            desc="Always show labels next to icons."
            value={iconLabels}
            onValueChange={setIconLabels}
            testID="toggle-icon-labels"
          />
        </View>

        <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.xl, lineHeight: 19 }}>
          FamilyHome also follows your phone's own text size and motion settings{Platform.OS === "web" ? "" : " automatically"}.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sectionLabel: { letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  segment: { flexDirection: "row", gap: spacing.sm },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radius.md },
  preview: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: 1 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
