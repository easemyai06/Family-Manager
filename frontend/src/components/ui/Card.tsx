import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing, shadow } from "@/src/theme/tokens";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated = true }: Props) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          padding: padded ? spacing.lg : 0,
          borderWidth: 1,
          borderColor: c.border,
        },
        elevated ? shadow(1) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
