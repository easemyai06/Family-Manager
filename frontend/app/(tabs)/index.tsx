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
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { greeting, formatDate } from "@/src/lib/time";
import { AFFECTION_MAP } from "@/src/lib/constants";
import { STATUS_OPTIONS, statusFor } from "@/src/lib/statuses";

type Persona = "parent" | "child" | "grandparent";

function personaOf(me: any): Persona {
  if (!me) return "parent";
  const rel = (me.relationship || "").toLowerCase();
  if (me.is_child || me.role === "child") return "child";
  if (/grand|nani|dadi|nana|dada/.test(rel)) return "grandparent";
  return "parent";
}

const ORDER: Record<Persona, string[]> = {
  parent: [
    "attention", "today", "tasks", "kids", "meals", "shopping", "comingup",
    "messages", "memory", "wishlist", "important", "emergency", "brief", "latest", "quick",
  ],
  child: [
    "today", "mychores", "mytasks", "messages", "comingup", "memory", "wishlist", "brief", "latest", "quick",
  ],
  grandparent: [
    "today", "comingup", "messages", "memory", "wishlist", "emergency", "brief", "latest", "quick",
  ],
};

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
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState<any>(null);
  const [nudge, setNudge] = useState<any>(null);
  const [taskFilter, setTaskFilter] = useState<"mine" | "kids" | "family">("family");

  // status editor
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, inbox] = await Promise.all([api("/home"), api("/affection/inbox")]);
      setHome(h);
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

  const me = home?.me;
  const persona = personaOf(me);
  const order = ORDER[persona];

  const tasks = home?.tasks || [];
  const filteredTasks = useMemo(() => {
    const all = home?.tasks || [];
    if (persona === "child") return all.filter((t: any) => t.scope === "mine");
    if (taskFilter === "family") return all;
    return all.filter((t: any) => t.scope === taskFilter);
  }, [home, taskFilter, persona]);

  const go = (r: string) => router.push(r as any);

  // ---- section renderers --------------------------------------------------
  const renderSection = (key: string) => {
    switch (key) {
      case "attention":
        return <AttentionSection key={key} items={home?.needs_attention || []} go={go} c={c} />;
      case "today":
        return <TodaySection key={key} events={home?.events_today || []} go={go} c={c} />;
      case "tasks":
        return (
          <TasksSection
            key={key}
            tasks={filteredTasks}
            total={tasks.length}
            filter={taskFilter}
            setFilter={setTaskFilter}
            go={go}
            c={c}
          />
        );
      case "mytasks":
        return <MyTasksSection key={key} tasks={filteredTasks} go={go} c={c} />;
      case "kids":
        return <KidsSection key={key} kids={home?.kids || []} go={go} router={router} c={c} />;
      case "mychores":
        return <MyChoresSection key={key} kids={home?.kids || []} me={me} go={go} c={c} />;
      case "meals":
        return <MealsSection key={key} meals={home?.meals_today || []} go={go} c={c} />;
      case "shopping":
        return (
          <ShoppingSection key={key} preview={home?.shopping_preview || []} count={home?.shopping_pending || 0} go={go} c={c} />
        );
      case "comingup":
        return <ComingUpSection key={key} items={home?.coming_up || []} router={router} go={go} c={c} />;
      case "messages":
        return <MessagesSection key={key} fam={home?.family_chat} unread={home?.unread_messages || 0} router={router} c={c} />;
      case "memory":
        return <MemorySection key={key} item={(home?.on_this_day || [])[0]} router={router} go={go} c={c} />;
      case "wishlist":
        return <WishlistSection key={key} data={home?.wishlist_reminder} router={router} c={c} />;
      case "important":
        return <VaultSection key={key} items={home?.vault_expiring || []} go={go} c={c} />;
      case "emergency":
        return <EmergencySection key={key} go={go} c={c} />;
      case "brief":
        return <BriefSection key={key} home={home} c={c} />;
      case "latest":
        return <LatestPostSection key={key} post={home?.latest_post} router={router} c={c} />;
      case "quick":
        return <QuickActions key={key} go={go} c={c} />;
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
        {/* On this day nudge */}
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
            <AppText family="display" weight="bold" size={24}>
              {greeting()}, {me?.name || "Friend"}
            </AppText>
            <AppText size={13} color={c.onSurfaceSecondary}>{home?.family?.name}</AppText>
          </View>
          <HeaderIcon icon="search" onPress={() => go("/search")} c={c} testID="home-search" />
          <HeaderIcon icon="chatbubble-ellipses" onPress={() => go("/(tabs)/chat")} c={c} badge={home?.unread_messages} testID="home-chat" />
          <Pressable onPress={() => me && go(`/member/${me.member_id}`)} testID="home-avatar" style={{ marginLeft: 4 }}>
            <Avatar uri={me?.photo_url} name={me?.name} size={46} color={me?.color} ring />
          </Pressable>
        </View>

        {/* Family status strip (always) */}
        <StatusStrip
          members={home?.members || []}
          me={me}
          router={router}
          onEditMine={openStatusEditor}
          c={c}
        />

        {/* Role-ordered dashboard sections */}
        {home ? order.map((k) => renderSection(k)) : null}
      </ScrollView>

      {/* affection overlay */}
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
                  style={[
                    styles.statusOpt,
                    { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border },
                  ]}
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
// Small building blocks
// ===========================================================================
function HeaderIcon({ icon, onPress, c, badge, testID }: any) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.headerIcon, { backgroundColor: c.surface, borderColor: c.border }]} testID={testID}>
      <Ionicons name={icon} size={20} color={c.onSurface} />
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

