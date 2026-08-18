import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { AffectionAnimation } from "@/src/components/AffectionAnimation";
import { StarBurst } from "@/src/components/StarBurst";
import { KidsHome } from "@/src/components/home/KidsHome";
import { SimpleHome } from "@/src/components/home/SimpleHome";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { storage } from "@/src/utils/storage";
import { greeting, formatDate } from "@/src/lib/time";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { STATUS_OPTIONS, statusFor } from "@/src/lib/statuses";
import { personaOf, ORDER, applyPrefs, EMPTY_PREFS, DashPrefs } from "@/src/lib/dashboard";

const QUICK = [
  { key: "event", emoji: "📅", label: "Add Event", route: "/event/create" },
  { key: "task", emoji: "✅", label: "Add Task", route: "/todos" },
  { key: "shopping", emoji: "🛒", label: "Shopping", route: "/shopping" },
  { key: "memory", emoji: "📸", label: "Add Memory", route: "/timeline/create" },
  { key: "message", emoji: "💬", label: "Message", route: "/(tabs)/chat" },
  { key: "love", emoji: "🤗", label: "Send Love", route: "/affection/send" },
];

const TONE_MAP: Record<string, string> = {
  error: "#E05757", warning: "#E8A33D", info: "#7FA9C9", success: "#8AB07D", brand: "#FF6B6B",
};

