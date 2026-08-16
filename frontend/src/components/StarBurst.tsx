import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from "react-native-reanimated";

const EMOJIS = ["⭐", "🎉", "✨", "🌟", "🎊", "🏆"];

function Bit({ i, W, H }: { i: number; W: number; H: number }) {
  const p = useSharedValue(0);
  const startX = Math.random() * W;
  const drift = (Math.random() - 0.5) * 130;
  const size = 18 + Math.random() * 18;
  const dur = 1600 + Math.random() * 1100;
  const delay = i * 55 + Math.random() * 250;

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: dur, easing: Easing.linear }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX + drift * p.value },
      { translateY: -60 + p.value * (H + 140) },
      { rotate: `${360 * p.value}deg` },
    ],
    opacity: 1 - p.value * 0.5,
  }));

  return <Animated.Text style={[{ position: "absolute", fontSize: size }, style]}>{EMOJIS[i % EMOJIS.length]}</Animated.Text>;
}

export function StarBurst({ onDone, count = 22 }: { onDone?: () => void; count?: number }) {
  const { width: W, height: H } = useWindowDimensions();

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => (
        <Bit key={i} i={i} W={W} H={H} />
      ))}
    </Animated.View>
  );
}
