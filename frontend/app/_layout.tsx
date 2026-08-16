import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";

LogBox.ignoreAllLogs(true);

// Keep the native splash visible until icon fonts register (prevents Android
// Expo Go icon-font crash), and custom fonts finish loading.
SplashScreen.preventAutoHideAsync();

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

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="post/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="affection/send" options={{ presentation: "modal" }} />
        <Stack.Screen name="event/create" options={{ presentation: "modal" }} />
        <Stack.Screen name="timeline/create" options={{ presentation: "modal" }} />
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
