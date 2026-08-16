import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { lightColors, darkColors, ThemeColors } from "./tokens";

type Mode = "light" | "dark" | "system";

type ThemeContextValue = {
  c: ThemeColors;
  scheme: "light" | "dark";
  mode: Mode;
  setMode: (m: Mode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const MODE_KEY = "fh_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");

  useEffect(() => {
    storage.getItem<string>(MODE_KEY, "system").then((m) => {
      if (m === "light" || m === "dark" || m === "system") setModeState(m);
    });
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    storage.setItem(MODE_KEY, m);
  };

  const scheme: "light" | "dark" =
    mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const value = useMemo(
    () => ({ c: scheme === "dark" ? darkColors : lightColors, scheme, mode, setMode }),
    [scheme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
