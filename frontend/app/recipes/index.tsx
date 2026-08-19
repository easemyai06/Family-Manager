import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Recipes() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recipes, setRecipes] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setRecipes(await api("/recipes"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="recipes-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Recipes
        </AppText>
        <Pressable onPress={() => router.push("/recipes/create")} hitSlop={12} testID="add-recipe-btn">
          <Ionicons name="add" size={28} color={c.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        {recipes.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={44}>🍳</AppText>
            <AppText family="display" weight="bold" size={17} center style={{ marginTop: spacing.md }}>
              No recipes yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Save your family’s favourite dishes and plan the week
            </AppText>
            <Pressable onPress={() => router.push("/recipes/create")} style={[styles.emptyBtn, { backgroundColor: c.brand }]} testID="empty-add-recipe">
              <AppText size={14} weight="bold" color="#fff">
                Add a recipe
              </AppText>
            </Pressable>
          </View>
        ) : (
          recipes.map((r) => (
            <Pressable
              key={r.recipe_id}
              onPress={() => router.push(`/recipes/${r.recipe_id}`)}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              testID={`recipe-${r.recipe_id}`}
            >
              {r.photo_url ? (
                <SmartImage uri={r.photo_url} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                  <AppText size={28}>🍽️</AppText>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <AppText family="display" weight="bold" size={16} numberOfLines={1}>
                  {r.title}
                </AppText>
                {r.description ? (
                  <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1} style={{ marginTop: 2 }}>
                    {r.description}
                  </AppText>
                ) : null}
                <View style={styles.metaRow}>
                  <View style={[styles.metaChip, { backgroundColor: c.surfaceTertiary }]}>
                    <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
                      🧺 {(r.ingredients || []).length} items
                    </AppText>
                  </View>
                  {r.prep_minutes ? (
                    <View style={[styles.metaChip, { backgroundColor: c.surfaceTertiary }]}>
                      <AppText size={11} weight="semibold" color={c.onSurfaceSecondary}>
                        ⏱️ {r.prep_minutes} min
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push("/meals")}
        style={[styles.plannerBtn, { backgroundColor: c.brand, bottom: insets.bottom + 20 }, shadow(3)]}
        testID="open-meal-planner"
      >
        <Ionicons name="calendar" size={18} color="#fff" />
        <AppText size={14} weight="bold" color="#fff">
          Meal Planner
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  thumb: { width: 60, height: 60, borderRadius: radius.md },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  metaChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  emptyBtn: { marginTop: spacing.lg, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  plannerBtn: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
