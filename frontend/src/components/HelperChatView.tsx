import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";

export type HelperMsg = {
  message_id: string;
  sender: "parent" | "helper";
  sender_name?: string;
  sender_photo?: string | null;
  text?: string | null;
  photo_url?: string | null;
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
  subtitle?: string;
  avatarUri?: string | null;
  messages: HelperMsg[];
  mine: "parent" | "helper";
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  disabledHint?: string;
};

export function HelperChatView({ title, subtitle, avatarUri, messages, mine, onBack, onSend, disabled, disabledHint }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try {
      await onSend(t);
    } catch {
      setText(t);
    }
    setSending(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Pressable onPress={onBack} hitSlop={12} testID="hchat-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <Avatar name={title} uri={avatarUri || undefined} size={38} />
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={16} numberOfLines={1}>{title}</AppText>
          {subtitle ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.privacy, { backgroundColor: c.brandTertiary }]}>
            <Ionicons name="lock-closed" size={13} color={c.onBrandTertiary} />
            <AppText size={12} color={c.onBrandTertiary} style={{ flex: 1 }}>
              Private conversation. The family chat can't see these messages.
            </AppText>
          </View>

          {messages.length === 0 ? (
            <View style={styles.empty}>
              <AppText size={40}>💬</AppText>
              <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
                No messages yet. Say hello!
              </AppText>
            </View>
          ) : (
            messages.map((m) => {
              const isMine = m.sender === mine;
              return (
                <View key={m.message_id} style={[styles.row, { justifyContent: isMine ? "flex-end" : "flex-start" }]} testID={`hmsg-${m.message_id}`}>
                  <View
                    style={[
                      styles.bubble,
                      isMine
                        ? { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 }
                        : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                    ]}
                  >
                    {!isMine ? (
                      <AppText size={11} weight="bold" color={c.brandPrimary} style={{ marginBottom: 2 }}>
                        {m.sender_name || (m.sender === "helper" ? "Helper" : "Family")}
                      </AppText>
                    ) : null}
                    {m.text ? (
                      <AppText size={15} color={isMine ? "#fff" : c.onSurface} style={{ lineHeight: 21 }}>{m.text}</AppText>
                    ) : null}
                    <AppText size={10} color={isMine ? "#ffffffcc" : c.onSurfaceTertiary} style={{ marginTop: 3, alignSelf: "flex-end" }}>
                      {clock(m.created_at)}
                    </AppText>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {disabled ? (
          <View style={[styles.disabledBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + spacing.md }]}>
            <Ionicons name="information-circle-outline" size={16} color={c.onSurfaceTertiary} />
            <AppText size={13} color={c.onSurfaceTertiary} style={{ flex: 1 }}>{disabledHint || "Chat is turned off for this helper."}</AppText>
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + spacing.sm }]}>
            <View style={[styles.inputWrap, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a message…"
                placeholderTextColor={c.onSurfaceTertiary}
                style={{ flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 8, maxHeight: 120 }}
                multiline
                testID="hchat-input"
              />
            </View>
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brandPrimary : c.border }]}
              testID="hchat-send"
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  privacy: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: "row" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", ...shadow(1) },
  disabledBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
});
