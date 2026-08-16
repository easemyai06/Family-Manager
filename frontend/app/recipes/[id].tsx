import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function RecipeDetail() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [recipe, setRecipe] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setRecipe(await api(`/recipes/${id}`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canDelete = recipe && (me?.member_id === recipe.created_by || me?.role === "admin");

  const remove = () => {
    Alert.alert("Delete recipe?", "This recipe will be removed from your family and any meal plans.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/recipes/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  if (!recipe) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const ingredients = recipe.ingredients || [];

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          {recipe.photo_url ? (
            <SmartImage uri={recipe.photo_url} style={styles.heroImg} />
          ) : (
            <LinearGradient colors={["#F0B27A", "#D98E5A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroImg}>
              <AppText size={64}>🍽️</AppText>
            </LinearGradient>
          )}
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + spacing.sm }]} testID="recipe-detail-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          {canDelete ? (
            <Pressable onPress={remove} hitSlop={12} style={[styles.delBtn, { top: insets.top + spacing.sm }]} testID="recipe-delete">
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.body}>
          <AppText family="display" weight="bold" size={24}>
            {recipe.title}
          </AppText>
          <View style={styles.metaRow}>
            {recipe.prep_minutes ? (
              <View style={[styles.metaChip, { backgroundColor: c.surface, borderColor: c.border }]}>
                <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>
                  ⏱️ {recipe.prep_minutes} min
                </AppText>
              </View>
            ) : null}
            <View style={[styles.metaChip, { backgroundColor: c.surface, borderColor: c.border }]}>
              <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>
                🧺 {ingredients.length} ingredients
              </AppText>
            </View>
          </View>

          {recipe.description ? (
            <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, lineHeight: 21 }}>
              {recipe.description}
            </AppText>
          ) : null}

          {recipe.author ? (
            <View style={styles.authorRow}>
              <Avatar uri={recipe.author.photo_url} name={recipe.author.name} size={28} color={recipe.author.color} />
              <AppText size={13} color={c.onSurfaceTertiary}>
                Added by {recipe.author.name}
              </AppText>
            </View>
          ) : null}

          <AppText family="display" weight="bold" size={17} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
            Ingredients
          </AppText>
          <View style={[styles.ingCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            {ingredients.length === 0 ? (
              <AppText size={13} color={c.onSurfaceTertiary} style={{ padding: spacing.md }}>
                No ingredients listed.
              </AppText>
            ) : (
              ingredients.map((ing: any, i: number) => (
                <View key={i} style={[styles.ingRow, i < ingredients.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                  <View style={[styles.dot, { backgroundColor: c.brand }]} />
                  <AppText size={15} style={{ flex: 1 }}>
                    {ing.name}
                  </AppText>
                  {ing.quantity ? (
                    <AppText size={13} weight="semibold" color={c.onSurfaceTertiary}>
                      {ing.quantity}
                    </AppText>
                  ) : null}
                </View>
              ))
            )}
          </View>

          <Pressable onPress={() => router.push("/meals")} style={[styles.planBtn, { backgroundColor: c.brand }]} testID="recipe-plan-btn">
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <AppText size={14} weight="bold" color="#fff">
              Add to weekly plan
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { position: "relative" },
  heroImg: { width: "100%", height: 240, alignItems: "center", justifyContent: "center" },
  back: { position: "absolute", left: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  delBtn: { position: "absolute", right: spacing.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, marginTop: -spacing.xl, backgroundColor: "transparent" },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  metaChip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  ingCard: { borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  ingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4 },
  planBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: spacing.md, marginTop: spacing.xl },
});
