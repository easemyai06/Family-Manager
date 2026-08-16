// Design tokens for FamilyHome — "Tactile / Playful LIGHT" personality.
// Warm coral + botanical palette. NO blue / purple / indigo anywhere.

export const lightColors = {
  surface: "#FDFBF7",
  onSurface: "#2C2C28",
  surfaceSecondary: "#F4EFE6",
  onSurfaceSecondary: "#4A4A43",
  surfaceTertiary: "#EAE4D9",
  onSurfaceTertiary: "#6B6B63",
  surfaceInverse: "#2C2C28",
  onSurfaceInverse: "#FDFBF7",
  brand: "#FF6B6B",
  brandPrimary: "#FF6B6B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF9E9E",
  onBrandSecondary: "#2C2C28",
  brandTertiary: "#FFD9D9",
  onBrandTertiary: "#FF4D4D",
  success: "#8AB07D",
  onSuccess: "#FFFFFF",
  warning: "#FFD166",
  onWarning: "#2C2C28",
  error: "#E05757",
  onError: "#FFFFFF",
  info: "#A3B18A",
  onInfo: "#FFFFFF",
  border: "#EAE4D9",
  borderStrong: "#D6CEBE",
  divider: "#F4EFE6",
  overlay: "rgba(44,44,40,0.45)",
};

export const darkColors = {
  surface: "#1A1918",
  onSurface: "#F4EFE6",
  surfaceSecondary: "#242321",
  onSurfaceSecondary: "#D6CEBE",
  surfaceTertiary: "#2F2E2B",
  onSurfaceTertiary: "#A39F95",
  surfaceInverse: "#F4EFE6",
  onSurfaceInverse: "#1A1918",
  brand: "#FF6B6B",
  brandPrimary: "#FF8080",
  onBrandPrimary: "#1A1918",
  brandSecondary: "#CC5656",
  onBrandSecondary: "#F4EFE6",
  brandTertiary: "#4A2525",
  onBrandTertiary: "#FF9E9E",
  success: "#75966B",
  onSuccess: "#1A1918",
  warning: "#D6B056",
  onWarning: "#1A1918",
  error: "#CC4E4E",
  onError: "#FFFFFF",
  info: "#8A9675",
  onInfo: "#1A1918",
  border: "#2F2E2B",
  borderStrong: "#4A4A43",
  divider: "#242321",
  overlay: "rgba(0,0,0,0.6)",
};

export type ThemeColors = typeof lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 38,
};

// Font family keys registered in the root layout via expo-font.
export const fonts = {
  displayRegular: "PlusJakarta-Regular",
  displayMedium: "PlusJakarta-Medium",
  displaySemibold: "PlusJakarta-SemiBold",
  displayBold: "PlusJakarta-Bold",
  textRegular: "Nunito-Regular",
  textMedium: "Nunito-Medium",
  textSemibold: "Nunito-SemiBold",
  textBold: "Nunito-Bold",
};

// Member color palette (warm / botanical only).
export const memberPalette = [
  "#FF6B6B", "#D98E5A", "#A3B18A", "#FFD166",
  "#8AB07D", "#C96F4A", "#B5835A", "#6B8E5A",
];

import { Platform } from "react-native";

export function shadow(level: 1 | 2 | 3 = 2) {
  const m = {
    1: { o: 0.06, r: 6, y: 2, e: 2 },
    2: { o: 0.1, r: 14, y: 6, e: 5 },
    3: { o: 0.16, r: 24, y: 10, e: 10 },
  }[level];
  if (Platform.OS === "web") {
    return { boxShadow: `0px ${m.y}px ${m.r}px rgba(58,42,30,${m.o})` } as any;
  }
  return {
    shadowColor: "#3A2A1E",
    shadowOpacity: m.o,
    shadowRadius: m.r,
    shadowOffset: { width: 0, height: m.y },
    elevation: m.e,
  };
}
