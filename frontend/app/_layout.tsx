import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform, Alert, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { storage } from "@/src/utils/storage";
import { registerForPush } from "@/src/lib/push";

LogBox.ignoreAllLogs(true);

// Keep the native splash visible until icon fonts register (prevents Android
// Expo Go icon-font crash), and custom fonts finish loading.
SplashScreen.preventAutoHideAsync();

// --- Push notifications (module scope, before any component) ---
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function RootNav() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { scheme } = useTheme();

  useEffect(() => {
    if (initializing) return;
    const seg0 = segments[0];
    if (!user) {
      if (seg0 !== "(auth)") router.replace("/(auth)/welcome");
    } else if (!user.family_id) {
      if (seg0 !== "onboarding") router.replace("/onboarding/create-family");
    } else if (seg0 === "(auth)" || seg0 === "onboarding" || seg0 === undefined) {
      router.replace("/(tabs)");
    }
  }, [user, initializing, segments]);

  // Register for push once the user is known (re-runs per user, tokens rotate).
  useEffect(() => {
    if (user?.user_id) registerForPush(user.user_id);
  }, [user?.user_id]);

  // Push tap handling (warm + cold start) + denied-permission weekly nudge.
  useEffect(() => {
    if (Platform.OS === "web") return;

    const route = (data: any) => {
      const url = data?.action_url || data?.deeplink;
      if (!url) return;
      String(url).startsWith("http") ? Linking.openURL(String(url)) : router.push(String(url));
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data || {});
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) route(response.notification.request.content.data || {});
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const last = await storage.getItem<number>("pushNudgeAt", 0);
      const week = 7 * 24 * 60 * 60 * 1000;
      if (last && Date.now() - Number(last) <= week) return;
      Alert.alert(
        "Turn on notifications",
        "Get gentle morning reminders of family memories and alerts for new messages.",
        [
          { text: "Later", onPress: () => storage.setItem("pushNudgeAt", Date.now()) },
          {
            text: "Open Settings",
            onPress: () => {
              storage.setItem("pushNudgeAt", Date.now());
              Linking.openSettings();
            },
          },
        ]
      );
    })();

    return () => tapSub.remove();
  }, [router]);

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="post/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="affection/send" options={{ presentation: "modal" }} />
        <Stack.Screen name="event/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="timeline/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="capsule/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="albums/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="recipes/create" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "PlusJakarta-Regular": require("../assets/fonts/PlusJakartaSans-400.ttf"),
    "PlusJakarta-Medium": require("../assets/fonts/PlusJakartaSans-500.ttf"),
    "PlusJakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-600.ttf"),
    "PlusJakarta-Bold": require("../assets/fonts/PlusJakartaSans-700.ttf"),
    "Nunito-Regular": require("../assets/fonts/Nunito-400.ttf"),
    "Nunito-Medium": require("../assets/fonts/Nunito-500.ttf"),
    "Nunito-SemiBold": require("../assets/fonts/Nunito-600.ttf"),
    "Nunito-Bold": require("../assets/fonts/Nunito-700.ttf"),
  });

  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <AuthProvider>
              <RootNav />
            </AuthProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
