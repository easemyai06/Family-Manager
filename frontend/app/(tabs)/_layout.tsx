import React, { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "@/src/theme/ThemeContext";
import { AppText } from "@/src/components/ui/AppText";
import { spacing } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

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
  const router = useRouter();
  const [chatUnread, setChatUnread] = useState(0);
  const [familyChatId, setFamilyChatId] = useState<string | null>(null);
  const [isChild, setIsChild] = useState(false);

  useEffect(() => {
    api<any>("/families/me")
      .then((r) => setIsChild(r?.viewer_role === "child"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const chats = await api<any[]>("/chats");
        if (!active) return;
        setChatUnread(chats.reduce((s, ch) => s + (ch.unread || 0), 0));
        const fam = chats.find((ch) => ch.type === "family");
        if (fam?.chat_id) setFamilyChatId(fam.chat_id);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 8000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  // Chat is a single family conversation now — tapping the tab opens it directly.
  const openFamilyChat = async () => {
    let id = familyChatId;
    if (!id) {
      try {
        const chats = await api<any[]>("/chats");
        id = chats.find((ch) => ch.type === "family")?.chat_id || null;
        if (id) setFamilyChatId(id);
      } catch {}
    }
    if (id) router.push(`/chat/${id}?name=${encodeURIComponent("Family Chat")}`);
  };

  const visibleTabs = isChild ? TABS.filter((t) => t.name !== "more") : TABS;

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
          .filter((r) => visibleTabs.some((t) => t.name === r.name))
          .map((route) => {
            const tab = visibleTabs.find((t) => t.name === route.name)!;
            const index = state.routes.findIndex((r) => r.key === route.key);
            const focused = state.index === index;
            const onPress = () => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (event.defaultPrevented) return;
              if (route.name === "chat") {
                openFamilyChat();
                return;
              }
              if (!focused) navigation.navigate(route.name);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tab}
                testID={`tab-${tab.name}`}
                accessibilityRole="button"
                accessibilityLabel={tab.label + (tab.name === "chat" && chatUnread > 0 ? `, ${chatUnread} unread` : "")}
                accessibilityState={{ selected: focused }}
              >
                <View>
                  <Ionicons
                    name={focused ? tab.activeIcon : tab.icon}
                    size={24}
                    color={focused ? c.brand : c.onSurfaceTertiary}
                  />
                  {tab.name === "chat" && chatUnread > 0 ? (
                    <View style={[styles.tabBadge, { backgroundColor: c.brand, borderColor: c.surface }]} testID="chat-unread-badge">
                      <AppText size={9} weight="bold" color="#fff">
                        {chatUnread > 9 ? "9+" : chatUnread}
                      </AppText>
                    </View>
                  ) : null}
                </View>
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
  tabBadge: { position: "absolute", top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
});
