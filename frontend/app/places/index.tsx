import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Places() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [places, setPlaces] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setPlaces(await api("/timeline/places"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cardW = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="places-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>
            Places We've Been 🗺️
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            {places.length} {places.length === 1 ? "place" : "places"} in your family story
          </AppText>
        </View>
      </View>

      <FlatList
        data={places}
        keyExtractor={(p) => p.location}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText size={40}>🗺️</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No places yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Add a location when you create memories
            </AppText>
          </View>
        }
        renderItem={({ item: p }) => (
          <Pressable
            onPress={() => router.push(`/timeline?location=${encodeURIComponent(p.location)}&name=${encodeURIComponent(p.location)}`)}
            style={[styles.card, { width: cardW, backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`place-${p.location}`}
          >
            {p.cover ? (
              <SmartImage uri={p.cover} style={{ width: "100%", height: cardW * 0.8, backgroundColor: "#EAE4D9" }} />
            ) : (
              <LinearGradient colors={["#8AB07D", "#5E8C50"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: cardW * 0.8, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="location" size={34} color="#fff" />
              </LinearGradient>
            )}
            <View style={{ padding: spacing.md }}>
              <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                {p.location}
              </AppText>
              <AppText size={12} color={c.onSurfaceTertiary}>
                {p.count} {p.count === 1 ? "memory" : "memories"}
              </AppText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
