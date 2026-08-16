import React from "react";
import { Pressable, ActivityIndicator, ViewStyle, StyleProp, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing, shadow } from "@/src/theme/tokens";
import { AppText } from "./AppText";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  size?: "md" | "lg";
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  testID,
  size = "lg",
}: Props) {
  const { c } = useTheme();

  const bg = {
    primary: c.brandPrimary,
    secondary: c.surfaceSecondary,
    ghost: "transparent",
    danger: c.error,
  }[variant];

  const fg = {
    primary: c.onBrandPrimary,
    secondary: c.onSurface,
    ghost: c.brandPrimary,
    danger: c.onError,
  }[variant];

  const handle = () => {
    if (disabled || loading) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: size === "lg" ? 16 : 12,
          paddingHorizontal: spacing.xl,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        variant === "primary" ? shadow(2) : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <AppText family="display" weight="bold" size={16} color={fg}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
