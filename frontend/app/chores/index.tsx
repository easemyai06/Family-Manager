import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Chores() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chores, setChores] = useState<any[]>([]);
  const [stars, setStars] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [starCount, setStarCount] = useState(1);
  const [toast, setToast] = useState<{ name: string; owner: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [ch, st, mem] = await Promise.all([api("/chores"), api("/chores/stars"), api("/families/members")]);
      setChores(ch);
      setStars(st);
      setMembers(mem);
      const kids = mem.filter((m: any) => m.is_child);
      if (!owner) setOwner((kids[0] || mem[0])?.member_id || null);
    } catch {}
  }, [owner]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (chore: any) => {
    const nextDone = !chore.done_today;
    setChores((prev) => prev.map((ch) => (ch.chore_id === chore.chore_id ? { ...ch, done_today: nextDone } : ch)));
    try {
      if (nextDone) {
        await api(`/chores/${chore.chore_id}/complete`, { method: "POST" });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setToast({ name: chore.owner?.name, owner: chore.owner_member_id });
        setTimeout(() => setToast(null), 3000);
      } else {
        await api(`/chores/${chore.chore_id}/uncomplete`, { method: "POST" });
      }
      const st = await api("/chores/stars");
      setStars(st);
    } catch {}
  };

  const addChore = async () => {
    if (!title.trim() || !owner) return;
    await api("/chores", { method: "POST", body: { title: title.trim(), owner_member_id: owner, stars: starCount, schedule: "daily" } });
    setTitle("");
    setAdding(false);
    load();
  };

  const del = async (id: string) => {
    setChores((prev) => prev.filter((ch) => ch.chore_id !== id));
    await api(`/chores/${id}`, { method: "DELETE" });
  };

  // group by owner
  const groups: Record<string, { owner: any; items: any[] }> = {};
  for (const ch of chores) {
    const key = ch.owner_member_id;
    if (!groups[key]) groups[key] = { owner: ch.owner, items: [] };
    groups[key].items.push(ch);
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="chores-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={20}>
          Chores & Stars
        </AppText>
        <Pressable onPress={() => setAdding((a) => !a)} hitSlop={12} testID="toggle-add-chore">
          <Ionicons name={adding ? "close" : "add"} size={26} color={c.brand} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {/* stars leaderboard */}
        {stars.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {stars.map((s) => (
              <View key={s.member.member_id} style={[styles.starChip, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                <Avatar uri={s.member.photo_url} name={s.member.name} size={30} color={s.member.color} />
                <AppText size={13} weight="bold">
                  {s.member.name}
                </AppText>
                <View style={[styles.starBadge, { backgroundColor: c.warning }]}>
                  <AppText size={12} weight="bold" color={c.onWarning}>
                    ⭐ {s.stars}
                  </AppText>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {/* add form */}
        {adding ? (
          <View style={[styles.addCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            <TextField placeholder="Chore title, e.g. Make Bed" value={title} onChangeText={setTitle} testID="chore-title-input" />
            <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, marginBottom: 6 }}>
              Assign to
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
              {members.map((m) => (
                <Pressable key={m.member_id} onPress={() => setOwner(m.member_id)} style={{ alignItems: "center", gap: 4, opacity: owner === m.member_id ? 1 : 0.5 }} testID={`chore-owner-${m.member_id}`}>
                  <Avatar uri={m.photo_url} name={m.name} size={46} color={m.color} ring={owner === m.member_id} />
                  <AppText size={11} weight={owner === m.member_id ? "bold" : "medium"}>
                    {m.name}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.starStepper}>
              <AppText size={13} weight="semibold" color={c.onSurfaceSecondary}>
                Reward stars
              </AppText>
              <View style={styles.stepper}>
                <Pressable onPress={() => setStarCount((s) => Math.max(1, s - 1))} hitSlop={8} testID="star-minus">
                  <Ionicons name="remove-circle" size={26} color={c.onSurfaceTertiary} />
                </Pressable>
                <AppText size={16} weight="bold" style={{ width: 40, textAlign: "center" }}>
                  ⭐{starCount}
                </AppText>
                <Pressable onPress={() => setStarCount((s) => Math.min(5, s + 1))} hitSlop={8} testID="star-plus">
                  <Ionicons name="add-circle" size={26} color={c.brand} />
                </Pressable>
              </View>
            </View>
            <Button label="Add Chore" onPress={addChore} style={{ marginTop: spacing.md }} testID="add-chore-submit" />
          </View>
        ) : null}

        {/* groups */}
        {Object.keys(groups).length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🧹</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No chores yet
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Tap + to add the first chore
            </AppText>
          </View>
        ) : (
          Object.entries(groups).map(([key, g]) => (
            <View key={key} style={{ marginBottom: spacing.xl }}>
              <View style={styles.groupHead}>
                <Avatar uri={g.owner?.photo_url} name={g.owner?.name} size={32} color={g.owner?.color} />
                <AppText family="display" weight="bold" size={16}>
                  {g.owner?.name}'s Chores
                </AppText>
              </View>
              <View style={[styles.choreCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
                {g.items.map((ch, i) => (
                  <View key={ch.chore_id} style={[styles.choreRow, i < g.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                    <Pressable onPress={() => toggle(ch)} hitSlop={8} testID={`chore-toggle-${ch.chore_id}`}>
                      <View style={[styles.checkbox, { borderColor: ch.done_today ? c.success : c.borderStrong, backgroundColor: ch.done_today ? c.success : "transparent" }]}>
                        {ch.done_today ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                      </View>
                    </Pressable>
                    <AppText size={15} weight="semibold" style={{ flex: 1, textDecorationLine: ch.done_today ? "line-through" : "none", color: ch.done_today ? c.onSurfaceTertiary : c.onSurface }}>
                      {ch.title}
                    </AppText>
                    <AppText size={13} color={c.warning}>
                      ⭐{ch.stars}
                    </AppText>
                    <Pressable onPress={() => del(ch.chore_id)} hitSlop={8} testID={`chore-del-${ch.chore_id}`}>
                      <Ionicons name="trash-outline" size={17} color={c.onSurfaceTertiary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 20 }, shadow(3)]} testID="chore-toast">
          <AppText size={14} weight="bold" color={c.onSurfaceInverse}>
            Great job, {toast.name}! ⭐
          </AppText>
          <Pressable onPress={() => { router.push(`/affection/send?member=${toast.owner}`); setToast(null); }} testID="send-proud-btn">
            <AppText size={13} weight="bold" color={c.brandSecondary}>
              Send 👏 Proud
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  starChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  starBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  addCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.lg },
  starStepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  choreCard: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1 },
  choreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  toast: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: spacing.lg, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
