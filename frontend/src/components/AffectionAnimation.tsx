import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions, Pressable, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { AppText } from "./ui/AppText";
import { Button } from "./ui/Button";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { spacing } from "@/src/theme/tokens";

const { width: W, height: H } = Dimensions.get("window");

const CONFETTI_TYPES = ["proud", "celebrate", "birthday_love", "congrats"];

function Particle({ emoji, index, isConfetti }: { emoji: string; index: number; isConfetti: boolean }) {
  const progress = useSharedValue(0);
  const startX = Math.random() * W;
  const drift = (Math.random() - 0.5) * 80;
  const sizeVal = isConfetti ? 16 + Math.random() * 12 : 26 + Math.random() * 22;
  const duration = 1800 + Math.random() * 1600;
  const delay = index * 120 + Math.random() * 300;

  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, []);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const y = isConfetti ? -80 + p * (H + 160) : H * 0.75 - p * (H * 0.85);
    return {
      transform: [
        { translateX: startX + drift * p },
        { translateY: y },
        { rotate: `${(isConfetti ? 360 : 40) * p}deg` },
        { scale: 0.7 + Math.sin(p * Math.PI) * 0.5 },
      ],
      opacity: isConfetti ? 1 - p * 0.6 : Math.sin(p * Math.PI),
    };
  });

  return (
    <Animated.Text style={[{ position: "absolute", fontSize: sizeVal, pointerEvents: "none" }, style]}>
      {emoji}
    </Animated.Text>
  );
}

interface Props {
  visible: boolean;
  type: string;
  title: string;
  subtitle?: string | null;
  onDismiss: () => void;
  onSendBack?: () => void;
  sendBackLabel?: string;
}

export function AffectionAnimation({
  visible,
  type,
  title,
  subtitle,
  onDismiss,
  onSendBack,
  sendBackLabel = "Send One Back ❤️",
}: Props) {
  const info = AFFECTION_MAP[type] || { emoji: "❤️", label: "Love", color: "#FF6B6B" };
  const isConfetti = CONFETTI_TYPES.includes(type);
  const scale = useSharedValue(0);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdrop.value = withTiming(1, { duration: 300 });
      scale.value = withSequence(
        withSpring(1.15, { damping: 6, stiffness: 120 }),
        withSpring(1, { damping: 8 })
      );
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 220);
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 480);
      }
    } else {
      scale.value = 0;
      backdrop.value = 0;
    }
  }, [visible]);

  const centerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!visible) return null;

  const particleCount = isConfetti ? 22 : 16;
  const particleEmojis = isConfetti
    ? ["🎉", "⭐", "🎊", "✨", info.emoji]
    : [info.emoji, "❤️", "💕"];

  return (
    <View style={StyleSheet.absoluteFill} testID="affection-animation">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <LinearGradient
          colors={[info.color, "#2C2C28"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      {Array.from({ length: particleCount }).map((_, i) => (
        <Particle
          key={i}
          emoji={particleEmojis[i % particleEmojis.length]}
          index={i}
          isConfetti={isConfetti}
        />
      ))}

      <Pressable style={styles.content} onPress={onDismiss} testID="affection-dismiss">
        <Animated.Text style={[styles.bigEmoji, centerStyle]}>{info.emoji}</Animated.Text>
        <AppText family="display" weight="bold" size={30} color="#FFFFFF" center style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <View style={styles.msgBubble}>
            <AppText size={16} color="#FFFFFF" center>
              {subtitle}
            </AppText>
          </View>
        ) : null}

        <View style={styles.actions}>
          {onSendBack ? (
            <Button label={sendBackLabel} onPress={onSendBack} variant="primary" testID="affection-send-back" />
          ) : null}
          <Pressable onPress={onDismiss} style={styles.tapHint} testID="affection-close">
            <AppText size={14} color="rgba(255,255,255,0.8)" center>
              Tap to close
            </AppText>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  bigEmoji: { fontSize: 110, marginBottom: spacing.lg },
  title: { marginBottom: spacing.md, lineHeight: 36 },
  msgBubble: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  actions: { position: "absolute", bottom: 60, width: "100%", paddingHorizontal: spacing.xl, gap: spacing.md },
  tapHint: { paddingVertical: spacing.sm },
});
