import React from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/src/theme/ThemeContext";
import { AppText } from "@/src/components/ui/AppText";
import { spacing } from "@/src/theme/tokens";

const TABS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { name: "index", label: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "calendar", label: "Calendar", icon: "calendar-outline", activeIcon: "calendar" },
  { name: "family", label: "Family", icon: "heart-outline", activeIcon: "heart" },
  { name: "chat", label: "Chat", icon: "chatbubble-outline", activeIcon: "chatbubble" },
  { name: "more", label: "More", icon: "grid-outline", activeIcon: "grid" },
];

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || spacing.sm }]}>
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 0}
        tint={scheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: Platform.OS === "ios" ? (scheme === "dark" ? "rgba(26,25,24,0.7)" : "rgba(253,251,247,0.8)") : c.surface,
            borderTopWidth: 1,
            borderTopColor: c.border,
          },
        ]}
      />
      <View style={styles.row}>
        {state.routes
          .filter((r) => TABS.some((t) => t.name === r.name))
          .map((route) => {
            const tab = TABS.find((t) => t.name === route.name)!;
            const index = state.routes.findIndex((r) => r.key === route.key);
            const focused = state.index === index;
            const onPress = () => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            return (
              <Pressable key={route.key} onPress={onPress} style={styles.tab} testID={`tab-${tab.name}`}>
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={24}
                  color={focused ? c.brand : c.onSurfaceTertiary}
                />
                <AppText
                  size={11}
                  weight={focused ? "bold" : "medium"}
                  color={focused ? c.brand : c.onSurfaceTertiary}
                  style={{ marginTop: 3 }}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="family" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  row: { flexDirection: "row", height: 60, alignItems: "center" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6 },
});
