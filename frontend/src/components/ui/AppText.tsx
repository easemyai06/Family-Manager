import React from "react";
import { Text, TextProps, TextStyle } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts } from "@/src/theme/tokens";

type Weight = "regular" | "medium" | "semibold" | "bold";
type Family = "display" | "text";

interface Props extends TextProps {
  size?: number;
  weight?: Weight;
  family?: Family;
  color?: string;
  center?: boolean;
}

const fontFor = (family: Family, weight: Weight) => {
  if (family === "display") {
    return {
      regular: fonts.displayRegular,
      medium: fonts.displayMedium,
      semibold: fonts.displaySemibold,
      bold: fonts.displayBold,
    }[weight];
  }
  return {
    regular: fonts.textRegular,
    medium: fonts.textMedium,
    semibold: fonts.textSemibold,
    bold: fonts.textBold,
  }[weight];
};

export function AppText({
  size = 14,
  weight = "regular",
  family = "text",
  color,
  center,
  style,
  children,
  ...rest
}: Props) {
  const { c } = useTheme();
  const base: TextStyle = {
    fontFamily: fontFor(family, weight),
    fontSize: size,
    color: color || c.onSurface,
    textAlign: center ? "center" : undefined,
  };
  return (
    <Text style={[base, style]} {...rest}>
      {children}
    </Text>
  );
}
