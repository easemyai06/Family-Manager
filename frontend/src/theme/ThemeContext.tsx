import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useColorScheme, AccessibilityInfo } from "react-native";
import { storage } from "@/src/utils/storage";
import { lightColors, darkColors, contrastColors, ThemeColors } from "./tokens";

type Mode = "light" | "dark" | "system";

type ThemeContextValue = {
  c: ThemeColors;
  scheme: "light" | "dark";
  mode: Mode;
  setMode: (m: Mode) => void;
  // Accessibility & display preferences
  textScale: number; // 1 | 1.2 | 1.45
  highContrast: boolean;
  largeButtons: boolean;
  reduceMotion: boolean;
  iconLabels: boolean;
  simpleHome: boolean;
  setTextScale: (n: number) => void;
  setHighContrast: (b: boolean) => void;
  setLargeButtons: (b: boolean) => void;
  setReduceMotion: (b: boolean) => void;
  setIconLabels: (b: boolean) => void;
  setSimpleHome: (b: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const MODE_KEY = "fh_theme_mode";
const KEYS = {
  scale: "fh_a11y_scale",
  contrast: "fh_a11y_contrast",
  largeBtn: "fh_a11y_largebtn",
  reduce: "fh_a11y_reduce", // stored as 0/1; 2 = unset -> follow system
  icons: "fh_a11y_icons",
  simple: "fh_a11y_simple",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");

  const [textScale, setTextScaleState] = useState(1);
  const [highContrast, setHighContrastState] = useState(false);
  const [largeButtons, setLargeButtonsState] = useState(false);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [iconLabels, setIconLabelsState] = useState(true);
  const [simpleHome, setSimpleHomeState] = useState(false);

  useEffect(() => {
    (async () => {
      const [savedMode, scale, contrast, largeBtn, reduce, icons, simple, sysRM] = await Promise.all([
        storage.getItem<string>(MODE_KEY, "system"),
        storage.getItem<number>(KEYS.scale, 1),
        storage.getItem<boolean>(KEYS.contrast, false),
        storage.getItem<boolean>(KEYS.largeBtn, false),
        storage.getItem<number>(KEYS.reduce, 2),
        storage.getItem<boolean>(KEYS.icons, true),
        storage.getItem<boolean>(KEYS.simple, false),
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
      ]);
      if (savedMode === "light" || savedMode === "dark" || savedMode === "system") setModeState(savedMode);
      setTextScaleState(scale || 1);
      setHighContrastState(!!contrast);
      setLargeButtonsState(!!largeBtn);
      setIconLabelsState(icons === null ? true : !!icons);
      setSimpleHomeState(!!simple);
      setReduceMotionState(reduce === 2 || reduce === null ? !!sysRM : reduce === 1);
    })();
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    storage.setItem(MODE_KEY, m);
  };
  const setTextScale = (n: number) => {
    setTextScaleState(n);
    storage.setItem(KEYS.scale, n);
  };
  const setHighContrast = (b: boolean) => {
    setHighContrastState(b);
    storage.setItem(KEYS.contrast, b);
  };
  const setLargeButtons = (b: boolean) => {
    setLargeButtonsState(b);
    storage.setItem(KEYS.largeBtn, b);
  };
  const setReduceMotion = (b: boolean) => {
    setReduceMotionState(b);
    storage.setItem(KEYS.reduce, b ? 1 : 0);
  };
  const setIconLabels = (b: boolean) => {
    setIconLabelsState(b);
    storage.setItem(KEYS.icons, b);
  };
  const setSimpleHome = (b: boolean) => {
    setSimpleHomeState(b);
    storage.setItem(KEYS.simple, b);
  };

  const scheme: "light" | "dark" =
    mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const value = useMemo(() => {
    const base = scheme === "dark" ? darkColors : lightColors;
    const c = highContrast ? contrastColors(base, scheme) : base;
    return {
      c,
      scheme,
      mode,
      setMode,
      textScale,
      highContrast,
      largeButtons,
      reduceMotion,
      iconLabels,
      simpleHome,
      setTextScale,
      setHighContrast,
      setLargeButtons,
      setReduceMotion,
      setIconLabels,
      setSimpleHome,
    };
  }, [scheme, mode, textScale, highContrast, largeButtons, reduceMotion, iconLabels, simpleHome]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
