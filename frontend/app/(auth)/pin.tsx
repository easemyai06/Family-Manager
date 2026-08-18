import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { useAuth, REMEMBER_KEY, ROSTER_KEY } from "@/src/auth/AuthContext";
import { storage } from "@/src/utils/storage";

type Person = { kind: "user" | "member"; id: string; name: string; photo?: string | null; color?: string };

export default function PinUnlock() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginWithPin, loginWithMemberPin } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const out: Person[] = [];
      try {
        const raw = await storage.getItem<string>(REMEMBER_KEY, "");
        const rem = raw ? JSON.parse(raw as string) : null;
        if (rem?.user_id && rem?.pin_set) {
          out.push({ kind: "user", id: rem.user_id, name: rem.name || "Me", photo: rem.picture, color: undefined });
        }
      } catch {}
      try {
        const raw = await storage.getItem<string>(ROSTER_KEY, "");
        const roster = raw ? JSON.parse(raw as string) : null;
        for (const m of roster?.members || []) {
          out.push({ kind: "member", id: m.member_id, name: m.name, photo: m.photo_url, color: m.color });
        }
      } catch {}
      // de-dupe by id
      const seen = new Set<string>();
      setPeople(out.filter((p) => (seen.has(p.id) ? false : seen.add(p.id))));
      setReady(true);
    })();
  }, []);

  const press = (d: string) => {
    if (busy || pin.length >= 4) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) submit(next);
  };

  const submit = async (value: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (selected.kind === "user") await loginWithPin(selected.id, value);
      else await loginWithMemberPin(selected.id, value);
      // success — auth gate routes into the app
    } catch (e: any) {
      setPin("");
      setError(e?.status === 429 ? "Too many tries. Please wait a little." : "Incorrect PIN. Try again.");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const backspace = () => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (selected ? (setSelected(null), setPin(""), setError("")) : router.back())} hitSlop={12} testID="pin-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
      </View>

      {!selected ? (
        <View style={styles.pickWrap}>
          <AppText family="display" weight="bold" size={26} center>
            Who's this?
          </AppText>
          <AppText size={14} color={c.onSurfaceSecondary} center style={{ marginTop: 6, marginBottom: spacing.xl }}>
            Tap your photo and enter your PIN
          </AppText>
          {ready && people.length === 0 ? (
            <View style={styles.emptyBox}>
              <AppText size={40}>🔒</AppText>
              <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm, paddingHorizontal: spacing.xl, lineHeight: 21 }}>
                No quick sign-ins saved on this device yet. Sign in once and set a PIN to unlock faster next time.
              </AppText>
              <Pressable onPress={() => router.replace("/(auth)/login")} style={{ marginTop: spacing.lg }} testID="pin-use-password">
                <AppText size={15} weight="bold" color={c.brand}>Sign in with email &amp; password</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.grid}>
              {people.map((p) => (
                <Pressable key={p.id} onPress={() => setSelected(p)} style={styles.person} testID={`pin-person-${p.id}`}>
                  <Avatar uri={p.photo} name={p.name} size={72} color={p.color} ring />
                  <AppText size={13} weight="semibold" numberOfLines={1} style={{ marginTop: 6, maxWidth: 84 }}>
                    {p.name}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.pinWrap}>
          <Avatar uri={selected.photo} name={selected.name} size={64} color={selected.color} ring />
          <AppText family="display" weight="bold" size={20} style={{ marginTop: spacing.sm }}>
            Hi {selected.name.split(" ")[0]}
          </AppText>
          <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: 2 }}>
            Enter your PIN
          </AppText>

          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => {
              const filled = i < pin.length;
              return <View key={i} style={[styles.dot, { borderColor: c.border, backgroundColor: filled ? c.brand : "transparent" }]} />;
            })}
          </View>

          {error ? (
            <AppText size={13} color={c.error} style={{ marginTop: spacing.sm }} testID="pin-error">
              {error}
            </AppText>
          ) : null}

          <View style={styles.pad}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Pressable key={d} onPress={() => press(d)} style={[styles.key, { backgroundColor: c.surfaceSecondary }]} testID={`pin-key-${d}`}>
                <AppText size={26} weight="semibold">{d}</AppText>
              </Pressable>
            ))}
            <View style={styles.key} />
            <Pressable onPress={() => press("0")} style={[styles.key, { backgroundColor: c.surfaceSecondary }]} testID="pin-key-0">
              <AppText size={26} weight="semibold">0</AppText>
            </Pressable>
            <Pressable onPress={backspace} style={styles.key} testID="pin-key-back">
              <Ionicons name="backspace-outline" size={26} color={c.onSurface} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pickWrap: { flex: 1, paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xl },
  person: { alignItems: "center", width: 92 },
  emptyBox: { alignItems: "center", marginTop: spacing.xl },
  pinWrap: { flex: 1, alignItems: "center", paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  dots: { flexDirection: "row", gap: 14, marginTop: spacing.xl, minHeight: 20 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg, marginTop: spacing["2xl"], maxWidth: 300 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
});
