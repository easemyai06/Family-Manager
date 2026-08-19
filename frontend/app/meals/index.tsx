import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = [
  { key: "breakfast", label: "Breakfast", emoji: "🌅" },
  { key: "lunch", label: "Lunch", emoji: "🌞" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
] as const;

function mondayOf(offset: number) {
  const base = dayjs().add(offset * 7, "day");
  return base.subtract((base.day() + 6) % 7, "day");
}

export default function MealPlanner() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState(0);
  const [meals, setMeals] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [picker, setPicker] = useState<{ day: number; slot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const monday = useMemo(() => mondayOf(offset), [offset]);
  const weekStart = monday.format("YYYY-MM-DD");

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([api(`/meals?week_start=${weekStart}`), api("/recipes")]);
      setMeals(m.meals || []);
      setRecipes(r || []);
    } catch {}
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const lookup = useMemo(() => {
    const map: Record<string, any> = {};
    meals.forEach((e) => (map[`${e.day}-${e.slot}`] = e));
    return map;
  }, [meals]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const assign = async (recipeId: string) => {
    if (!picker) return;
    const { day, slot } = picker;
    setPicker(null);
    try {
      const entry = await api("/meals", { method: "POST", body: { week_start: weekStart, day, slot, recipe_id: recipeId } });
      setMeals((prev) => [...prev.filter((e) => !(e.day === day && e.slot === slot)), entry]);
    } catch {}
  };

  const clearSlot = async (entry: any) => {
    setMeals((prev) => prev.filter((e) => e.plan_id !== entry.plan_id));
    try {
      await api(`/meals/${entry.plan_id}`, { method: "DELETE" });
    } catch {}
  };

  const toShopping = async () => {
    setBusy(true);
    try {
      const res = await api("/meals/to-shopping", { method: "POST", body: { week_start: weekStart } });
      if (res.added > 0) flash(`Added ${res.added} item${res.added === 1 ? "" : "s"} to your ${res.list_name} list 🛒`);
      else flash(`All ${res.total_ingredients} ingredients are already on your list ✅`);
      setTimeout(() => router.push(`/shopping/${res.list_id}?name=${encodeURIComponent(res.list_name)}`), 700);
    } catch (e: any) {
      flash(e.message || "Nothing to add yet");
    } finally {
      setBusy(false);
    }
  };

  const plannedCount = meals.length;
  const weekLabel = offset === 0 ? "This week" : `${monday.format("D MMM")} – ${monday.add(6, "day").format("D MMM")}`;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="meals-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Meal Planner
        </AppText>
        <Pressable onPress={() => router.push("/recipes")} hitSlop={12} testID="meals-recipes-btn">
          <Ionicons name="book-outline" size={24} color={c.brand} />
        </Pressable>
      </View>

      {/* week switcher */}
      <View style={styles.weekBar}>
        <Pressable onPress={() => setOffset((o) => o - 1)} hitSlop={10} style={[styles.weekArrow, { backgroundColor: c.surface, borderColor: c.border }]} testID="week-prev">
          <Ionicons name="chevron-back" size={20} color={c.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <AppText family="display" weight="bold" size={16}>
            {weekLabel}
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            {monday.format("D MMM")} – {monday.add(6, "day").format("D MMM YYYY")}
          </AppText>
        </View>
        <Pressable onPress={() => setOffset((o) => o + 1)} hitSlop={10} style={[styles.weekArrow, { backgroundColor: c.surface, borderColor: c.border }]} testID="week-next">
          <Ionicons name="chevron-forward" size={20} color={c.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        {DAYS.map((dLabel, day) => {
          const dDate = monday.add(day, "day");
          const isToday = dDate.format("YYYY-MM-DD") === dayjs().format("YYYY-MM-DD");
          return (
            <View key={day} style={[styles.dayCard, { backgroundColor: c.surface, borderColor: isToday ? c.brand : c.border }, shadow(1)]}>
              <View style={styles.dayHead}>
                <AppText family="display" weight="bold" size={15}>
                  {dLabel}
                </AppText>
                <AppText size={12} color={isToday ? c.brand : c.onSurfaceTertiary} weight={isToday ? "bold" : "regular"}>
                  {isToday ? "Today · " : ""}{dDate.format("D MMM")}
                </AppText>
              </View>
              {SLOTS.map((s) => {
                const entry = lookup[`${day}-${s.key}`];
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => (entry ? undefined : setPicker({ day, slot: s.key }))}
                    style={styles.slotRow}
                    testID={`slot-${day}-${s.key}`}
                  >
                    <AppText size={15} style={{ width: 26 }}>
                      {s.emoji}
                    </AppText>
                    {entry?.recipe ? (
                      <>
                        {entry.recipe.photo_url ? (
                          <SmartImage uri={entry.recipe.photo_url} style={styles.slotThumb} />
                        ) : (
                          <View style={[styles.slotThumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                            <AppText size={14}>🍽️</AppText>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <AppText size={11} color={c.onSurfaceTertiary}>
                            {s.label}
                          </AppText>
                          <AppText size={14} weight="semibold" numberOfLines={1}>
                            {entry.recipe.title}
                          </AppText>
                        </View>
                        <Pressable onPress={() => clearSlot(entry)} hitSlop={8} testID={`slot-clear-${day}-${s.key}`}>
                          <Ionicons name="close-circle" size={20} color={c.onSurfaceTertiary} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>
                          {s.label}
                        </AppText>
                        <View style={[styles.addPill, { borderColor: c.border }]}>
                          <Ionicons name="add" size={16} color={c.brand} />
                          <AppText size={12} weight="semibold" color={c.brand}>
                            Add
                          </AppText>
                        </View>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* add-to-shopping */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Pressable
          onPress={toShopping}
          disabled={busy || plannedCount === 0}
          style={[styles.shopBtn, { backgroundColor: plannedCount === 0 ? c.surfaceTertiary : c.brand }]}
          testID="meals-to-shopping"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cart" size={19} color={plannedCount === 0 ? c.onSurfaceTertiary : "#fff"} />
              <AppText size={15} weight="bold" color={plannedCount === 0 ? c.onSurfaceTertiary : "#fff"}>
                {plannedCount === 0 ? "Plan meals to build a list" : "Add ingredients to Shopping"}
              </AppText>
            </>
          )}
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 92 }]} testID="meals-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>
            {toast}
          </AppText>
        </View>
      ) : null}

      {/* recipe picker */}
      <Modal visible={!!picker} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <AppText family="display" weight="bold" size={18}>
                Choose a recipe
              </AppText>
              <Pressable onPress={() => { setPicker(null); router.push("/recipes/create"); }} hitSlop={8} testID="picker-new-recipe">
                <AppText size={13} weight="bold" color={c.brand}>
                  ＋ New
                </AppText>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {recipes.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
                  <AppText size={36}>🍳</AppText>
                  <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
                    No recipes yet — add one first
                  </AppText>
                </View>
              ) : (
                recipes.map((r) => (
                  <Pressable key={r.recipe_id} onPress={() => assign(r.recipe_id)} style={[styles.pickRow, { borderColor: c.border }]} testID={`pick-recipe-${r.recipe_id}`}>
                    {r.photo_url ? (
                      <SmartImage uri={r.photo_url} style={styles.slotThumb} />
                    ) : (
                      <View style={[styles.slotThumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}>
                        <AppText size={16}>🍽️</AppText>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                        {r.title}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        🧺 {(r.ingredients || []).length} ingredients
                      </AppText>
                    </View>
                    <Ionicons name="add-circle" size={24} color={c.brand} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  weekBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  weekArrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dayCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  slotRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  slotThumb: { width: 38, height: 38, borderRadius: radius.sm },
  addPill: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: radius.pill, borderWidth: 1, borderStyle: "dashed", paddingHorizontal: 12, paddingVertical: 6 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  shopBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: spacing.md },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "86%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, ...shadow(3) },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#00000022", marginBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
});
