import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { TextField } from "@/src/components/ui/TextField";
import { AffectionAnimation } from "@/src/components/AffectionAnimation";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { AFFECTIONS, AFFECTION_MAP } from "@/src/lib/constants";
import { useAuth } from "@/src/auth/AuthContext";

export default function SendLove() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member: me } = useAuth();
  const params = useLocalSearchParams<{ member?: string }>();
  const [members, setMembers] = useState<any[]>([]);
  const [recipient, setRecipient] = useState<string>(params.member || "family");
  const [type, setType] = useState<string>("hug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{ title: string; subtitle?: string } | null>(null);

  useEffect(() => {
    api("/families/members").then((data: any) => {
      const others = data.filter((m: any) => m.member_id !== me?.member_id);
      setMembers(others);
    });
  }, [me?.member_id]);

  const send = async () => {
    setSending(true);
    try {
      await api("/affection", {
        method: "POST",
        body: { to_member_id: recipient === "family" ? null : recipient, type, message: message || null },
      });
      const info = AFFECTION_MAP[type];
      const name = recipient === "family" ? "the whole family" : members.find((m) => m.member_id === recipient)?.name;
      setSuccess({
        title: `You sent ${info?.label} ${info?.emoji}\nto ${name}`,
        subtitle: message || undefined,
      });
    } catch {
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-send-love">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          Send Some Love ❤️
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        {/* who */}
        <AppText family="display" weight="bold" size={15} style={{ marginBottom: spacing.md }}>
          Who's it for?
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: 4 }}>
          <Pressable onPress={() => setRecipient("family")} style={styles.whoItem} testID="recipient-family">
            <View style={[styles.familyCircle, { backgroundColor: recipient === "family" ? c.brand : c.surfaceSecondary, borderColor: recipient === "family" ? c.brand : c.border }]}>
              <AppText size={26}>👨‍👩‍👧‍👦</AppText>
            </View>
            <AppText size={12} weight={recipient === "family" ? "bold" : "medium"}>
              Everyone
            </AppText>
          </Pressable>
          {members.map((m) => {
            const sel = recipient === m.member_id;
            return (
              <Pressable key={m.member_id} onPress={() => setRecipient(m.member_id)} style={styles.whoItem} testID={`recipient-${m.member_id}`}>
                <View style={[styles.avatarSel, sel && { borderColor: c.brand, borderWidth: 3 }]}>
                  <Avatar uri={m.photo_url} name={m.name} size={sel ? 58 : 60} color={m.color} ring={!sel} />
                </View>
                <AppText size={12} weight={sel ? "bold" : "medium"} numberOfLines={1} style={{ maxWidth: 70 }}>
                  {m.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* type */}
        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
          Send a…
        </AppText>
        <View style={styles.typeGrid}>
          {AFFECTIONS.map((a) => {
            const sel = type === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => setType(a.key)}
                style={[styles.typeChip, { backgroundColor: sel ? a.color : c.surfaceSecondary, borderColor: sel ? a.color : c.border }]}
                testID={`affection-type-${a.key}`}
              >
                <AppText size={22}>{a.emoji}</AppText>
                <AppText size={12} weight="semibold" color={sel ? "#fff" : c.onSurfaceSecondary}>
                  {a.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* message */}
        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
          Add a note (optional)
        </AppText>
        <TextField
          placeholder="Big hug before your exam. You'll do great! ❤️"
          value={message}
          onChangeText={setMessage}
          multiline
          style={{ height: 80, textAlignVertical: "top", paddingTop: 8 }}
          testID="affection-message-input"
        />

        <Button label="Send ❤️" onPress={send} loading={sending} style={{ marginTop: spacing.xl }} testID="send-affection-btn" />
      </KeyboardAwareScrollView>

      {success ? (
        <AffectionAnimation
          visible={!!success}
          type={type}
          title={success.title}
          subtitle={success.subtitle}
          onDismiss={() => {
            setSuccess(null);
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  whoItem: { alignItems: "center", gap: 6, width: 76 },
  familyCircle: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  avatarSel: { borderRadius: 40, borderColor: "transparent", borderWidth: 3, padding: 1 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { width: "31%", alignItems: "center", gap: 4, borderRadius: radius.md, paddingVertical: spacing.md, borderWidth: 1.5 },
});
