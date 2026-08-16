import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Switch } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { EVENT_CATEGORIES } from "@/src/lib/constants";

export default function CreateEvent() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(params.date || dayjs().format("YYYY-MM-DD"));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("family");
  const [owner, setOwner] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/families/members").then((d: any) => {
      setMembers(d);
      if (d[0]) {
        setOwner(d[0].member_id);
        setParticipants([d[0].member_id]);
      }
    });
  }, []);

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Please enter an event title");
      return;
    }
    setSaving(true);
    try {
      await api("/events", {
        method: "POST",
        body: {
          title: title.trim(),
          date,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          all_day: allDay,
          location: location.trim() || null,
          category,
          owner_member_id: owner,
          participant_ids: Array.from(new Set([...(owner ? [owner] : []), ...participants])),
        },
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-event">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          New Event
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <TextField label="Title" icon="create-outline" placeholder="e.g. Football Practice" value={title} onChangeText={setTitle} testID="event-title-input" />

        {/* date stepper */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: 6 }}>
          Date
        </AppText>
        <View style={[styles.dateRow, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Pressable onPress={() => setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD"))} hitSlop={8} testID="date-prev">
            <Ionicons name="chevron-back" size={22} color={c.onSurface} />
          </Pressable>
          <AppText family="display" weight="bold" size={15}>
            {dayjs(date).format("ddd, D MMM YYYY")}
          </AppText>
          <Pressable onPress={() => setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD"))} hitSlop={8} testID="date-next">
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        {/* all day */}
        <View style={styles.switchRow}>
          <AppText size={15} weight="semibold">
            All-day
          </AppText>
          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: c.brand }} testID="all-day-switch" />
        </View>

        {!allDay ? (
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <TextField label="Start" icon="time-outline" placeholder="10:00" value={startTime} onChangeText={setStartTime} testID="start-time-input" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="End" icon="time-outline" placeholder="11:00" value={endTime} onChangeText={setEndTime} testID="end-time-input" />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Location" icon="location-outline" placeholder="Add location" value={location} onChangeText={setLocation} testID="event-location-input" />
        </View>

        {/* category */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Category
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {EVENT_CATEGORIES.map((cat) => {
            const sel = category === cat.key;
            return (
              <Pressable key={cat.key} onPress={() => setCategory(cat.key)} style={[styles.catChip, { backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary, borderColor: sel ? c.brand : "transparent" }]} testID={`event-cat-${cat.key}`}>
                <Ionicons name={cat.icon as any} size={16} color={sel ? c.onBrandTertiary : c.onSurfaceSecondary} />
                <AppText size={13} weight="semibold" color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>
                  {cat.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* participants */}
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Who's involved?
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: 4 }}>
          {members.map((m) => {
            const sel = participants.includes(m.member_id);
            return (
              <Pressable key={m.member_id} onPress={() => toggleParticipant(m.member_id)} style={{ alignItems: "center", gap: 4, opacity: sel ? 1 : 0.5 }} testID={`event-part-${m.member_id}`}>
                <Avatar uri={m.photo_url} name={m.name} size={54} color={m.color} ring={sel} />
                <AppText size={12} weight={sel ? "bold" : "medium"} numberOfLines={1} style={{ maxWidth: 64 }}>
                  {m.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="event-error">
            {error}
          </AppText>
        ) : null}

        <Button label="Save Event" onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-event-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.lg, height: 54 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  timeRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, borderWidth: 1.5, flexShrink: 0 },
});
