import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput, Platform, Linking } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, fonts } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { AFFECTIONS, AFFECTION_MAP } from "@/src/lib/constants";
import { timeAgo } from "@/src/lib/time";

export default function Conversation() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member: me } = useAuth();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [showAff, setShowAff] = useState(false);
  const typingRef = useRef(0);

  const loadChat = useCallback(async () => {
    try {
      setChat(await api(`/chats/${id}`));
    } catch {}
  }, [id]);

  const loadMsgs = useCallback(async () => {
    try {
      const d = await api(`/chats/${id}/messages`);
      setMessages(d.messages);
      setReads(d.reads);
      setTyping(d.typing);
      api(`/chats/${id}/read`, { method: "POST" }).catch(() => {});
    } catch {}
  }, [id]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadMsgs();
      const iv = setInterval(() => {
        if (active) loadMsgs();
      }, 3000);
      return () => {
        active = false;
        clearInterval(iv);
      };
    }, [loadMsgs])
  );

  const onType = (t: string) => {
    setText(t);
    const now = Date.now();
    if (now - typingRef.current > 2000) {
      typingRef.current = now;
      api(`/chats/${id}/typing`, { method: "POST" }).catch(() => {});
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    const reply = replyTo;
    setReplyTo(null);
    try {
      const msg = await api(`/chats/${id}/messages`, {
        method: "POST",
        body: { text: body, type: "text", reply_to: reply?.message_id || null },
      });
      setMessages((prev) => [...prev, msg]);
    } catch {}
  };

  const sendImage = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") {
      Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const up = await uploadMedia(result.assets[0].uri, "image");
      const msg = await api(`/chats/${id}/messages`, { method: "POST", body: { type: "image", media: [{ url: up.url, type: "image" }] } });
      setMessages((prev) => [...prev, msg]);
    } catch {}
  };

  const sendAffection = async (key: string) => {
    setShowAff(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const msg = await api(`/chats/${id}/messages`, { method: "POST", body: { type: "affection", affection_key: key } });
      setMessages((prev) => [...prev, msg]);
    } catch {}
  };

  const otherMembers = (chat?.members || []).filter((m: any) => m.member_id !== me?.member_id);
  const lastMineId = [...messages].reverse().find((m) => m.sender_member_id === me?.member_id)?.message_id;

  const seenLabel = (msg: any) => {
    const seenBy = otherMembers.filter((m: any) => reads[m.member_id] && reads[m.member_id] >= msg.created_at);
    if (seenBy.length === 0) return "Sent";
    if (chat?.type === "direct") return "Seen";
    return `Seen by ${seenBy.length}`;
  };

  const renderItem = ({ item }: { item: any }) => {
    const mine = item.sender_member_id === me?.member_id;
    const isAffection = item.type === "affection";
    return (
      <Pressable onLongPress={() => setReplyTo(item)} delayLongPress={250} style={[styles.msgRow, { justifyContent: mine ? "flex-end" : "flex-start" }]} testID={`msg-${item.message_id}`}>
        {!mine ? <Avatar uri={item.sender?.photo_url} name={item.sender?.name} size={28} color={item.sender?.color} /> : null}
        <View style={{ maxWidth: "76%", alignItems: mine ? "flex-end" : "flex-start" }}>
          {!mine && chat?.type !== "direct" ? (
            <AppText size={11} weight="bold" color={item.sender?.color} style={{ marginBottom: 2, marginLeft: 4 }}>
              {item.sender?.name}
            </AppText>
          ) : null}
          <View style={[styles.bubble, { backgroundColor: mine ? c.brand : c.surfaceSecondary, borderBottomRightRadius: mine ? 4 : radius.md, borderBottomLeftRadius: mine ? radius.md : 4 }]}>
            {item.reply_preview ? (
              <View style={[styles.replyPreview, { borderLeftColor: mine ? "rgba(255,255,255,0.6)" : c.brand, backgroundColor: mine ? "rgba(255,255,255,0.15)" : c.surfaceTertiary }]}>
                <AppText size={11} weight="bold" color={mine ? "#fff" : c.brand}>
                  {item.reply_preview.name}
                </AppText>
                <AppText size={12} color={mine ? "rgba(255,255,255,0.85)" : c.onSurfaceSecondary} numberOfLines={1}>
                  {item.reply_preview.text}
                </AppText>
              </View>
            ) : null}

            {isAffection ? (
              <View style={{ alignItems: "center", paddingVertical: 4 }}>
                <AppText size={44}>{AFFECTION_MAP[item.affection_key]?.emoji || "❤️"}</AppText>
                <AppText size={13} weight="bold" color={mine ? "#fff" : c.onSurface}>
                  {AFFECTION_MAP[item.affection_key]?.label}
                </AppText>
                {item.text ? (
                  <AppText size={13} color={mine ? "rgba(255,255,255,0.9)" : c.onSurfaceSecondary} center style={{ marginTop: 2 }}>
                    {item.text}
                  </AppText>
                ) : null}
              </View>
            ) : item.media?.length ? (
              <View>
                <SmartImage uri={item.media[0].url} style={styles.msgImage} />
                {item.text ? (
                  <AppText size={14} color={mine ? "#fff" : c.onSurface} style={{ marginTop: 6 }}>
                    {item.text}
                  </AppText>
                ) : null}
              </View>
            ) : (
              <AppText size={15} color={mine ? "#fff" : c.onSurface} style={{ lineHeight: 20 }}>
                {item.text}
              </AppText>
            )}
          </View>
          <View style={styles.metaRow}>
            <AppText size={10} color={c.onSurfaceTertiary}>
              {timeAgo(item.created_at)}
            </AppText>
            {mine && item.message_id === lastMineId ? (
              <AppText size={10} color={c.onSurfaceTertiary}>
                · {seenLabel(item)}
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="conv-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        {chat?.type === "direct" ? (
          <Avatar uri={chat?.avatar} name={chat?.display_name} size={38} color={chat?.color} />
        ) : (
          <View style={[styles.groupAvatar, { backgroundColor: chat?.color || c.brand }]}>
            <Ionicons name={chat?.type === "family" ? "heart" : "people"} size={18} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={16} numberOfLines={1}>
            {chat?.display_name || name || "Chat"}
          </AppText>
          <AppText size={11} color={c.onSurfaceTertiary}>
            {chat?.type === "direct" ? "Direct message" : `${chat?.members?.length || 0} members`}
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(m) => m.message_id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: spacing.sm }} />}
        />

        {typing.length > 0 ? (
          <View style={styles.typingRow}>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {typing.map((t) => t.name).join(", ")} {typing.length > 1 ? "are" : "is"} typing…
            </AppText>
          </View>
        ) : null}

        {replyTo ? (
          <View style={[styles.replyBar, { backgroundColor: c.surfaceSecondary, borderTopColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <AppText size={12} weight="bold" color={c.brand}>
                Replying to {replyTo.sender?.name}
              </AppText>
              <AppText size={12} color={c.onSurfaceSecondary} numberOfLines={1}>
                {replyTo.text || (replyTo.type === "affection" ? AFFECTION_MAP[replyTo.affection_key]?.label : "📷 Photo")}
              </AppText>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8} testID="cancel-reply">
              <Ionicons name="close" size={20} color={c.onSurfaceTertiary} />
            </Pressable>
          </View>
        ) : null}

        {showAff ? (
          <View style={[styles.affRow, { backgroundColor: c.surfaceSecondary, borderTopColor: c.border }]}>
            {AFFECTIONS.slice(0, 7).map((a) => (
              <Pressable key={a.key} onPress={() => sendAffection(a.key)} style={styles.affItem} testID={`chat-aff-${a.key}`}>
                <AppText size={28}>{a.emoji}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
          <Pressable onPress={() => setShowAff((s) => !s)} hitSlop={8} testID="toggle-affection">
            <Ionicons name="heart" size={26} color={showAff ? c.brand : c.onSurfaceTertiary} />
          </Pressable>
          <Pressable onPress={sendImage} hitSlop={8} testID="chat-image-btn">
            <Ionicons name="image-outline" size={24} color={c.onSurfaceTertiary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={onType}
            placeholder="Message…"
            placeholderTextColor={c.onSurfaceTertiary}
            style={[styles.input, { backgroundColor: c.surfaceSecondary, color: c.onSurface, fontFamily: fonts.textMedium }]}
            multiline
            testID="chat-input"
          />
          <Pressable onPress={send} style={[styles.sendBtn, { backgroundColor: c.brand }]} testID="chat-send-btn">
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  groupAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: spacing.md },
  bubble: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 60 },
  replyPreview: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  msgImage: { width: 210, height: 210, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  metaRow: { flexDirection: "row", gap: 4, marginTop: 3, paddingHorizontal: 4 },
  typingRow: { paddingHorizontal: spacing.lg, paddingBottom: 4 },
  replyBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1 },
  affRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.md, borderTopWidth: 1 },
  affItem: { padding: 4 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