// ---- Status strip ---------------------------------------------------------
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

// ---- Needs attention ------------------------------------------------------
function AttentionSection({ items, go, c }: any) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
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
                  <AppText size={14} weight="bold" numberOfLines={1}>{it.title}</AppText>
                  {it.subtitle ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{it.subtitle}</AppText> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---- Today at a glance -----------------------------------------------------
function TodaySection({ events, go, c }: any) {
  return (
    <View style={styles.section}>
      <SectionHead title="Today at a glance" action="Calendar" onAction={() => go("/(tabs)/calendar")} c={c} />
      <Card c={c}>
        {events.length ? (
          <View style={{ gap: spacing.md }}>
            {events.slice(0, 4).map((e: any) => (
              <Pressable key={e.event_id} style={styles.eventRow} onPress={() => go("/(tabs)/calendar")}>
                <View style={[styles.eventBar, { backgroundColor: e.color || c.brand }]} />
                <View style={{ flex: 1 }}>
                  <AppText size={14} weight="semibold" numberOfLines={1}>{e.title}</AppText>
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
    </View>
  );
}

// ---- Tasks (parent) --------------------------------------------------------
function TasksSection({ tasks, total, filter, setFilter, go, c }: any) {
  const filters: any[] = [
    { k: "family", label: "All" },
    { k: "mine", label: "Mine" },
    { k: "kids", label: "Kids" },
  ];
  return (
    <View style={styles.section}>
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
            {tasks.slice(0, 5).map((t: any) => (
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
    </View>
  );
}

// ---- My tasks (child) ------------------------------------------------------
function MyTasksSection({ tasks, go, c }: any) {
  if (!tasks.length) return null;
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Kids & chores (parent) ------------------------------------------------
function KidsSection({ kids, go, router, c }: any) {
  if (!kids.length) return null;
  return (
    <View style={styles.section}>
      <SectionHead title="Kids & chores" action="Manage" onAction={() => go("/chores")} c={c} />
      <View style={{ gap: spacing.sm }}>
        {kids.map((k: any) => {
          const pct = k.total ? Math.round((k.done / k.total) * 100) : 0;
          const allDone = k.total > 0 && k.done === k.total;
          return (
            <Card key={k.member.member_id} c={c} style={styles.kidRow}>
              <Avatar uri={k.member.photo_url} name={k.member.name} size={44} color={k.member.color} />
              <View style={{ flex: 1 }}>
                <View style={styles.kidTop}>
                  <AppText size={14} weight="bold">{k.member.name}</AppText>
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
            </Card>
          );
        })}
      </View>
    </View>
  );
}

// ---- My chores (child) -----------------------------------------------------
function MyChoresSection({ kids, me, go, c }: any) {
  const mine = kids.find((k: any) => k.member.member_id === me?.member_id);
  if (!mine) return null;
  const pct = mine.total ? Math.round((mine.done / mine.total) * 100) : 0;
  const allDone = mine.total > 0 && mine.done === mine.total;
  return (
    <View style={styles.section}>
      <SectionHead title="My chores" action="Open" onAction={() => go("/chores")} c={c} />
      <Pressable onPress={() => go("/chores")}>
        <Card c={c}>
          <View style={styles.kidTop}>
            <AppText size={15} weight="bold">{allDone ? "All done — amazing! ⭐" : `${mine.done} of ${mine.total} done`}</AppText>
            <AppText size={22}>{allDone ? "🌟" : "💪"}</AppText>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: c.surfaceTertiary, marginTop: spacing.sm }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: allDone ? c.success : c.brand }]} />
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

// ---- Meals -----------------------------------------------------------------
function MealsSection({ meals, go, c }: any) {
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Shopping --------------------------------------------------------------
function ShoppingSection({ preview, count, go, c }: any) {
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Coming up -------------------------------------------------------------
function ComingUpSection({ items, router, go, c }: any) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Messages peek ---------------------------------------------------------
function MessagesSection({ fam, unread, router, c }: any) {
  if (!fam) return null;
  const last = fam.last_message;
  return (
    <View style={styles.section}>
      <SectionHead title="Family noticeboard" c={c} />
      <Pressable onPress={() => router.push(`/chat/${fam.chat_id}`)} testID="home-noticeboard">
        <Card c={c}>
          {fam.pinned ? (
            <View style={[styles.pinRow, { borderColor: c.border }]}>
              <Ionicons name="pin" size={15} color={c.brand} />
              <AppText size={13} weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                {fam.pinned.text}
              </AppText>
            </View>
          ) : null}
          <View style={styles.msgRow}>
            <View style={[styles.msgIcon, { backgroundColor: c.brandTertiary }]}>
              <Ionicons name="chatbubbles" size={18} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={14} weight="bold">Family Chat</AppText>
              <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>
                {last ? `${last.sender}: ${last.text || "New message"}` : "Say hello to the family 👋"}
              </AppText>
            </View>
            {unread ? (
              <View style={[styles.msgBadge, { backgroundColor: c.brand }]}>
                <AppText size={11} weight="bold" color="#fff">{unread > 9 ? "9+" : unread}</AppText>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
            )}
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

// ---- Memory of the day -----------------------------------------------------
function MemorySection({ item, router, go, c }: any) {
  if (!item) return null;
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Wishlist reminder -----------------------------------------------------
function WishlistSection({ data, router, c }: any) {
  if (!data) return null;
  const when = data.days === 0 ? "today" : `in ${data.days} day${data.days > 1 ? "s" : ""}`;
  return (
    <View style={styles.section}>
      <SectionHead title={`${data.member.name}'s wishlist`} c={c} />
      <Card c={c}>
        <View style={styles.wishTop}>
          <AppText size={22}>🎁</AppText>
          <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
            Birthday {when} — a few gift ideas
          </AppText>
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
    </View>
  );
}

// ---- Important info (vault) ------------------------------------------------
function VaultSection({ items, go, c }: any) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Emergency quick access ------------------------------------------------
function EmergencySection({ go, c }: any) {
  return (
    <View style={styles.section}>
      <Pressable onPress={() => go("/emergency")} testID="home-emergency">
        <Card c={c} style={styles.emergRow}>
          <View style={[styles.emergIcon, { backgroundColor: "#E86A6A22" }]}>
            <Ionicons name="medkit" size={20} color="#E86A6A" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={14} weight="bold">Emergency Center</AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>Contacts, medical cards & Family SOS</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
        </Card>
      </Pressable>
    </View>
  );
}

// ---- Daily brief -----------------------------------------------------------
function BriefSection({ home, c }: any) {
  const stats = [
    { emoji: "📅", n: (home?.events_today || []).length, label: "events" },
    { emoji: "✅", n: (home?.tasks || []).length, label: "tasks" },
    { emoji: "🧹", n: home?.pending_chores || 0, label: "chores" },
    { emoji: "🛒", n: home?.shopping_pending || 0, label: "to buy" },
    { emoji: "💬", n: home?.unread_messages || 0, label: "unread" },
  ];
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Latest post peek ------------------------------------------------------
function LatestPostSection({ post, router, c }: any) {
  if (!post) return null;
  return (
    <View style={styles.section}>
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
    </View>
  );
}

// ---- Quick actions ---------------------------------------------------------
function QuickActions({ go, c }: any) {
  return (
    <View style={styles.section}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nudgeWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nudge: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, ...shadow(1) },

  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  iconBadge: { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },

  statusStrip: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  statusCard: { alignItems: "center", width: 70 },
  statusDot: { position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2 },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },

  attnRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  attnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  eventRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  eventBar: { width: 4, height: 34, borderRadius: 2 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pri: { width: 8, height: 8, borderRadius: 4 },

  kidRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  kidTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  praiseBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  mealRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mealImg: { width: 52, height: 52, borderRadius: radius.md },

  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  shopChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },

  comeCard: { width: 140, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  comeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  pinRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md, marginBottom: spacing.md, borderBottomWidth: 1 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
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

  briefRow: { flexDirection: "row", justifyContent: "space-between" },
  briefItem: { alignItems: "center", gap: 2, flex: 1 },

  latestRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  latestImg: { width: 52, height: 52, borderRadius: radius.md },

  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickTile: { width: "31.5%", aspectRatio: 1.15, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // status modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D6CEBE", marginBottom: spacing.md },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusOpt: { width: "31.5%", borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, alignItems: "center", gap: 4 },
  noteInput: { marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14 },
  saveBtn: { marginTop: spacing.md, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  clearBtn: { marginTop: spacing.sm, paddingVertical: 10, alignItems: "center" },
});