export default function Home() {
  const { c, simpleHome } = useTheme();
  const { familyChatId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<any>(null);
  const [notifUnread, setNotifUnread] = useState(0);
  const [prefs, setPrefs] = useState<DashPrefs>(EMPTY_PREFS);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState<any>(null);
  const [nudge, setNudge] = useState<any>(null);
  const [taskFilter, setTaskFilter] = useState<"mine" | "kids" | "family">("family");
  const [celebrating, setCelebrating] = useState(false);

  // status editor
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, inbox, p, nu] = await Promise.all([
        api("/home"),
        api("/affection/inbox"),
        api<DashPrefs>("/dashboard/prefs").catch(() => EMPTY_PREFS),
        api<any>("/notifications/unread").catch(() => ({ count: 0 })),
      ]);
      setHome(h);
      setPrefs(p || EMPTY_PREFS);
      setNotifUnread(nu?.count || 0);
      if (inbox?.unseen?.length) setIncoming(inbox.unseen[0]);
      if (h?.on_this_day?.length) {
        const key = `otdNudge:${new Date().toISOString().slice(0, 10)}`;
        const seen = await storage.getItem<boolean>(key, false);
        if (!seen) setNudge(h.on_this_day[0]);
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dismissAffection = async () => {
    if (incoming) await api(`/affection/${incoming.affection_id}/seen`, { method: "POST" });
    setIncoming(null);
  };
  const sendBack = async () => {
    const to = incoming?.from_member_id;
    await dismissAffection();
    if (to) router.push(`/affection/send?member=${to}`);
  };

  const dismissNudge = async () => {
    const key = `otdNudge:${new Date().toISOString().slice(0, 10)}`;
    await storage.setItem(key, true);
    setNudge(null);
  };
  const openNudge = async () => {
    const tid = nudge?.timeline_id;
    await dismissNudge();
    if (tid) router.push(`/timeline/${tid}`);
  };

  const openStatusEditor = () => {
    const me = home?.me;
    setStatusKey(me?.status || null);
    setStatusNote(me?.status_note || "");
    setStatusOpen(true);
  };

  const saveStatus = async (clear = false) => {
    const me = home?.me;
    if (!me) return;
    setSavingStatus(true);
    try {
      const opt = clear ? null : statusFor(statusKey);
      await api(`/families/members/${me.member_id}/status`, {
        method: "PATCH",
        body: clear
          ? { status: null, status_emoji: null, status_label: null, status_note: null }
          : {
              status: statusKey,
              status_emoji: opt?.emoji || null,
              status_label: opt?.label || null,
              status_note: statusNote.trim() || null,
            },
      });
      setStatusOpen(false);
      await load();
    } catch {}
    setSavingStatus(false);
  };

  const toggleChore = async (choreId: string, wasDone: boolean) => {
    // optimistic update
    setHome((prev: any) => {
      if (!prev) return prev;
      const kids = (prev.kids || []).map((k: any) => {
        const chores = (k.chores || []).map((ch: any) =>
          ch.chore_id === choreId ? { ...ch, done_today: !wasDone } : ch
        );
        return { ...k, chores, done: chores.filter((x: any) => x.done_today).length };
      });
      return { ...prev, kids };
    });
    if (!wasDone) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCelebrating(true);
    }
    try {
      await api(`/chores/${choreId}/${wasDone ? "uncomplete" : "complete"}`, { method: "POST" });
    } catch {
      load();
    }
  };

  const me = home?.me;
  const persona = personaOf(me);
  const compact = !!prefs.compact;
  const order = useMemo(() => {
    if (!home) return [];
    let o = applyPrefs(ORDER[persona], prefs);
    // Auto-pin the Emergency card to the top when something needs attention.
    const urgent = (home.active_sos?.length || 0) > 0 || (home.vault_expiring?.length || 0) > 0;
    if (urgent) o = ["emergency", ...o.filter((k) => k !== "emergency")];
    return o;
  }, [home, persona, prefs]);

  const filteredTasks = useMemo(() => {
    const all = home?.tasks || [];
    if (persona === "child") return all.filter((t: any) => t.scope === "mine");
    if (taskFilter === "family") return all;
    return all.filter((t: any) => t.scope === taskFilter);
  }, [home, taskFilter, persona]);

  const openChat = useCallback(async () => {
    let id = familyChatId;
    if (!id) {
      try {
        const chats = await api<any[]>("/chats");
        id = chats.find((ch) => ch.type === "family")?.chat_id || null;
      } catch {}
    }
    if (id) router.push(`/chat/${id}?name=${encodeURIComponent("Family Chat")}` as any);
    else router.push("/(tabs)/chat" as any);
  }, [familyChatId, router]);

  const go = (r: string) => {
    if (r === "/(tabs)/chat") {
      openChat();
      return;
    }
    router.push(r as any);
  };

  // Kids Mode: a child's account gets a simplified, friendly home.
  if (home && persona === "child") {
    return (
      <KidsHome
        home={home}
        incoming={incoming}
        onDismissAffection={dismissAffection}
        onSendBack={sendBack}
        onToggleChore={toggleChore}
        celebrating={celebrating}
        onCelebrateDone={() => setCelebrating(false)}
      />
    );
  }
  // Grandparent / Simple Home: opt-in large-button layout.
  if (home && simpleHome) {
    return (
      <SimpleHome home={home} incoming={incoming} onDismissAffection={dismissAffection} onSendBack={sendBack} />
    );
  }

  const renderSection = (key: string) => {
    const p = { compact, c, go, router };
    switch (key) {
      case "attention":
        return <AttentionSection {...p} items={home?.needs_attention || []} />;
      case "today":
        return <TodaySection {...p} events={home?.events_today || []} />;
      case "tasks":
        return <TasksSection {...p} tasks={filteredTasks} filter={taskFilter} setFilter={setTaskFilter} />;
      case "mytasks":
        return <MyTasksSection {...p} tasks={filteredTasks} />;
      case "kids":
        return <KidsSection {...p} kids={home?.kids || []} onToggleChore={toggleChore} />;
      case "mychores":
        return <MyChoresSection {...p} kids={home?.kids || []} me={me} onToggleChore={toggleChore} />;
      case "meals":
        return <MealsSection {...p} meals={home?.meals_today || []} />;
      case "shopping":
        return <ShoppingSection {...p} preview={home?.shopping_preview || []} count={home?.shopping_pending || 0} />;
      case "comingup":
        return <ComingUpSection {...p} items={home?.coming_up || []} />;
      case "noticeboard":
        return <NoticeboardSection {...p} notices={home?.notices || []} fam={home?.family_chat} unread={home?.unread_messages || 0} />;
      case "memory":
        return <MemorySection {...p} item={(home?.on_this_day || [])[0]} />;
      case "wishlist":
        return <WishlistSection {...p} data={home?.wishlist_reminder} />;
      case "important":
        return <VaultSection {...p} items={home?.vault_expiring || []} />;
      case "emergency":
        return <EmergencySection {...p} activeSos={home?.active_sos || []} expiring={home?.vault_expiring || []} />;
      case "recap":
        return <EveningRecapSection {...p} summary={home?.today_summary} />;
      case "brief":
        return <BriefSection {...p} home={home} />;
      case "latest":
        return <LatestPostSection {...p} post={home?.latest_post} />;
      case "quick":
        return <QuickActions {...p} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        {nudge ? (
          <Pressable onPress={openNudge} style={styles.nudgeWrap} testID="otd-nudge">
            <LinearGradient colors={["#FFE7B3", "#FFD166"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nudge}>
              <AppText size={22}>🌅</AppText>
              <View style={{ flex: 1 }}>
                <AppText family="display" weight="bold" size={14} color="#2C2C28" numberOfLines={2}>
                  On this day {nudge.years_ago > 0 ? `${nudge.years_ago} year${nudge.years_ago > 1 ? "s" : ""} ago` : "today"}: {nudge.title}
                </AppText>
                <AppText size={12} color="rgba(44,44,40,0.72)">Tap to relive this memory ✨</AppText>
              </View>
              <Pressable onPress={dismissNudge} hitSlop={12} testID="otd-nudge-dismiss">
                <Ionicons name="close" size={18} color="#2C2C28" />
              </Pressable>
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <AppText size={13} color={c.onSurfaceTertiary}>{formatDate(new Date().toISOString(), "dddd, D MMMM")}</AppText>
            <AppText family="display" weight="bold" size={22}>
              {greeting()}, {me?.name || "Friend"}
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary}>{home?.family?.name}</AppText>
          </View>
          <HeaderIcon icon="search" onPress={() => go("/search")} c={c} testID="home-search" label="Search" />
          <HeaderIcon icon="options-outline" onPress={() => go("/dashboard/customize")} c={c} testID="home-customize" label="Customize dashboard" />
          <HeaderIcon icon="notifications-outline" onPress={() => go("/notifications")} c={c} badge={notifUnread} testID="home-notifications" label="Notifications" />
          <Pressable onPress={() => me && go(`/member/${me.member_id}`)} testID="home-avatar" style={{ marginLeft: 2 }} accessibilityRole="button" accessibilityLabel="Your profile">
            <Avatar uri={me?.photo_url} name={me?.name} size={44} color={me?.color} ring />
          </Pressable>
        </View>

        <StatusStrip members={home?.members || []} me={me} router={router} onEditMine={openStatusEditor} c={c} />

        {home ? order.map((k) => <React.Fragment key={k}>{renderSection(k)}</React.Fragment>) : null}
      </ScrollView>

      {celebrating ? <StarBurst onDone={() => setCelebrating(false)} /> : null}

      {incoming ? (
        <AffectionAnimation
          visible={!!incoming}
          type={incoming.type}
          title={`${incoming.from?.name} sent you ${AFFECTION_MAP[incoming.type]?.label || "love"} ${AFFECTION_MAP[incoming.type]?.emoji || "❤️"}`}
          subtitle={incoming.message}
          onDismiss={dismissAffection}
          onSendBack={sendBack}
        />
      ) : null}

      {/* status editor modal */}
      <Modal visible={statusOpen} transparent animationType="slide" onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setStatusOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <AppText family="display" weight="bold" size={18} style={{ marginBottom: 4 }}>Set your status</AppText>
          <AppText size={13} color={c.onSurfaceTertiary} style={{ marginBottom: spacing.md }}>
            Let your family know where you are — no location shared.
          </AppText>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => {
              const active = statusKey === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setStatusKey(s.key)}
                  style={[styles.statusOpt, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}
                  testID={`status-opt-${s.key}`}
                >
                  <AppText size={18}>{s.emoji}</AppText>
                  <AppText size={12} weight="semibold" color={active ? "#fff" : c.onSurfaceSecondary}>{s.label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={statusNote}
            onChangeText={setStatusNote}
            placeholder="Add a note (optional) e.g. Back by 6"
            placeholderTextColor={c.onSurfaceTertiary}
            style={[styles.noteInput, { backgroundColor: c.surfaceSecondary, color: c.onSurface, borderColor: c.border }]}
            testID="status-note"
          />
          <Pressable
            onPress={() => saveStatus(false)}
            disabled={!statusKey || savingStatus}
            style={[styles.saveBtn, { backgroundColor: statusKey ? c.brand : c.surfaceTertiary }]}
            testID="status-save"
          >
            <AppText size={15} weight="bold" color="#fff">{savingStatus ? "Saving…" : "Set status"}</AppText>
          </Pressable>
          {me?.status ? (
            <Pressable onPress={() => saveStatus(true)} style={styles.clearBtn} testID="status-clear">
              <AppText size={14} weight="semibold" color={c.onSurfaceTertiary}>Clear status</AppText>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ===========================================================================
// Building blocks
// ===========================================================================
function SectionShell({ compact, children }: any) {
  return <View style={{ paddingHorizontal: spacing.lg, marginTop: compact ? spacing.sm : spacing.md }}>{children}</View>;
}

function HeaderIcon({ icon, onPress, c, badge, testID, label }: any) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.headerIcon, { backgroundColor: c.surface, borderColor: c.border }]} testID={testID} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={19} color={c.onSurface} />
      {badge ? (
        <View style={[styles.iconBadge, { backgroundColor: c.brand, borderColor: c.surface }]}>
          <AppText size={9} weight="bold" color="#fff">{badge > 9 ? "9+" : badge}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionHead({ title, action, onAction, c }: any) {
  return (
    <View style={styles.secHead}>
      <AppText family="display" weight="bold" size={18}>{title}</AppText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText size={13} weight="semibold" color={c.brand}>{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Card({ children, c, style }: any) {
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1), style]}>{children}</View>;
}

function StatusStrip({ members, me, router, onEditMine, c }: any) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusStrip}>
      {members.map((m: any) => {
        const isMe = me && m.member_id === me.member_id;
        const st = statusFor(m.status);
        return (
          <Pressable
            key={m.member_id}
            onPress={() => (isMe ? onEditMine() : router.push(`/member/${m.member_id}`))}
            style={styles.statusCard}
            testID={isMe ? "status-mine" : `status-${m.member_id}`}
          >
            <View>
              <Avatar uri={m.photo_url} name={m.name} size={54} color={m.color} ring />
              <View style={[styles.statusDot, { backgroundColor: st ? c.surface : c.surfaceTertiary, borderColor: c.surfaceSecondary }]}>
                <AppText size={13}>{st?.emoji || (isMe ? "＋" : "·")}</AppText>
              </View>
            </View>
            <AppText size={12} weight="semibold" numberOfLines={1} style={{ marginTop: 4, maxWidth: 66 }}>{m.name}</AppText>
            <AppText size={10} color={c.onSurfaceTertiary} numberOfLines={1} style={{ maxWidth: 66 }}>
              {st?.label || (isMe ? "Set status" : "—")}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AttentionSection({ items, go, c, compact }: any) {
  if (!items.length) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Needs your attention" c={c} />
      <View style={{ gap: spacing.sm }}>
        {items.map((it: any) => {
          const color = TONE_MAP[it.tone] || c.brand;
          return (
            <Pressable key={it.key} onPress={() => go(it.route)} testID={`attn-${it.key}`}>
              <Card c={c} style={styles.attnRow}>
                <View style={[styles.attnIcon, { backgroundColor: color + "22" }]}>
                  <Ionicons name={it.icon} size={20} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="bold" numberOfLines={2}>{it.title}</AppText>
                  {it.subtitle ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{it.subtitle}</AppText> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </SectionShell>
  );
}

function TodaySection({ events, go, c, compact }: any) {
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Today at a glance" action="Calendar" onAction={() => go("/(tabs)/calendar")} c={c} />
      <Card c={c}>
        {events.length ? (
          <View style={{ gap: spacing.md }}>
            {events.slice(0, compact ? 2 : 4).map((e: any) => (
              <Pressable key={e.event_id} style={styles.eventRow} onPress={() => go("/(tabs)/calendar")}>
                <View style={[styles.eventBar, { backgroundColor: e.color || c.brand }]} />
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="semibold" numberOfLines={2}>{e.title}</AppText>
                  {e.location ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{e.location}</AppText> : null}
                </View>
                <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>{e.all_day ? "All day" : e.start_time || ""}</AppText>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyRow}>
            <AppText size={22}>☀️</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>Nothing scheduled today — enjoy the calm.</AppText>
          </View>
        )}
      </Card>
    </SectionShell>
  );
}

function TasksSection({ tasks, filter, setFilter, go, c, compact }: any) {
  const filters: any[] = [
    { k: "family", label: "All" },
    { k: "mine", label: "Mine" },
    { k: "kids", label: "Kids" },
  ];
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Family tasks" action="All lists" onAction={() => go("/todos")} c={c} />
      <View style={styles.chipRow}>
        {filters.map((f) => (
          <Pressable
            key={f.k}
            onPress={() => setFilter(f.k)}
            style={[styles.chip, { backgroundColor: filter === f.k ? c.brand : c.surface, borderColor: filter === f.k ? c.brand : c.border }]}
            testID={`task-filter-${f.k}`}
          >
            <AppText size={12} weight="bold" color={filter === f.k ? "#fff" : c.onSurfaceSecondary}>{f.label}</AppText>
          </Pressable>
        ))}
      </View>
      <Card c={c}>
        {tasks.length ? (
          <View style={{ gap: spacing.md }}>
            {tasks.slice(0, compact ? 3 : 5).map((t: any) => (
              <Pressable key={t.item_id} style={styles.taskRow} onPress={() => go("/todos")}>
                <Ionicons name="ellipse-outline" size={18} color={t.overdue ? c.error : c.onSurfaceTertiary} />
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="semibold" numberOfLines={1}>{t.title}</AppText>
                  <AppText size={11} color={t.overdue ? c.error : c.onSurfaceTertiary} numberOfLines={1}>
                    {t.assignee ? t.assignee.name : t.list_name || "Family"}
                    {t.due_date ? ` · ${t.overdue ? "overdue" : t.days_until_due === 0 ? "due today" : formatDate(t.due_date, "D MMM")}` : ""}
                  </AppText>
                </View>
                {t.priority === "high" ? <View style={[styles.pri, { backgroundColor: c.error }]} /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <AppText size={13} color={c.onSurfaceTertiary}>No open tasks here 🎉</AppText>
        )}
      </Card>
    </SectionShell>
  );
}

function MyTasksSection({ tasks, go, c, compact }: any) {
  if (!tasks.length) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="My tasks" action="Open" onAction={() => go("/todos")} c={c} />
      <Card c={c}>
        <View style={{ gap: spacing.md }}>
          {tasks.slice(0, 4).map((t: any) => (
            <Pressable key={t.item_id} style={styles.taskRow} onPress={() => go("/todos")}>
              <Ionicons name="ellipse-outline" size={18} color={c.onSurfaceTertiary} />
              <AppText size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{t.title}</AppText>
            </Pressable>
          ))}
        </View>
      </Card>
    </SectionShell>
  );
}

function KidsSection({ kids, go, router, onToggleChore, c, compact }: any) {
  if (!kids.length) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Kids & chores" action="Manage" onAction={() => go("/chores")} c={c} />
      <View style={{ gap: spacing.sm }}>
        {kids.map((k: any) => {
          const pct = k.total ? Math.round((k.done / k.total) * 100) : 0;
          const allDone = k.total > 0 && k.done === k.total;
          return (
            <Card key={k.member.member_id} c={c}>
              <View style={styles.kidRow}>
                <Avatar uri={k.member.photo_url} name={k.member.name} size={44} color={k.member.color} />
                <View style={{ flex: 1 }}>
                  <View style={styles.kidTop}>
                    <View style={styles.kidNameRow}>
                      <AppText size={14} weight="bold">{k.member.name}</AppText>
                      {k.streak >= 3 ? (
                        <View style={[styles.streakPill, { backgroundColor: c.brandTertiary }]}>
                          <AppText size={11} weight="bold" color={c.brand}>{k.streak_badge?.emoji || "🔥"} {k.streak}</AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText size={12} weight="semibold" color={allDone ? c.success : c.onSurfaceTertiary}>
                      {k.total ? `${k.done}/${k.total} chores` : "No chores"}
                    </AppText>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: c.surfaceTertiary }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: allDone ? c.success : k.member.color }]} />
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push(`/affection/send?member=${k.member.member_id}`)}
                  style={[styles.praiseBtn, { backgroundColor: c.brandTertiary }]}
                  testID={`praise-${k.member.member_id}`}
                >
                  <AppText size={16}>{allDone ? "⭐" : "🤗"}</AppText>
                </Pressable>
              </View>
              {!compact && k.chores?.length ? (
                <View style={styles.choreChips}>
                  {k.chores.map((ch: any) => (
                    <Pressable
                      key={ch.chore_id}
                      onPress={() => onToggleChore(ch.chore_id, ch.done_today)}
                      style={[styles.choreChip, { backgroundColor: ch.done_today ? c.success : c.surfaceSecondary, borderColor: ch.done_today ? c.success : c.border }]}
                      testID={`home-chore-${ch.chore_id}`}
                    >
                      <Ionicons name={ch.done_today ? "checkmark-circle" : "ellipse-outline"} size={14} color={ch.done_today ? "#fff" : c.onSurfaceTertiary} />
                      <AppText size={12} weight="semibold" color={ch.done_today ? "#fff" : c.onSurfaceSecondary}>{ch.title}</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
    </SectionShell>
  );
}

function MyChoresSection({ kids, me, go, onToggleChore, c, compact }: any) {
  const mine = kids.find((k: any) => k.member.member_id === me?.member_id);
  if (!mine) return null;
  const allDone = mine.total > 0 && mine.done === mine.total;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="My chores" action="All" onAction={() => go("/chores")} c={c} />
      <Card c={c}>
        <View style={styles.kidTop}>
          <View style={styles.kidNameRow}>
            <AppText size={15} weight="bold">{allDone ? "All done — amazing! ⭐" : `${mine.done} of ${mine.total} done`}</AppText>
            {mine.streak >= 3 ? (
              <View style={[styles.streakPill, { backgroundColor: c.brandTertiary }]}>
                <AppText size={11} weight="bold" color={c.brand}>{mine.streak_badge?.emoji || "🔥"} {mine.streak} day streak</AppText>
              </View>
            ) : null}
          </View>
          <AppText size={22}>{allDone ? "🌟" : "💪"}</AppText>
        </View>
        {mine.chores?.length ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {mine.chores.map((ch: any) => (
              <Pressable key={ch.chore_id} style={styles.myChoreRow} onPress={() => onToggleChore(ch.chore_id, ch.done_today)} testID={`home-chore-${ch.chore_id}`}>
                <Ionicons name={ch.done_today ? "checkmark-circle" : "ellipse-outline"} size={24} color={ch.done_today ? c.success : c.onSurfaceTertiary} />
                <AppText
                  size={14}
                  weight="semibold"
                  style={[{ flex: 1 }, ch.done_today && { textDecorationLine: "line-through" }]}
                  color={ch.done_today ? c.onSurfaceTertiary : c.onSurface}
                >
                  {ch.title}
                </AppText>
                <AppText size={12} weight="bold" color={c.warning}>+{ch.stars}⭐</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>
    </SectionShell>
  );
}

function MealsSection({ meals, go, c, compact }: any) {
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Today's meals" action="Planner" onAction={() => go("/meals")} c={c} />
      <Pressable onPress={() => go("/meals")}>
        <Card c={c}>
          {meals.length ? (
            <View style={{ gap: spacing.md }}>
              {meals.map((m: any) => (
                <View key={m.slot} style={styles.mealRow}>
                  {m.recipe.photo_url ? (
                    <SmartImage uri={m.recipe.photo_url} style={styles.mealImg} />
                  ) : (
                    <View style={[styles.mealImg, { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
                      <AppText size={20}>🍽️</AppText>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AppText size={11} weight="bold" color={c.brand} style={{ textTransform: "capitalize" }}>{m.slot}</AppText>
                    <AppText size={14} weight="semibold" numberOfLines={1}>{m.recipe.title}</AppText>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyRow}>
              <AppText size={22}>🍽️</AppText>
              <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>No meals planned for today — tap to plan.</AppText>
            </View>
          )}
        </Card>
      </Pressable>
    </SectionShell>
  );
}

function ShoppingSection({ preview, count, go, c, compact }: any) {
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Shopping" action="Open lists" onAction={() => go("/shopping")} c={c} />
      <Pressable onPress={() => go("/shopping")}>
        <Card c={c}>
          {count ? (
            <>
              <AppText size={14} weight="bold" style={{ marginBottom: spacing.sm }}>{count} item{count > 1 ? "s" : ""} to buy</AppText>
              <View style={styles.wrapRow}>
                {preview.map((p: any, i: number) => (
                  <View key={i} style={[styles.shopChip, { backgroundColor: c.surfaceSecondary }]}>
                    <AppText size={12} weight="semibold" color={c.onSurfaceSecondary}>{p.name}{p.quantity ? ` · ${p.quantity}` : ""}</AppText>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.emptyRow}>
              <AppText size={22}>🛒</AppText>
              <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>Shopping lists are all clear.</AppText>
            </View>
          )}
        </Card>
      </Pressable>
    </SectionShell>
  );
}

function ComingUpSection({ items, router, go, c, compact }: any) {
  if (!items.length) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Coming up" action="Calendar" onAction={() => go("/(tabs)/calendar")} c={c} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: 2 }}>
        {items.map((it: any, i: number) => {
          const isBday = it.kind === "birthday";
          const when = it.days === 0 ? "Today" : it.days === 1 ? "Tomorrow" : `In ${it.days} days`;
          return (
            <Pressable
              key={i}
              onPress={() => (isBday ? router.push(`/birthday/${it.member.member_id}`) : go("/(tabs)/calendar"))}
              style={[styles.comeCard, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
              testID={`comeup-${i}`}
            >
              <View style={[styles.comeIcon, { backgroundColor: (isBday ? c.brand : it.color || c.info) + "22" }]}>
                <AppText size={20}>{isBday ? "🎂" : "📅"}</AppText>
              </View>
              <AppText size={13} weight="bold" numberOfLines={2} style={{ marginTop: spacing.sm }}>{it.title}</AppText>
              <AppText size={11} color={c.onSurfaceTertiary} style={{ marginTop: 2 }}>{when}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </SectionShell>
  );
}

function NoticeboardSection({ notices, fam, unread, router, go, c, compact }: any) {
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Family noticeboard" action="Open board" onAction={() => go("/notice")} c={c} />
      {notices.length ? (
        <View style={{ gap: spacing.sm }}>
          {notices.map((n: any) => (
            <Pressable key={n.notice_id} onPress={() => router.push(`/notice/${n.notice_id}`)} testID={`home-notice-${n.notice_id}`}>
              <Card c={c} style={styles.noticeRow}>
                <Ionicons name={n.pinned ? "pin" : "reader-outline"} size={18} color={n.pinned ? c.brand : c.onSurfaceTertiary} />
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="bold" numberOfLines={1}>{n.title}</AppText>
                  {n.note ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{n.note}</AppText> : null}
                </View>
                {n.photo_url ? <SmartImage uri={n.photo_url} style={styles.noticeThumb} /> : null}
                {n.reply_count ? (
                  <View style={styles.noticeMeta}>
                    <Ionicons name="chatbubble-outline" size={13} color={c.onSurfaceTertiary} />
                    <AppText size={11} color={c.onSurfaceTertiary}>{n.reply_count}</AppText>
                  </View>
                ) : null}
                {n.priority === "high" ? <View style={[styles.dotUrgent, { backgroundColor: c.error }]} /> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable onPress={() => go("/notice")} testID="home-notice-empty">
          <Card c={c} style={styles.emptyRow}>
            <AppText size={22}>📌</AppText>
            <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>No notes yet — pin one for the family.</AppText>
          </Card>
        </Pressable>
      )}
      {fam ? (
        <Pressable onPress={() => router.push(`/chat/${fam.chat_id}`)} style={{ marginTop: spacing.sm }} testID="home-noticeboard">
          <Card c={c} style={styles.msgRow}>
            <View style={[styles.msgIcon, { backgroundColor: c.brandTertiary }]}>
              <Ionicons name="chatbubbles" size={18} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={14} weight="bold">Family Chat</AppText>
              <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>
                {fam.last_message ? `${fam.last_message.sender}: ${fam.last_message.text || "New message"}` : "Say hello to the family 👋"}
              </AppText>
            </View>
            {unread ? (
              <View style={[styles.msgBadge, { backgroundColor: c.brand }]}>
                <AppText size={11} weight="bold" color="#fff">{unread > 9 ? "9+" : unread}</AppText>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
            )}
          </Card>
        </Pressable>
      ) : null}
    </SectionShell>
  );
}

function MemorySection({ item, router, go, c, compact }: any) {
  if (!item) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Memory of the day" action="Family Story" onAction={() => go("/timeline")} c={c} />
      <Pressable onPress={() => router.push(`/timeline/${item.timeline_id}`)} testID="home-memory">
        <View style={[styles.memCard, { borderColor: c.border }, shadow(1)]}>
          {item.media?.[0] ? (
            <SmartImage uri={item.media[0].url} style={styles.memImg} />
          ) : (
            <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.memImg}>
              <AppText size={40}>📖</AppText>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.memOverlay}>
            <AppText size={11} weight="bold" color="#FFD9D9">
              {item.years_ago > 0 ? `${item.years_ago} year${item.years_ago > 1 ? "s" : ""} ago today` : "Today"}
            </AppText>
            <AppText family="display" weight="bold" size={16} color="#fff" numberOfLines={2}>{item.title}</AppText>
          </LinearGradient>
        </View>
      </Pressable>
    </SectionShell>
  );
}

function WishlistSection({ data, router, c, compact }: any) {
  if (!data) return null;
  const when = data.days === 0 ? "today" : `in ${data.days} day${data.days > 1 ? "s" : ""}`;
  return (
    <SectionShell compact={compact}>
      <SectionHead title={`${data.member.name}'s wishlist`} c={c} />
      <Card c={c}>
        <View style={styles.wishTop}>
          <AppText size={22}>🎁</AppText>
          <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>Birthday {when} — a few gift ideas</AppText>
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {data.wishes.map((w: any) => (
            <Pressable key={w.wish_id} style={styles.wishRow} onPress={() => router.push(`/wishlist/item/${w.wish_id}`)} testID={`home-wish-${w.wish_id}`}>
              {w.photo_url ? (
                <SmartImage uri={w.photo_url} style={styles.wishImg} />
              ) : (
                <View style={[styles.wishImg, { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
                  <AppText size={16}>🎀</AppText>
                </View>
              )}
              <AppText size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{w.name}</AppText>
              {w.is_reserved ? (
                <View style={[styles.reservedTag, { backgroundColor: c.surfaceTertiary }]}>
                  <AppText size={10} weight="bold" color={c.onSurfaceTertiary}>Reserved</AppText>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={c.onSurfaceTertiary} />
              )}
            </Pressable>
          ))}
        </View>
      </Card>
    </SectionShell>
  );
}

function VaultSection({ items, go, c, compact }: any) {
  if (!items.length) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Important information" action="Vault" onAction={() => go("/vault")} c={c} />
      <Card c={c}>
        <View style={{ gap: spacing.md }}>
          {items.map((v: any) => {
            const urgent = v.days_until_expiry <= 14;
            return (
              <Pressable key={v.item_id} style={styles.vaultRow} onPress={() => go("/vault")}>
                <Ionicons name={v.kind === "insurance" ? "shield-checkmark" : "document-text"} size={18} color={urgent ? c.error : c.warning} />
                <AppText size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{v.title}</AppText>
                <AppText size={12} weight="bold" color={urgent ? c.error : c.onSurfaceSecondary}>
                  {v.days_until_expiry === 0 ? "Today" : `${v.days_until_expiry}d`}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </SectionShell>
  );
}

function EmergencySection({ go, c, compact, activeSos = [], expiring = [] }: any) {
  const sos = activeSos.length > 0;
  const expCount = expiring.length;
  const urgent = sos || expCount > 0;
  const subtitle = sos
    ? `🚨 ${activeSos[0]?.member_name || "Someone"} needs help${activeSos[0]?.blood_group ? ` · Blood ${activeSos[0].blood_group}` : ""} — tap to respond`
    : expCount > 0
    ? `${expCount} document${expCount > 1 ? "s" : ""} expiring soon — review now`
    : "Contacts, medical cards & Family SOS";
  return (
    <SectionShell compact={compact}>
      <Pressable onPress={() => go("/emergency")} testID="home-emergency">
        <Card c={c} style={[styles.emergRow, urgent && { borderColor: "#E86A6A", borderWidth: 1.5 }]}>
          <View style={[styles.emergIcon, { backgroundColor: urgent ? "#E86A6A" : "#E86A6A22" }]}>
            <Ionicons name={sos ? "warning" : "medkit"} size={20} color={urgent ? "#fff" : "#E86A6A"} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={14} weight="bold" color={urgent ? "#C74B4B" : c.onSurface}>
              {sos ? "Active SOS" : expCount > 0 ? "Emergency Center" : "Emergency Center"}
            </AppText>
            <AppText size={12} color={urgent ? "#C74B4B" : c.onSurfaceTertiary} numberOfLines={2}>{subtitle}</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
        </Card>
      </Pressable>
    </SectionShell>
  );
}

function EveningRecapSection({ summary, go, c, compact }: any) {
  if (!summary) return null;
  if (new Date().getHours() < 18) return null;
  const items = [
    { emoji: "📅", n: summary.events, label: "events" },
    { emoji: "🧹", n: `${summary.chores_done}/${summary.chores_total}`, label: "chores done" },
    { emoji: "🤗", n: summary.loves_today, label: "love shared" },
  ];
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Evening recap 🌙" c={c} />
      <View style={[styles.recapCard, { borderColor: c.border }, shadow(1)]}>
        <LinearGradient colors={["#3A3A5A", "#2C2C44"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.briefRow}>
          {items.map((s) => (
            <View key={s.label} style={styles.briefItem}>
              <AppText size={20}>{s.emoji}</AppText>
              <AppText family="display" weight="bold" size={17} color="#fff">{s.n}</AppText>
              <AppText size={11} color="rgba(255,255,255,0.7)">{s.label}</AppText>
            </View>
          ))}
        </View>
        <AppText size={13} color="rgba(255,255,255,0.85)" style={{ marginTop: spacing.md }}>Anything worth remembering from today?</AppText>
        <Pressable onPress={() => go("/timeline/create")} style={[styles.recapBtn, { backgroundColor: "#fff" }]} testID="recap-save-moment">
          <Ionicons name="sparkles" size={15} color="#2C2C44" />
          <AppText size={13} weight="bold" color="#2C2C44">{"Save today's best moment"}</AppText>
        </Pressable>
      </View>
    </SectionShell>
  );
}

function BriefSection({ home, c, compact }: any) {
  const stats = [
    { emoji: "📅", n: (home?.events_today || []).length, label: "events" },
    { emoji: "✅", n: (home?.tasks || []).length, label: "tasks" },
    { emoji: "🧹", n: home?.pending_chores || 0, label: "chores" },
    { emoji: "🛒", n: home?.shopping_pending || 0, label: "to buy" },
    { emoji: "💬", n: home?.unread_messages || 0, label: "unread" },
  ];
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Daily brief" c={c} />
      <Card c={c}>
        <View style={styles.briefRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.briefItem}>
              <AppText size={20}>{s.emoji}</AppText>
              <AppText family="display" weight="bold" size={18}>{s.n}</AppText>
              <AppText size={11} color={c.onSurfaceTertiary}>{s.label}</AppText>
            </View>
          ))}
        </View>
      </Card>
    </SectionShell>
  );
}

function LatestPostSection({ post, router, c, compact }: any) {
  if (!post) return null;
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Latest post" c={c} />
      <Pressable onPress={() => router.push(`/post/${post.post_id}`)} testID="home-latest-post">
        <Card c={c} style={styles.latestRow}>
          {post.media?.[0] ? (
            <SmartImage uri={post.media[0].url} style={styles.latestImg} />
          ) : (
            <View style={[styles.latestImg, { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}>
              <AppText size={20}>📝</AppText>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText size={13} weight="bold">{post.author?.name}</AppText>
            <AppText size={12} color={c.onSurfaceSecondary} numberOfLines={2}>{post.caption || "Shared a photo"}</AppText>
          </View>
        </Card>
      </Pressable>
    </SectionShell>
  );
}

function QuickActions({ go, c, compact }: any) {
  return (
    <SectionShell compact={compact}>
      <SectionHead title="Quick actions" c={c} />
      <View style={styles.quickWrap}>
        {QUICK.map((q) => (
          <Pressable
            key={q.key}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              go(q.route);
            }}
            style={[styles.quickTile, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
            testID={`quick-${q.key}`}
          >
            <AppText size={22}>{q.emoji}</AppText>
            <AppText size={12} weight="semibold" color={c.onSurface} style={{ marginTop: 4 }}>{q.label}</AppText>
          </Pressable>
        ))}
      </View>
    </SectionShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nudgeWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nudge: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, ...shadow(1) },

  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 6 },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  iconBadge: { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },

  statusStrip: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  statusCard: { alignItems: "center", width: 70 },
  statusDot: { position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2 },

  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },

  attnRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  attnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  eventBar: { width: 4, height: 34, borderRadius: 2 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },

  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pri: { width: 8, height: 8, borderRadius: 4 },

  kidRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  kidTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  kidNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  streakPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  praiseBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  choreChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  choreChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1 },
  myChoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  mealRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mealImg: { width: 52, height: 52, borderRadius: radius.md },

  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  shopChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },

  comeCard: { width: 140, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  comeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  noticeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  noticeThumb: { width: 40, height: 40, borderRadius: radius.sm },
  noticeMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  dotUrgent: { width: 10, height: 10, borderRadius: 5 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  msgIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  msgBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },

  memCard: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1 },
  memImg: { width: "100%", height: 170, alignItems: "center", justifyContent: "center", backgroundColor: "#EAE4D9" },
  memOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: 2 },

  wishTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  wishRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  wishImg: { width: 40, height: 40, borderRadius: radius.sm },
  reservedTag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },

  vaultRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  emergRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  emergIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  recapCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, overflow: "hidden" },
  recapBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, paddingVertical: 12, marginTop: spacing.md },

  briefRow: { flexDirection: "row", justifyContent: "space-between" },
  briefItem: { alignItems: "center", gap: 2, flex: 1 },

  latestRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  latestImg: { width: 52, height: 52, borderRadius: radius.md },

  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickTile: { width: "31.5%", aspectRatio: 1.15, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D6CEBE", marginBottom: spacing.md },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusOpt: { width: "31.5%", borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, alignItems: "center", gap: 4 },
  noteInput: { marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 },
  saveBtn: { marginTop: spacing.md, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  clearBtn: { marginTop: spacing.sm, paddingVertical: 10, alignItems: "center" },
});
