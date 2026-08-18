import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, Linking, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";

export type CareMsg = {
  message_id: string;
  sender_type: "parent" | "helper";
  sender_id?: string;
  sender_name?: string;
  sender_role?: string;
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

const COLORS = ["#E07A5F", "#3D8361", "#5B7DB1", "#B5838D", "#C08552", "#6D6875"];
function nameColor(name?: string) {
  if (!name) return COLORS[0];
  let s = 0;
  for (let i = 0; i < name.length; i++) s += name.charCodeAt(i);
  return COLORS[s % COLORS.length];
}

type Props = {
  subtitle?: string;
  messages: CareMsg[];
  myType: "parent" | "helper";
  myId?: string;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
  onSendPhoto?: (uri: string) => Promise<void>;
};

export function CareTeamChatView({ subtitle, messages, myType, myId, onBack, onSend, onSendPhoto }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
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

  const handlePhoto = async (uri: string) => {
    if (!onSendPhoto) return;
    setSending(true);
    try {
      await onSendPhoto(uri);
    } catch {}
    setSending(false);
  };

  const pickCamera = async () => {
    setShowAttach(false);
    const perm = await ImagePicker.getCameraPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestCameraPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    await handlePhoto(res.assets[0].uri);
  };

  const pickGallery = async () => {
    setShowAttach(false);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    await handlePhoto(res.assets[0].uri);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Pressable onPress={onBack} hitSlop={12} testID="careteam-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={[styles.teamIcon, { backgroundColor: c.brandTertiary }]}>
          <AppText size={20}>👥</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={16} numberOfLines={1}>Care Team</AppText>
          {subtitle ? <AppText size={12} color={c.onSurfaceTertiary} numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
          <View style={[styles.privacy, { backgroundColor: c.brandTertiary }]}>
            <Ionicons name="people" size={13} color={c.onBrandTertiary} />
            <AppText size={12} color={c.onBrandTertiary} style={{ flex: 1 }}>
              Shared with parents and your active helpers. The family chat can't see this.
            </AppText>
          </View>

          {messages.length === 0 ? (
            <View style={styles.empty}>
              <AppText size={40}>👋</AppText>
              <AppText size={14} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
                Start coordinating with your care team.
              </AppText>
            </View>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_type === myType && m.sender_id === myId;
              return (
                <View key={m.message_id} style={[styles.row, { justifyContent: isMine ? "flex-end" : "flex-start" }]} testID={`ctmsg-${m.message_id}`}>
                  <View
                    style={[
                      styles.bubble,
                      isMine
                        ? { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 }
                        : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                    ]}
                  >
                    {!isMine ? (
                      <AppText size={11} weight="bold" color={nameColor(m.sender_name)} style={{ marginBottom: 2 }}>
                        {m.sender_name}{m.sender_role ? ` · ${m.sender_role}` : ""}
                      </AppText>
                    ) : null}
                    {m.photo_url ? (
                      <Pressable onPress={() => m.photo_url && Linking.openURL(m.photo_url)} testID={`ctphoto-${m.message_id}`}>
                        <SmartImage uri={m.photo_url} style={[styles.photo, { marginBottom: m.text ? 6 : 2 }]} />
                      </Pressable>
                    ) : null}
                    {m.text ? <AppText size={15} color={isMine ? "#fff" : c.onSurface} style={{ lineHeight: 21 }}>{m.text}</AppText> : null}
                    <AppText size={10} color={isMine ? "#ffffffcc" : c.onSurfaceTertiary} style={{ marginTop: 3, alignSelf: "flex-end" }}>
                      {clock(m.created_at)}
                    </AppText>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + spacing.sm }]}>
          {showAttach ? (
            <View style={[styles.attachSheet, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Pressable onPress={pickCamera} style={styles.attachItem} testID="careteam-camera">
                <Ionicons name="camera" size={20} color={c.brandPrimary} />
                <AppText size={13} weight="semibold" color={c.onSurface}>Take photo</AppText>
              </Pressable>
              <Pressable onPress={pickGallery} style={styles.attachItem} testID="careteam-gallery">
                <Ionicons name="image" size={20} color={c.brandPrimary} />
                <AppText size={13} weight="semibold" color={c.onSurface}>Gallery</AppText>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            {onSendPhoto ? (
              <Pressable onPress={() => setShowAttach((s) => !s)} style={styles.attachBtn} hitSlop={8} testID="careteam-attach">
                <Ionicons name={showAttach ? "close" : "add-circle"} size={28} color={c.brandPrimary} />
              </Pressable>
            ) : null}
            <View style={[styles.inputWrap, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message the care team…"
                placeholderTextColor={c.onSurfaceTertiary}
                style={{ flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 8, maxHeight: 120 }}
                multiline
                onFocus={() => setShowAttach(false)}
                testID="careteam-input"
              />
            </View>
            <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.sendBtn, { backgroundColor: text.trim() ? c.brandPrimary : c.border }]} testID="careteam-send">
              <Ionicons name="send" size={18} color="#fff" />
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
  teamIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  privacy: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: "row" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  photo: { width: 210, height: 210, borderRadius: radius.md },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
  inputBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  attachBtn: { paddingBottom: 8 },
  attachSheet: { flexDirection: "row", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.sm },
  attachItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", ...shadow(1) },
});
