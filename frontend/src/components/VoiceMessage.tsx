import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useTheme } from "@/src/theme/ThemeContext";
import { AppText } from "./ui/AppText";
import { mediaUrl } from "@/src/lib/api";
import { spacing } from "@/src/theme/tokens";

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 22 static bars for a lightweight "waveform" look.
const BARS = Array.from({ length: 22 }, (_, i) => 6 + Math.round(Math.abs(Math.sin(i * 1.3)) * 16));

export function VoiceMessage({ uri, duration, mine }: { uri: string; duration?: number; mine: boolean }) {
  const { c } = useTheme();
  const player = useAudioPlayer(mediaUrl(uri) || uri);
  const status = useAudioPlayerStatus(player);

  const fg = mine ? "#fff" : c.onSurface;
  const track = mine ? "rgba(255,255,255,0.35)" : c.surfaceTertiary;
  const totalMs = (status.duration ? status.duration * 1000 : duration) || 0;
  const progress = status.duration ? status.currentTime / status.duration : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} style={[styles.playBtn, { backgroundColor: mine ? "rgba(255,255,255,0.25)" : c.brandTertiary }]} testID="voice-play">
        <Ionicons name={status.playing ? "pause" : "play"} size={18} color={mine ? "#fff" : c.brand} />
      </Pressable>
      <View style={styles.bars}>
        {BARS.map((h, i) => (
          <View
            key={i}
            style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / BARS.length <= progress ? fg : track }}
          />
        ))}
      </View>
      <AppText size={11} color={mine ? "rgba(255,255,255,0.9)" : c.onSurfaceTertiary} style={{ width: 34 }}>
        {fmt(status.playing || status.currentTime ? status.currentTime * 1000 : totalMs)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2, minWidth: 180 },
  playBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  bars: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2, height: 24 },
});
