import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Modal, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
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
  const isHost = member?.role === "admin" || member?.role === "parent";
  const [month, setMonth] = useState(dayjs());
  const [selected, setSelected] = useState(dayjs().format("YYYY-MM-DD"));
  const [events, setEvents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"month" | "week" | "day" | "task">("month");
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);

  const load = useCallback(async () => {
    const start = month.startOf("month").startOf("week").format("YYYY-MM-DD");
    const end = month.endOf("month").endOf("week").format("YYYY-MM-DD");
    try {
      const [data, fam] = await Promise.all([
        api<any[]>(`/events?start=${start}&end=${end}`),
        api<any>("/families/me").catch(() => null),
      ]);
      setEvents(data);
      if (fam?.members) setMembers(fam.members);
    } catch {}
  }, [month]);

  const loadTasks = useCallback(async () => {
    try {
      const r = await api<{ tasks: any[]; can_manage: boolean }>("/tasks/upcoming");
      setTasks(r.tasks || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadTasks();
    }, [load, loadTasks])
  );

  const toggleTask = async (item: any) => {
    setTasks((prev) => prev.filter((t) => t.item_id !== item.item_id));
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await api(`/todos/items/${item.item_id}/toggle`, { method: "POST" });
    } catch {
      loadTasks();
    }
  };

  const grid = useMemo(() => {
    const start = month.startOf("month").startOf("week");
    return Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  }, [month]);

  const matchesFilter = useCallback(
    (e: any) => {
      if (memberFilter.size === 0) return true;
      const ids: string[] = [...(e.participant_ids || []), e.owner_member_id].filter(Boolean);
      return ids.some((id) => memberFilter.has(id));
    },
    [memberFilter]
  );

  const visibleEvents = useMemo(() => events.filter(matchesFilter), [events, matchesFilter]);

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of visibleEvents) {
      (map[e.date] = map[e.date] || []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.all_day ? -1 : 0) - (b.all_day ? -1 : 0) || (a.start_time || "").localeCompare(b.start_time || ""));
    }
    return map;
  }, [visibleEvents]);

  const toggleMember = (id: string) => {
    setMemberFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const weekDays = useMemo(() => {
    const start = dayjs(selected).startOf("week");
    return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
  }, [selected]);

  const goPrev = () => {
    if (view === "month") {
      setMonth((m) => m.subtract(1, "month"));
    } else {
      const d = dayjs(selected).subtract(view === "week" ? 7 : 1, "day");
      setSelected(d.format("YYYY-MM-DD"));
      setMonth(d.startOf("month"));
    }
  };

  const goNext = () => {
    if (view === "month") {
      setMonth((m) => m.add(1, "month"));
    } else {
      const d = dayjs(selected).add(view === "week" ? 7 : 1, "day");
      setSelected(d.format("YYYY-MM-DD"));
      setMonth(d.startOf("month"));
    }
  };

  const goToday = () => {
    const t = dayjs();
    setMonth(t);
    setSelected(t.format("YYYY-MM-DD"));
  };

  const heroLabel = () => {
    if (view === "task") return "Tasks";
    if (view === "month") return month.format("MMMM");
    if (view === "week") {
      const s = dayjs(selected).startOf("week");
      const e = dayjs(selected).endOf("week");
      return s.month() === e.month() ? `${s.format("D")}–${e.format("D MMM")}` : `${s.format("D MMM")}–${e.format("D MMM")}`;
    }
    return dayjs(selected).format("ddd, D MMM");
  };

  const heroSub = () => {
    if (view === "task") return tasks.length ? `${tasks.length} open to-do${tasks.length > 1 ? "s" : ""}` : "All caught up";
    if (view === "day") return dayjs(selected).format("MMMM YYYY");
    return (view === "week" ? dayjs(selected) : month).format("YYYY");
  };

  const selectedEvents = (byDate[selected] || []).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const delEvent = (e: any) => {
    if (e.repeat && e.repeat !== "none") {
      setPendingDelete(e);
      return;
    }
    doDelete(e.event_id, "single");
  };

  const doDelete = async (id: string, scope: "single" | "series") => {
    setPendingDelete(null);
    if (scope === "series") {
      const target = events.find((e) => e.event_id === id);
      const sid = target?.series_id;
      setEvents((prev) => prev.filter((e) => (sid ? e.series_id !== sid : e.event_id !== id)));
    } else {
      setEvents((prev) => prev.filter((e) => e.event_id !== id));
    }
    try {
      await api(`/events/${id}?scope=${scope}`, { method: "DELETE" });
    } catch {}
    load();
  };

  const nudge = async (eventId: string) => {
    try {
      const res = await api<{ nudged: number; names: string[] }>(`/events/${eventId}/nudge`, { method: "POST" });
      if (res.nudged > 0) flashToast(`⏰ Reminder sent to ${res.names.join(", ")}`);
      else flashToast("Everyone has already replied 🎉");
    } catch {
      flashToast("Couldn't send the reminder");
    }
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
      {/* gradient header */}
      <LinearGradient
        colors={[c.brandPrimary, "#FF9E9E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View>
            <AppText size={12} weight="bold" color="rgba(255,255,255,0.85)">
              {heroSub()}
            </AppText>
            <AppText family="display" weight="bold" size={26} color="#fff">
              {heroLabel()}
            </AppText>
          </View>
          <View style={styles.headerBtns}>
            {view === "task" ? (
              <View style={styles.heroTaskIcon}>
                <Ionicons name="checkbox-outline" size={20} color="#fff" />
              </View>
            ) : (
              <>
                <Pressable onPress={goPrev} hitSlop={8} style={styles.heroNav} testID="cal-prev" accessibilityRole="button" accessibilityLabel="Previous">
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </Pressable>
                <Pressable onPress={goToday} style={styles.heroToday} testID="cal-today">
                  <AppText size={12} weight="bold" color="#fff">Today</AppText>
                </Pressable>
                <Pressable onPress={goNext} hitSlop={8} style={styles.heroNav} testID="cal-next" accessibilityRole="button" accessibilityLabel="Next">
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* view switch */}
        <View style={styles.viewSwitch}>
          {(["month", "week", "day", "task"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[styles.viewSeg, view === v && { backgroundColor: "#fff" }]}
              testID={`cal-view-${v}`}
            >
              <AppText size={12} weight="bold" color={view === v ? c.brandPrimary : "#fff"} numberOfLines={1}>
                {v === "month" ? "Month" : v === "week" ? "Week" : v === "day" ? "Day" : "Tasks"}
              </AppText>
            </Pressable>
          ))}
        </View>

        {/* member color filter */}
        {members.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberRow} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
            {members.map((m) => {
              const active = memberFilter.size === 0 || memberFilter.has(m.member_id);
              return (
                <Pressable key={m.member_id} onPress={() => toggleMember(m.member_id)} style={styles.memberChip} testID={`cal-member-${m.member_id}`}>
                  <View style={{ opacity: active ? 1 : 0.4 }}>
                    <Avatar uri={m.photo_url} name={m.name} size={40} color={m.color} ring />
                    {memberFilter.has(m.member_id) ? (
                      <View style={[styles.memberCheck, { backgroundColor: m.color || "#fff" }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <AppText size={11} weight={active ? "bold" : "regular"} color="rgba(255,255,255,0.95)" numberOfLines={1} style={{ maxWidth: 52 }}>
                    {m.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* month grid */}
        {view === "month" ? (
        <View style={[styles.calCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(2)]}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((d, i) => (
              <AppText key={i} size={11} weight="bold" color={i === 0 || i === 6 ? c.brandPrimary : c.onSurfaceTertiary} style={styles.weekLabel}>
                {d}
              </AppText>
            ))}
          </View>
          <View style={styles.gridWrap}>
            {Array.from({ length: 6 }, (_, w) => (
              <View key={w} style={styles.gridRow}>
                {grid.slice(w * 7, w * 7 + 7).map((day) => {
                  const ds = day.format("YYYY-MM-DD");
                  const inMonth = day.month() === month.month();
                  const isSel = ds === selected;
                  const isToday = ds === dayjs().format("YYYY-MM-DD");
                  const dayEvents = byDate[ds] || [];
                  const isWeekend = day.day() === 0 || day.day() === 6;
                  return (
                    <Pressable
                      key={ds}
                      style={[styles.cell, { borderColor: c.divider }, isSel && { backgroundColor: c.brandPrimary + "0F" }]}
                      onPress={() => setSelected(ds)}
                      testID={`day-${ds}`}
                    >
                      <View style={[
                        styles.dayNum,
                        isToday && !isSel && { borderWidth: 1.5, borderColor: c.brandPrimary },
                        isSel && { backgroundColor: c.brandPrimary },
                      ]}>
                        <AppText
                          size={13}
                          weight={isToday || isSel ? "bold" : "regular"}
                          color={isSel ? "#fff" : isToday ? c.brandPrimary : !inMonth ? c.onSurfaceTertiary + "80" : isWeekend ? c.brandPrimary : c.onSurface}
                        >
                          {day.date()}
                        </AppText>
                      </View>
                      <View style={styles.pillWrap}>
                        {dayEvents.slice(0, 2).map((e, i) => (
                          <View key={i} style={[styles.eventPill, { backgroundColor: (e.color || c.brandPrimary) + "22", borderLeftColor: e.color || c.brandPrimary }]}>
                            <AppText size={9} weight="bold" color={inMonth ? c.onSurface : c.onSurfaceTertiary} numberOfLines={1}>
                              {e.title}
                            </AppText>
                          </View>
                        ))}
                        {dayEvents.length > 2 ? (
                          <AppText size={9} weight="bold" color={c.onSurfaceTertiary} numberOfLines={1} style={{ paddingLeft: 2 }}>
                            +{dayEvents.length - 2} more
                          </AppText>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
        ) : null}

        {/* week view */}
        {view === "week" ? (
          <View style={styles.weekList}>
            {weekDays.map((day) => {
              const ds = day.format("YYYY-MM-DD");
              const isSel = ds === selected;
              const isToday = ds === dayjs().format("YYYY-MM-DD");
              const dayEvents = byDate[ds] || [];
              const heat = dayEvents.length;
              const HEAT = ["", "16", "26", "3A", "4D"]; // alpha for 0..4+ events
              const heatBg = heat === 0 ? c.surface : c.brandPrimary + HEAT[Math.min(heat, 4)];
              return (
                <Pressable
                  key={ds}
                  onPress={() => { setSelected(ds); setView("day"); }}
                  style={[styles.weekDayRow, { backgroundColor: heatBg, borderColor: isSel ? c.brandPrimary : heat >= 4 ? c.brandPrimary + "66" : c.border }, shadow(1)]}
                  testID={`week-day-${ds}`}
                >
                  <View style={styles.weekDayLeft}>
                    <AppText size={10} weight="bold" color={isToday ? c.brandPrimary : c.onSurfaceTertiary}>
                      {day.format("ddd").toUpperCase()}
                    </AppText>
                    <View style={[styles.weekDateCircle, isToday && { backgroundColor: c.brandPrimary }]}>
                      <AppText size={16} weight="bold" color={isToday ? "#fff" : c.onSurface}>{day.date()}</AppText>
                    </View>
                    {heat > 0 ? (
                      <AppText size={9} weight="bold" color={heat >= 4 ? c.brandPrimary : c.onSurfaceTertiary}>
                        {heat >= 4 ? "🔥" : ""}{heat}
                      </AppText>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    {heat >= 4 ? (
                      <AppText size={11} weight="bold" color={c.brandPrimary}>Busy day · {heat} events</AppText>
                    ) : null}
                    {dayEvents.length === 0 ? (
                      <AppText size={12} color={c.onSurfaceTertiary}>No events</AppText>
                    ) : (
                      dayEvents.map((e, i) => (
                        <View key={i} style={[styles.weekChip, { backgroundColor: (e.color || c.brandPrimary) + "1F", borderLeftColor: e.color || c.brandPrimary }]}>
                          <AppText size={11} weight="bold" color={c.onSurfaceSecondary} style={{ width: 52 }}>
                            {e.all_day ? "All day" : e.start_time || "—"}
                          </AppText>
                          <AppText size={13} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>{e.title}</AppText>
                        </View>
                      ))
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* task view */}
        {view === "task" ? (() => {
          const filtered = tasks.filter((t) => memberFilter.size === 0 || (t.assignee && memberFilter.has(t.assignee.member_id)));
          const groups: { key: string; label: string; tone: string; items: any[] }[] = [
            { key: "overdue", label: "Overdue", tone: c.error, items: [] },
            { key: "today", label: "Due today", tone: c.brandPrimary, items: [] },
            { key: "week", label: "This week", tone: c.onSurface, items: [] },
            { key: "later", label: "Later", tone: c.onSurfaceSecondary, items: [] },
            { key: "none", label: "No date", tone: c.onSurfaceTertiary, items: [] },
          ];
          const today = dayjs().format("YYYY-MM-DD");
          const weekEnd = dayjs().add(7, "day").format("YYYY-MM-DD");
          for (const t of filtered) {
            if (!t.due_date) groups[4].items.push(t);
            else if (t.due_date < today) groups[0].items.push(t);
            else if (t.due_date === today) groups[1].items.push(t);
            else if (t.due_date <= weekEnd) groups[2].items.push(t);
            else groups[3].items.push(t);
          }
          const shown = groups.filter((g) => g.items.length);
          if (!filtered.length) {
            return (
              <View style={styles.emptyDay}>
                <AppText size={32}>✅</AppText>
                <AppText size={15} weight="bold" color={c.onSurface} center style={{ marginTop: spacing.sm }}>
                  All caught up!
                </AppText>
                <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
                  No open to-dos right now. Tap + to add one.
                </AppText>
              </View>
            );
          }
          return (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              {shown.map((g) => (
                <View key={g.key} style={{ marginBottom: spacing.lg }}>
                  <View style={styles.taskGroupHead}>
                    <View style={[styles.taskGroupDot, { backgroundColor: g.tone }]} />
                    <AppText family="display" weight="bold" size={13} color={g.tone}>{g.label}</AppText>
                    <AppText size={12} weight="bold" color={c.onSurfaceTertiary}>{g.items.length}</AppText>
                  </View>
                  {g.items.map((t) => {
                    const high = t.priority === "high";
                    return (
                      <View
                        key={t.item_id}
                        style={[styles.taskRow, { backgroundColor: c.surface, borderColor: high ? c.error + "55" : c.border }, shadow(1)]}
                        testID={`cal-task-${t.item_id}`}
                      >
                        <Pressable
                          onPress={() => toggleTask(t)}
                          hitSlop={8}
                          style={[styles.taskCheck, { borderColor: c.borderStrong }]}
                          testID={`cal-task-check-${t.item_id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ${t.title} done`}
                        >
                          <Ionicons name="ellipse-outline" size={22} color={c.onSurfaceTertiary} />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <AppText size={14} weight="semibold" color={c.onSurface}>{t.title}</AppText>
                          <View style={styles.taskMeta}>
                            {high ? (
                              <View style={[styles.taskTag, { backgroundColor: c.error + "1A" }]}>
                                <Ionicons name="flag" size={11} color={c.error} />
                                <AppText size={11} weight="bold" color={c.error}>High</AppText>
                              </View>
                            ) : null}
                            {t.due_date ? (
                              <View style={styles.taskMetaItem}>
                                <Ionicons name="calendar-outline" size={12} color={t.overdue ? c.error : c.onSurfaceTertiary} />
                                <AppText size={12} weight={t.overdue ? "bold" : "regular"} color={t.overdue ? c.error : c.onSurfaceTertiary}>
                                  {dayjs(t.due_date).format("DD MMM")}
                                </AppText>
                              </View>
                            ) : null}
                            {t.list_name ? (
                              <View style={styles.taskMetaItem}>
                                <Ionicons name="list-outline" size={12} color={c.onSurfaceTertiary} />
                                <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{t.list_name}</AppText>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        {t.assignee ? (
                          <View style={styles.taskAssignee}>
                            <Avatar uri={t.assignee.photo_url} name={t.assignee.name} size={26} color={t.assignee.color} ring />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })() : null}

        {(view === "month" || view === "day") ? (
        <>
        {/* agenda */}
        <View style={styles.agendaHeader}>
          <AppText family="display" weight="bold" size={17}>
            {dayjs(selected).format("dddd, D MMMM")}
          </AppText>
          {selectedEvents.length ? (
            <View style={[styles.agendaCount, { backgroundColor: c.brandTertiary }]}>
              <AppText size={11} weight="bold" color={c.onBrandTertiary}>{selectedEvents.length}</AppText>
            </View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: spacing.lg }}>
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
                {(() => {
                  const awaitingOthers = (e.awaiting || []).filter((m: any) => m.member_id !== myId);
                  return isHost && awaitingOthers.length > 0 ? (
                    <View style={styles.awaitRow}>
                      <AppText size={11} color={c.onSurfaceSecondary} style={{ flex: 1 }} numberOfLines={2}>
                        ⏳ Waiting on {awaitingOthers.map((m: any) => m.name).join(", ")}
                      </AppText>
                      <Pressable
                        onPress={() => nudge(e.event_id)}
                        style={[styles.nudgeBtn, { backgroundColor: c.brandTertiary }]}
                        testID={`rsvp-nudge-${e.event_id}`}
                      >
                        <Ionicons name="notifications-outline" size={13} color={c.onBrandTertiary} />
                        <AppText size={11} weight="bold" color={c.onBrandTertiary}>Remind</AppText>
                      </Pressable>
                    </View>
                  ) : null;
                })()}
              </View>
              <Pressable onPress={() => delEvent(e)} hitSlop={8} testID={`del-event-${e.event_id}`}>
                <Ionicons name="trash-outline" size={18} color={c.onSurfaceTertiary} />
              </Pressable>
            </View>
          ))
        )}
        </View>
        </>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={() => router.push(view === "task" ? "/todos" : `/event/create?date=${selected}`)}
        style={[styles.fab, { backgroundColor: c.brand }, shadow(3)]}
        testID="fab-create-event"
        accessibilityRole="button"
        accessibilityLabel={view === "task" ? "Add task" : "Add event"}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* delete a recurring event: this one vs the whole series */}
      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPendingDelete(null)}>
          <Pressable style={[styles.delCard, { backgroundColor: c.surface }]} onPress={(ev) => ev.stopPropagation()}>
            <AppText family="display" weight="bold" size={17} center>Delete repeating event</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 6 }}>
              {`“${pendingDelete?.title}” repeats ${pendingDelete?.repeat === "weekly" ? "weekly" : "monthly"}.`}
            </AppText>
            <Pressable
              onPress={() => doDelete(pendingDelete.event_id, "single")}
              style={[styles.delOpt, { borderColor: c.border }]}
              testID="del-scope-single"
            >
              <Ionicons name="calendar-outline" size={18} color={c.onSurface} />
              <AppText size={15} weight="semibold">Just this one</AppText>
            </Pressable>
            <Pressable
              onPress={() => doDelete(pendingDelete.event_id, "series")}
              style={[styles.delOpt, { borderColor: c.error }]}
              testID="del-scope-series"
            >
              <Ionicons name="repeat" size={18} color={c.error} />
              <AppText size={15} weight="semibold" color={c.error}>All events in the series</AppText>
            </Pressable>
            <Pressable onPress={() => setPendingDelete(null)} style={styles.delCancel} testID="del-scope-cancel">
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse }, shadow(3)]} testID="calendar-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse} center>{toast}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroNav: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)" },
  heroTaskIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)" },
  heroToday: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.25)" },
  viewSwitch: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.pill, padding: 3, marginTop: spacing.md, gap: 3 },
  viewSeg: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7, borderRadius: radius.pill },
  memberRow: { marginTop: spacing.md },
  memberChip: { alignItems: "center", gap: 4, width: 56 },
  memberCheck: { position: "absolute", bottom: 0, right: 2, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  calCard: { margin: spacing.lg, borderRadius: radius.lg, padding: spacing.sm, borderWidth: 1 },
  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekLabel: { flex: 1, textAlign: "center" },
  gridWrap: {},
  gridRow: { flexDirection: "row" },
  cell: { flex: 1, minWidth: 0, minHeight: 52, paddingTop: 3, paddingBottom: 4, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: "hidden" },
  dayNum: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  pillWrap: { marginTop: 2, gap: 2, width: "100%" },
  eventPill: { borderRadius: 4, borderLeftWidth: 3, paddingHorizontal: 3, paddingVertical: 1.5, overflow: "hidden" },
  agendaHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  weekList: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  weekDayRow: { flexDirection: "row", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, alignItems: "flex-start" },
  weekDayLeft: { alignItems: "center", width: 40, gap: 2 },
  weekDateCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  weekChip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  agendaCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  emptyDay: { alignItems: "center", paddingVertical: spacing["2xl"] },
  eventCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  eventBar: { width: 5, height: "100%", minHeight: 44, borderRadius: 3 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  avatarRow: { flexDirection: "row", marginTop: spacing.sm },
  rsvpRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  rsvpPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  awaitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  nudgeBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  taskGroupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm, paddingLeft: 2 },
  taskGroupDot: { width: 8, height: 8, borderRadius: 4 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  taskCheck: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 5, flexWrap: "wrap" },
  taskMetaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  taskTag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  taskAssignee: { marginLeft: 2 },
  fab: { position: "absolute", right: spacing.lg, bottom: 90, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  delCard: { width: "100%", maxWidth: 360, borderRadius: radius.lg, padding: spacing.xl },
  delOpt: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1.5, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  delCancel: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.xs },
  toast: { position: "absolute", alignSelf: "center", bottom: 100, maxWidth: "88%", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
