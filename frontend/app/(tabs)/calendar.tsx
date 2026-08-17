import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const RSVP_OPTS: { k: string; label: string; icon: any; tone: "success" | "warning" | "error" }[] = [
  { k: "going", label: "Going", icon: "checkmark-circle", tone: "success" },
  { k: "maybe", label: "Maybe", icon: "help-circle", tone: "warning" },
  { k: "declined", label: "Can't", icon: "close-circle", tone: "error" },
];

export default function Calendar() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const myId = member?.member_id;
  const [month, setMonth] = useState(dayjs());
  const [selected, setSelected] = useState(dayjs().format("YYYY-MM-DD"));
  const [events, setEvents] = useState<any[]>([]);

  const load = useCallback(async () => {
    const start = month.startOf("month").startOf("week").format("YYYY-MM-DD");
    const end = month.endOf("month").endOf("week").format("YYYY-MM-DD");
    try {
      const data = await api<any[]>(`/events?start=${start}&end=${end}`);
      setEvents(data);
    } catch {}
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grid = useMemo(() => {
    const start = month.startOf("month").startOf("week");
    return Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  }, [month]);

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) {
      (map[e.date] = map[e.date] || []).push(e);
    }
    return map;
  }, [events]);

  const selectedEvents = (byDate[selected] || []).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const delEvent = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.event_id !== id));
    try {
      await api(`/events/${id}`, { method: "DELETE" });
    } catch {}
  };

  const rsvp = async (eventId: string, status: string) => {
    setEvents((prev) => prev.map((e) => (e.event_id === eventId ? { ...e, my_rsvp: status } : e)));
    try {
      const updated = await api(`/events/${eventId}/rsvp`, { method: "POST", body: { status } });
      setEvents((prev) => prev.map((e) => (e.event_id === eventId ? updated : e)));
    } catch {
      load();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      {/* header */}
      <View style={styles.header}>
        <AppText family="display" weight="bold" size={24}>
          {month.format("MMMM YYYY")}
        </AppText>
        <View style={styles.headerBtns}>
          <Pressable onPress={() => setMonth((m) => m.subtract(1, "month"))} hitSlop={8} style={styles.navBtn} testID="cal-prev">
            <Ionicons name="chevron-back" size={22} color={c.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => {
              setMonth(dayjs());
              setSelected(dayjs().format("YYYY-MM-DD"));
            }}
            style={[styles.todayBtn, { backgroundColor: c.brandTertiary }]}
            testID="cal-today"
          >
            <AppText size={12} weight="bold" color={c.onBrandTertiary}>
              Today
            </AppText>
          </Pressable>
          <Pressable onPress={() => setMonth((m) => m.add(1, "month"))} hitSlop={8} style={styles.navBtn} testID="cal-next">
            <Ionicons name="chevron-forward" size={22} color={c.onSurface} />
          </Pressable>
        </View>
      </View>

      {/* grid */}
      <View style={[styles.calCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((d, i) => (
            <AppText key={i} size={12} weight="semibold" color={c.onSurfaceTertiary} style={styles.weekLabel}>
              {d}
            </AppText>
          ))}
        </View>
        <View style={styles.gridWrap}>
          {grid.map((day) => {
            const ds = day.format("YYYY-MM-DD");
            const inMonth = day.month() === month.month();
            const isSel = ds === selected;
            const isToday = ds === dayjs().format("YYYY-MM-DD");
            const dayEvents = byDate[ds] || [];
            return (
              <Pressable key={ds} style={styles.cell} onPress={() => setSelected(ds)} testID={`day-${ds}`}>
                <View style={[styles.dayCircle, isSel && { backgroundColor: c.brand }]}>
                  <AppText
                    size={14}
                    weight={isToday || isSel ? "bold" : "regular"}
                    color={isSel ? "#fff" : !inMonth ? c.onSurfaceTertiary : isToday ? c.brand : c.onSurface}
                  >
                    {day.date()}
                  </AppText>
                </View>
                <View style={styles.dotRow}>
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: isSel ? "#fff" : e.color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* agenda */}
      <View style={styles.agendaHeader}>
        <AppText family="display" weight="bold" size={17}>
          {dayjs(selected).format("dddd, D MMMM")}
        </AppText>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {selectedEvents.length === 0 ? (
          <View style={styles.emptyDay}>
            <AppText size={32}>📅</AppText>
            <AppText size={14} color={c.onSurfaceTertiary} style={{ marginTop: spacing.sm }}>
              Nothing planned. Tap + to add an event.
            </AppText>
          </View>
        ) : (
          selectedEvents.map((e) => (
            <View key={e.event_id} style={[styles.eventCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`event-${e.event_id}`}>
              <View style={[styles.eventBar, { backgroundColor: e.color }]} />
              <View style={{ flex: 1 }}>
                <AppText family="display" weight="bold" size={15}>
                  {e.title}
                </AppText>
                <View style={styles.eventMeta}>
                  <Ionicons name="time-outline" size={13} color={c.onSurfaceTertiary} />
                  <AppText size={12} color={c.onSurfaceSecondary}>
                    {e.all_day ? "All day" : `${e.start_time || ""}${e.end_time ? " – " + e.end_time : ""}`}
                  </AppText>
                  {e.repeat && e.repeat !== "none" ? (
                    <>
                      <Ionicons name="repeat" size={13} color={c.brand} />
                      <AppText size={12} weight="semibold" color={c.brand}>
                        {e.repeat === "weekly" ? "Weekly" : "Monthly"}
                      </AppText>
                    </>
                  ) : null}
                  {e.location ? (
                    <>
                      <Ionicons name="location-outline" size={13} color={c.onSurfaceTertiary} />
                      <AppText size={12} color={c.onSurfaceSecondary} numberOfLines={1}>
                        {e.location}
                      </AppText>
                    </>
                  ) : null}
                </View>
                {e.participants?.length ? (
                  <View style={styles.avatarRow}>
                    {e.participants.slice(0, 5).map((p: any, i: number) => (
                      <View key={p.member_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                        <Avatar uri={p.photo_url} name={p.name} size={24} color={p.color} ring />
                      </View>
                    ))}
                  </View>
                ) : null}
                {((e.participant_ids || []).includes(myId) || e.owner_member_id === myId) ? (
                  <View style={styles.rsvpRow}>
                    {RSVP_OPTS.map((o) => {
                      const active = e.my_rsvp === o.k;
                      const col = o.tone === "success" ? c.success : o.tone === "warning" ? c.warning : c.error;
                      return (
                        <Pressable
                          key={o.k}
                          onPress={() => rsvp(e.event_id, o.k)}
                          style={[styles.rsvpPill, { backgroundColor: active ? col : "transparent", borderColor: active ? col : c.border }]}
                          testID={`rsvp-${o.k}-${e.event_id}`}
                        >
                          <Ionicons name={o.icon} size={13} color={active ? "#fff" : col} />
                          <AppText size={11} weight="bold" color={active ? "#fff" : c.onSurfaceSecondary}>{o.label}</AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {(e.rsvp_summary?.going || e.rsvp_summary?.maybe || e.rsvp_summary?.declined) ? (
                  <AppText size={11} color={c.onSurfaceTertiary} style={{ marginTop: 4 }}>
                    {`${e.rsvp_summary.going} going · ${e.rsvp_summary.maybe} maybe · ${e.rsvp_summary.declined} can't make it`}
                  </AppText>
                ) : null}
              </View>
              <Pressable onPress={() => delEvent(e.event_id)} hitSlop={8} testID={`del-event-${e.event_id}`}>
                <Ionicons name="trash-outline" size={18} color={c.onSurfaceTertiary} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push(`/event/create?date=${selected}`)}
        style={[styles.fab, { backgroundColor: c.brand }, shadow(3)]}
        testID="fab-create-event"
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  navBtn: { padding: 4 },
  todayBtn: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  calCard: { marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1 },
  weekRow: { flexDirection: "row", marginBottom: spacing.sm },
  weekLabel: { flex: 1, textAlign: "center" },
  gridWrap: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dotRow: { flexDirection: "row", gap: 3, height: 8, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  agendaHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  emptyDay: { alignItems: "center", paddingVertical: spacing["2xl"] },
  eventCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  eventBar: { width: 5, height: "100%", minHeight: 44, borderRadius: 3 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  avatarRow: { flexDirection: "row", marginTop: spacing.sm },
  rsvpRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  rsvpPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  fab: { position: "absolute", right: spacing.lg, bottom: 90, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
