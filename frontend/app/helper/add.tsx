import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { Avatar } from "@/src/components/ui/Avatar";
import { DateField, TimeField } from "@/src/components/ui/DateTimeField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function AddHelper() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [roles, setRoles] = useState<any[]>([]);
  const [permMeta, setPermMeta] = useState<{ key: string; label: string }[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [name, setName] = useState("");
  const [role, setRole] = useState("house_help");
  const [assignedAll, setAssignedAll] = useState(true);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [accessMode, setAccessMode] = useState<"permanent" | "dates" | "temporary">("permanent");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<"invite" | "direct">("invite");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const applyRoleDefaults = useCallback((rk: string, rolesList: any[]) => {
    const r = rolesList.find((x) => x.key === rk);
    const def = new Set<string>(r?.perms || []);
    const next: Record<string, boolean> = {};
    PERMISSION_ORDER.forEach((k) => (next[k] = def.has(k)));
    next.tasks = true;
    setPerms(next);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [rd, fam] = await Promise.all([api("/helpers/roles"), api("/families/me")]);
        setRoles(rd.roles || []);
        setPermMeta(rd.permissions || []);
        setMembers(fam.members || []);
        applyRoleDefaults("house_help", rd.roles || []);
      } catch {}
    })();
  }, [applyRoleDefaults]);

  const pickRole = (rk: string) => {
    setRole(rk);
    applyRoleDefaults(rk, roles);
    const r = roles.find((x) => x.key === rk);
    if (r?.temporary && accessMode === "permanent") setAccessMode("temporary");
  };

  const toggleMember = (id: string) => {
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const create = async () => {
    setError("");
    if (!name.trim()) {
      setError("Please enter the helper's name");
      return;
    }
    if (!assignedAll && assigned.length === 0) {
      setError("Choose who they help (or select the whole household)");
      return;
    }
    if (loginMode === "direct" && (!/^[a-z0-9_.]{3,20}$/.test(username.trim().toLowerCase()) || pin.trim().length < 4)) {
      setError("Enter a valid username (3–20) and a 4–6 digit PIN");
      return;
    }
    setBusy(true);
    try {
      const body: any = {
        name: name.trim(), role, assigned_all: assignedAll,
        assigned_member_ids: assignedAll ? [] : assigned,
        permissions: perms,
        access: {
          mode: accessMode,
          start_date: accessMode === "permanent" ? null : startDate,
          end_date: accessMode === "permanent" ? null : endDate,
          days, start_time: startTime, end_time: endTime,
        },
      };
      if (loginMode === "direct") {
        body.username = username.trim().toLowerCase();
        body.pin = pin.trim();
      }
      const res = await api("/helpers", { method: "POST", body });
      if (res.invite_code) {
        setResult(res);
      } else {
        router.replace(`/helper/${res.helper.helper_id}`);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't add helper");
    }
    setBusy(false);
  };

  if (result) {
    return (
      <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
        <View style={styles.successWrap}>
          <View style={[styles.badge, { backgroundColor: c.success + "22" }]}>
            <Ionicons name="checkmark-circle" size={40} color={c.success} />
          </View>
          <AppText family="display" weight="bold" size={22} center style={{ marginTop: spacing.lg }}>
            {result.helper.name} is invited!
          </AppText>
          <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginTop: spacing.sm, lineHeight: 20 }}>
            Share this code with them. They'll open the app, tap “I'm a helper”, enter the code and set their own PIN.
          </AppText>
          <View style={[styles.codeBox, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            <AppText family="display" weight="bold" size={30} center style={{ letterSpacing: 4 }} testID="invite-code">
              {result.invite_code}
            </AppText>
          </View>
          {result.invite_link ? (
            <AppText size={12} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
              {result.invite_link}
            </AppText>
          ) : null}
          <Button label="Done" onPress={() => router.replace(`/helper/${result.helper.helper_id}`)} testID="invite-done" style={{ marginTop: spacing.xl, alignSelf: "stretch" }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="add-helper-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>Add a Helper</AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} bottomOffset={20}>
        <TextField label="Helper's name" icon="person-outline" value={name} onChangeText={setName} placeholder="e.g. Sunita" testID="helper-name" />

        <Label c={c}>Their role</Label>
        <View style={styles.roleGrid}>
          {roles.map((r) => {
            const sel = role === r.key;
            return (
              <Pressable key={r.key} onPress={() => pickRole(r.key)} style={[styles.roleChip, { borderColor: sel ? c.brandPrimary : c.border, backgroundColor: sel ? c.brandTertiary : c.surface }]} testID={`role-${r.key}`}>
                <AppText size={18}>{r.icon}</AppText>
                <AppText size={12} weight={sel ? "bold" : "medium"} color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>{r.label}</AppText>
              </Pressable>
            );
          })}
        </View>

        <Label c={c}>Who do they help?</Label>
        <Pressable onPress={() => setAssignedAll(true)} style={[styles.optRow, { borderColor: assignedAll ? c.brandPrimary : c.border, backgroundColor: assignedAll ? c.brandTertiary : c.surface }]} testID="assign-all">
          <Ionicons name={assignedAll ? "radio-button-on" : "radio-button-off"} size={20} color={assignedAll ? c.brandPrimary : c.onSurfaceTertiary} />
          <AppText size={15} weight="semibold" color={assignedAll ? c.onBrandTertiary : c.onSurface}>The whole household</AppText>
        </Pressable>
        <Pressable onPress={() => setAssignedAll(false)} style={[styles.optRow, { borderColor: !assignedAll ? c.brandPrimary : c.border, backgroundColor: !assignedAll ? c.brandTertiary : c.surface }]} testID="assign-select">
          <Ionicons name={!assignedAll ? "radio-button-on" : "radio-button-off"} size={20} color={!assignedAll ? c.brandPrimary : c.onSurfaceTertiary} />
          <AppText size={15} weight="semibold" color={!assignedAll ? c.onBrandTertiary : c.onSurface}>Specific people</AppText>
        </Pressable>
        {!assignedAll ? (
          <View style={styles.memberRow}>
            {members.map((m) => {
              const sel = assigned.includes(m.member_id);
              return (
                <Pressable key={m.member_id} onPress={() => toggleMember(m.member_id)} style={styles.memberChip} testID={`assign-${m.member_id}`}>
                  <View style={[sel && { borderWidth: 2, borderColor: c.brandPrimary, borderRadius: 30 }]}>
                    <Avatar name={m.name} uri={m.photo_url} size={52} color={m.color} />
                  </View>
                  <AppText size={12} weight={sel ? "bold" : "regular"} color={sel ? c.onSurface : c.onSurfaceSecondary}>{m.name}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Label c={c}>Access period</Label>
        <View style={styles.segRow}>
          {(["permanent", "dates", "temporary"] as const).map((mode) => {
            const sel = accessMode === mode;
            return (
              <Pressable key={mode} onPress={() => setAccessMode(mode)} style={[styles.seg, { backgroundColor: sel ? c.brandPrimary : c.surface, borderColor: sel ? c.brandPrimary : c.border }]} testID={`access-${mode}`}>
                <AppText size={13} weight="bold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {mode === "permanent" ? "Permanent" : mode === "dates" ? "Date range" : "Temporary"}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {accessMode !== "permanent" ? (
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <DateField label="Start date" value={startDate} onChange={setStartDate} placeholder="Select start date" testID="access-start-date" />
            <DateField label="End date (access ends after this)" value={endDate} onChange={setEndDate} placeholder="Select end date" testID="access-end-date" />
          </View>
        ) : null}

        <Label c={c}>Working days & hours (optional)</Label>
        <View style={styles.daysRow}>
          {DAYS.map((d, i) => {
            const sel = days.includes(i);
            return (
              <Pressable key={i} onPress={() => toggleDay(i)} style={[styles.dayBtn, { backgroundColor: sel ? c.brandPrimary : c.surface, borderColor: sel ? c.brandPrimary : c.border }]} testID={`day-${i}`}>
                <AppText size={13} weight="bold" color={sel ? "#fff" : c.onSurfaceSecondary}>{d}</AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}><TimeField label="From" value={startTime} onChange={setStartTime} testID="work-start" /></View>
          <View style={{ flex: 1 }}><TimeField label="To" value={endTime} onChange={setEndTime} testID="work-end" /></View>
        </View>

        <Label c={c}>What they can access</Label>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {permMeta.map((p, i) => {
            const on = !!perms[p.key];
            const locked = p.key === "tasks";
            return (
              <Pressable key={p.key} disabled={locked} onPress={() => setPerms((prev) => ({ ...prev, [p.key]: !prev[p.key] }))} style={[styles.permRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} testID={`perm-${p.key}`}>
                <AppText size={14} color={c.onSurface} style={{ flex: 1 }}>{p.label}</AppText>
                {locked ? (
                  <View style={[styles.pill, { backgroundColor: c.success + "22" }]}>
                    <AppText size={11} weight="bold" color={c.success}>Always</AppText>
                  </View>
                ) : (
                  <View style={[styles.toggle, { backgroundColor: on ? c.brandPrimary : c.surfaceTertiary }]}>
                    <AppText size={11} weight="bold" color={on ? "#fff" : c.onSurfaceTertiary}>{on ? "✓ Allow" : "Deny"}</AppText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Label c={c}>How they sign in</Label>
        <View style={styles.segRow}>
          <Pressable onPress={() => setLoginMode("invite")} style={[styles.seg, { backgroundColor: loginMode === "invite" ? c.brandPrimary : c.surface, borderColor: loginMode === "invite" ? c.brandPrimary : c.border }]} testID="login-invite">
            <AppText size={13} weight="bold" color={loginMode === "invite" ? "#fff" : c.onSurfaceSecondary}>Send invite code</AppText>
          </Pressable>
          <Pressable onPress={() => setLoginMode("direct")} style={[styles.seg, { backgroundColor: loginMode === "direct" ? c.brandPrimary : c.surface, borderColor: loginMode === "direct" ? c.brandPrimary : c.border }]} testID="login-direct">
            <AppText size={13} weight="bold" color={loginMode === "direct" ? "#fff" : c.onSurfaceSecondary}>Set username & PIN</AppText>
          </Pressable>
        </View>
        {loginMode === "direct" ? (
          <View style={{ marginTop: spacing.sm }}>
            <TextField label="Username" icon="at-outline" value={username} onChangeText={setUsername} placeholder="e.g. sunita_n" autoCapitalize="none" testID="direct-username" />
            <TextField label="PIN (4–6 digits)" icon="lock-closed-outline" value={pin} onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••" keyboardType="number-pad" isPassword testID="direct-pin" />
          </View>
        ) : null}

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.md }} testID="add-helper-error">{error}</AppText>
        ) : null}

        <Button label={busy ? "Adding…" : "Add helper"} onPress={create} loading={busy} disabled={busy} testID="add-helper-submit" style={{ marginTop: spacing.xl }} />
        <View style={{ height: spacing.xl }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const PERMISSION_ORDER = [
  "tasks", "calendar", "child_schedule", "meals", "shopping", "emergency_contacts",
  "medical", "documents", "location", "chat", "home_instructions", "pickup_drop",
];

function Label({ children, c }: { children: React.ReactNode; c: any }) {
  return (
    <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm }}>
      {String(children).toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roleChip: { width: "31%", borderRadius: radius.md, borderWidth: 1.5, paddingVertical: spacing.md, alignItems: "center", gap: 4 },
  optRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.sm },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  memberChip: { alignItems: "center", gap: 4, width: 64 },
  segRow: { flexDirection: "row", gap: spacing.sm },
  seg: { flex: 1, borderRadius: radius.pill, borderWidth: 1.5, paddingVertical: 10, alignItems: "center" },
  daysRow: { flexDirection: "row", gap: 6, justifyContent: "space-between" },
  dayBtn: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, paddingVertical: 10, alignItems: "center" },
  card: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg },
  permRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  toggle: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, minWidth: 72, alignItems: "center" },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  codeBox: { alignSelf: "stretch", borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.lg, marginTop: spacing.xl },
});
