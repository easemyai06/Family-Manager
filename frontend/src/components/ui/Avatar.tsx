import React from "react";
import { View, StyleSheet } from "react-native";
import { SmartImage } from "./SmartImage";
import { AppText } from "./AppText";

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
  color?: string; // member ring color
  ring?: boolean;
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

export function Avatar({ uri, name, size = 44, color = "#FF6B6B", ring = false }: Props) {
  const inner = size - (ring ? 6 : 0);
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: ring ? 3 : 0,
          backgroundColor: ring ? color : "transparent",
        },
      ]}
    >
      {uri ? (
        <SmartImage uri={uri} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color },
          ]}
        >
          <AppText family="display" weight="bold" color="#FFFFFF" size={inner * 0.4}>
            {initials(name)}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  fallback: { alignItems: "center", justifyContent: "center" },
});
