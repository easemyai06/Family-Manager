import React, { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { formatDMY } from "@/src/lib/time";

export type HandoverNote = {
  handover_id: string;
  by: "parent" | "helper";
  author_name?: string;
  text: string;
  date?: string;
  created_at?: string;
};

function clock(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

type Props = {
  title: string;
  notes: HandoverNote[];
  mine: "parent" | "helper";
  composerLabel: string;
  placeholder: string;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
};

export function HelperHandoverView({ title, notes, mine, composerLabel, placeholder, onBack, onSend }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText("");
    } catch {}
    setSending(false);
  };

  // group notes by date
  const groups: { date: string; items: HandoverNote[] }[] = [];
  for (const n of notes) {
    const key = n.date || (n.created_at || "").slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.date === key) last.items.push(n);
    else groups.push({ date: key, items: [n] });
  }

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Pressable onPress={onBack} hitSlop={12} testID="handover-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={16} numberOfLines={1}>Handover Notes</AppText>
          <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{title}</AppText>
        </View>
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg }} showsVerticalScrollIndicator={false}>
          <View style={[styles.intro, { backgroundColor: c.brandTertiary }]}>
            <AppText size={13} color={c.onBrandTertiary} style={{ lineHeight: 19 }}>
              📋 A daily log between the family and helper — instructions in the morning, updates at the end of the day.
            </AppText>
          </View>

          {groups.length === 0 ? (
            <View style={styles.empty}>
              <AppText size={40}>📝</AppText>
              <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
                No handover notes yet.
              </AppText>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.date} style={{ marginBottom: spacing.md }}>
                <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ marginBottom: spacing.sm, letterSpacing: 0.5 }}>
                  {formatDMY(g.date).toUpperCase()}
                </AppText>
                {g.items.map((n) => {
                  const isParent = n.by === "parent";
                  return (
                    <View
                      key={n.handover_id}
                      style={[styles.note, { backgroundColor: c.surface, borderColor: c.border, borderLeftColor: isParent ? c.brandPrimary : c.success, borderLeftWidth: 4 }, shadow(1)]}
                      testID={`handover-${n.handover_id}`}
                    >
                      <View style={styles.noteHead}>
                        <View style={[styles.byPill, { backgroundColor: (isParent ? c.brandPrimary : c.success) + "1e" }]}>
                          <AppText size={11} weight="bold" color={isParent ? c.brandPrimary : c.success}>
                            {isParent ? "Family" : "Helper"}
                          </AppText>
                        </View>
                        <AppText size={12} color={c.onSurfaceTertiary}>{n.author_name} · {clock(n.created_at)}</AppText>
                      </View>
                      <AppText size={15} color={c.onSurface} style={{ lineHeight: 21, marginTop: 4 }}>{n.text}</AppText>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + spacing.sm }]}>
          <AppText size={12} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: 6 }}>{composerLabel}</AppText>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
            <View style={[styles.inputWrap, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={c.onSurfaceTertiary}
                style={{ flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 8, maxHeight: 120 }}
                multiline
                testID="handover-input"
              />
            </View>
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brandPrimary : c.border }]}
              testID="handover-send"
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  intro: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  note: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  noteHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  byPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  inputBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", ...shadow(1) },
});
