import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput, Platform, Linking, Modal } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import dayjs from "dayjs";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { VoiceMessage } from "@/src/components/VoiceMessage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, fonts, shadow } from "@/src/theme/tokens";
import { api, uploadMedia, uploadDocument, mediaUrl } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { AFFECTIONS, AFFECTION_MAP, MSG_REACTIONS } from "@/src/lib/constants";
import { timeAgo } from "@/src/lib/time";
import { fileIcon, formatFileSize, mapsUrl, staticMapUrl } from "@/src/lib/fileMeta";

const RETENTION_OPTS = [
  { days: 0, label: "Off" },
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];
const LIVE_MINUTES = 15;

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
  const [actionMsg, setActionMsg] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [toast, setToast] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const typingRef = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recTimer = useRef<any>(null);
  const recStart = useRef(0);
  const cancelRef = useRef(false);
  const liveWatch = useRef<any>(null);
  const liveMsgId = useRef<string | null>(null);

  const isParent = me?.role === "admin" || me?.role === "parent";

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadChat();
      loadMsgs();
      const iv = setInterval(() => {
        if (active) loadMsgs();
      }, 3000);
      return () => {
        active = false;
        clearInterval(iv);
        stopLiveWatch();
      };
    }, [loadChat, loadMsgs])
  );

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

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
    setShowAttach(false);
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

  const sendDocument = async () => {
    setShowAttach(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      flash("Sending file…");
      const up = await uploadDocument(a.uri, a.name || "document", a.mimeType || "application/octet-stream");
      const msg = await api(`/chats/${id}/messages`, {
        method: "POST",
        body: {
          type: "file",
          media: [{ url: up.url, type: "document" }],
          file_name: a.name || "document",
          file_size: a.size ?? null,
          file_mime: a.mimeType || null,
        },
      });
      setMessages((prev) => [...prev, msg]);
      setToast("");
    } catch {
      flash("Couldn't send that file");
    }
  };

  // ---- location sharing ----
  const ensureLocation = async () => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) return true;
    }
    if (!perm.canAskAgain) {
      flash("Enable location in Settings to share where you are");
      if (Platform.OS !== "web") Linking.openSettings();
    } else {
      flash("Location access is needed to share your location");
    }
    return false;
  };

  const stopLiveWatch = () => {
    if (liveWatch.current) {
      try {
        liveWatch.current.remove();
      } catch {}
      liveWatch.current = null;
    }
    liveMsgId.current = null;
  };

  const startLiveWatch = async (mid: string, liveUntil: string) => {
    stopLiveWatch();
    liveMsgId.current = mid;
    if (Platform.OS === "web") return; // web can't keep a background watcher
    try {
      liveWatch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 25 },
        (pos) => {
          if (dayjs().isAfter(dayjs(liveUntil)) || liveMsgId.current !== mid) {
            stopLiveWatch();
            return;
          }
          api(`/chats/${id}/messages/${mid}/location`, {
            method: "PATCH",
            body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          }).catch(() => {});
        }
      );
    } catch {}
  };

  const shareLocation = async (live: boolean) => {
    setShowAttach(false);
    if (!(await ensureLocation())) return;
    setLocBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      if (live) {
        const liveUntil = dayjs().add(LIVE_MINUTES, "minute").toISOString();
        const msg = await api(`/chats/${id}/messages`, {
          method: "POST",
          body: { type: "live_location", lat: latitude, lng: longitude, live_until: liveUntil },
        });
        setMessages((prev) => [...prev, msg]);
        startLiveWatch(msg.message_id, liveUntil);
      } else {
        const msg = await api(`/chats/${id}/messages`, {
          method: "POST",
          body: { type: "location", lat: latitude, lng: longitude },
        });
        setMessages((prev) => [...prev, msg]);
      }
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      flash("Couldn't get your location");
    }
    setLocBusy(false);
  };

  const stopSharing = async (msg: any) => {
    stopLiveWatch();
    try {
      await api(`/chats/${id}/messages/${msg.message_id}/stop-live`, { method: "POST" });
      loadMsgs();
    } catch {}
  };

  const setRetention = async (days: number) => {
    try {
      await api(`/chats/${id}/retention`, { method: "PATCH", body: { days: days || null } });
      setChat((prev: any) => (prev ? { ...prev, retention_days: days || null } : prev));
      loadMsgs();
      flash(days ? `Messages now disappear after ${RETENTION_OPTS.find((o) => o.days === days)?.label}` : "Disappearing messages turned off");
    } catch {
      flash("Couldn't update this setting");
    }
  };

  const sendAffection = async (key: string) => {
    setShowAff(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const msg = await api(`/chats/${id}/messages`, { method: "POST", body: { type: "affection", affection_key: key } });
      setMessages((prev) => [...prev, msg]);
    } catch {}
  };

  // ---- voice notes ----
  const ensureMic = async () => {
    let perm = await getRecordingPermissionsAsync();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await requestRecordingPermissionsAsync();
      if (perm.granted) return true;
    }
    if (!perm.canAskAgain) {
      flash("Enable microphone in Settings to send voice notes");
      if (Platform.OS !== "web") Linking.openSettings();
    } else {
      flash("Microphone access is needed for voice notes");
    }
    return false;
  };

  const startRec = async () => {
    cancelRef.current = false;
    try {
      if (!(await ensureMic())) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recStart.current = Date.now();
      setRecMs(0);
      setRecording(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      recTimer.current = setInterval(() => setRecMs(Date.now() - recStart.current), 200);
    } catch (e) {
      flash("Voice recording isn't available here");
    }
  };

  const finishRec = async (cancel: boolean) => {
    if (!recording) return;
    if (recTimer.current) clearInterval(recTimer.current);
    const elapsed = Date.now() - recStart.current;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {}
    const uri = recorder.uri;
    if (cancel || cancelRef.current || elapsed < 700 || !uri) return;
    try {
      const up = await uploadMedia(uri, "audio");
      const msg = await api(`/chats/${id}/messages`, {
        method: "POST",
        body: { type: "voice", media: [{ url: up.url, type: "audio" }], duration: elapsed },
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      flash("Couldn't send the voice note");
    }
  };

  const react = async (msg: any, emoji: string) => {
    setActionMsg(null);
    try {
      await api(`/messages/${msg.message_id}/react`, { method: "POST", body: { emoji } });
      loadMsgs();
    } catch {}
  };

  const pin = async (msg: any) => {
    setActionMsg(null);
    try {
      await api(`/chats/${id}/pin`, { method: "POST", body: { message_id: msg.message_id } });
      loadChat();
    } catch {}
  };

  const unpin = async () => {
    setActionMsg(null);
    try {
      await api(`/chats/${id}/unpin`, { method: "POST" });
      loadChat();
    } catch {}
  };

  const msgPreview = (m: any) =>
    m?.text ||
    (m?.type === "affection"
      ? AFFECTION_MAP[m.affection_key]?.label
      : m?.type === "voice"
        ? "🎤 Voice message"
        : m?.type === "file"
          ? `📄 ${m.file_name || "File"}`
          : m?.type === "live_location"
            ? "📍 Live location"
            : m?.type === "location"
              ? "📍 Location"
              : "📷 Photo");

  const isLiveActive = (m: any) => m?.type === "live_location" && m?.live_until && dayjs().isBefore(dayjs(m.live_until));

  const actionPinned = !!actionMsg && chat?.pinned_message?.message_id === actionMsg?.message_id;

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
    const isVoice = item.type === "voice";
    const isFile = item.type === "file";
    const isLocation = item.type === "location" || item.type === "live_location";
    const hasCoords = item.lat != null && item.lng != null;
    const fi = fileIcon(item.file_name, item.file_mime);
    const reactionEntries = Object.entries(item.reactions || {});
    return (
      <View style={{ marginBottom: reactionEntries.length ? spacing.lg : spacing.md }}>
        <Pressable onLongPress={() => { setActionMsg(item); if (Platform.OS !== "web") Haptics.selectionAsync(); }} delayLongPress={250} style={[styles.msgRow, { justifyContent: mine ? "flex-end" : "flex-start" }]} testID={`msg-${item.message_id}`}>
          {!mine ? <Avatar uri={item.sender?.photo_url} name={item.sender?.name} size={28} color={item.sender?.color} /> : null}
          <View style={{ maxWidth: "78%", alignItems: mine ? "flex-end" : "flex-start" }}>
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
              ) : isVoice && item.media?.[0] ? (
                <VoiceMessage uri={item.media[0].url} duration={item.duration} mine={mine} />
              ) : isLocation ? (
                <Pressable
                  onPress={() => hasCoords && Linking.openURL(mapsUrl(item.lat, item.lng))}
                  style={{ width: 220 }}
                  testID={`loc-${item.message_id}`}
                >
                  {hasCoords ? <SmartImage uri={staticMapUrl(item.lat, item.lng)} style={styles.locMap} /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: hasCoords ? 6 : 0 }}>
                    <Ionicons name="location" size={16} color={mine ? "#fff" : c.brand} />
                    <AppText size={13} weight="bold" color={mine ? "#fff" : c.onSurface}>
                      {item.type === "live_location" ? (isLiveActive(item) ? "Live location" : "Live location ended") : "Location"}
                    </AppText>
                  </View>
                  <AppText size={11} color={mine ? "rgba(255,255,255,0.85)" : c.onSurfaceSecondary}>
                    {isLiveActive(item) ? `Sharing until ${dayjs(item.live_until).format("h:mm A")}` : "Tap to open in Maps"}
                  </AppText>
                  {mine && isLiveActive(item) ? (
                    <Pressable onPress={() => stopSharing(item)} style={[styles.stopBtn, { borderColor: mine ? "rgba(255,255,255,0.6)" : c.error }]} testID={`stop-live-${item.message_id}`}>
                      <AppText size={12} weight="bold" color={mine ? "#fff" : c.error}>
                        Stop sharing
                      </AppText>
                    </Pressable>
                  ) : null}
                </Pressable>
              ) : isFile ? (
                <Pressable
                  onPress={() => {
                    const u = mediaUrl(item.media?.[0]?.url);
                    if (u) Linking.openURL(u);
                  }}
                  style={styles.fileCard}
                  testID={`file-${item.message_id}`}
                >
                  <View style={[styles.fileIcon, { backgroundColor: mine ? "rgba(255,255,255,0.2)" : fi.color + "22" }]}>
                    <Ionicons name={fi.icon as any} size={22} color={mine ? "#fff" : fi.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size={14} weight="semibold" color={mine ? "#fff" : c.onSurface} numberOfLines={2}>
                      {item.file_name || "Document"}
                    </AppText>
                    <AppText size={11} color={mine ? "rgba(255,255,255,0.85)" : c.onSurfaceTertiary}>
                      {formatFileSize(item.file_size) || "Tap to open"}
                    </AppText>
                  </View>
                  <Ionicons name="download-outline" size={18} color={mine ? "#fff" : c.onSurfaceTertiary} />
                </Pressable>
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

            {reactionEntries.length ? (
              <View style={[styles.reactionChips, { flexDirection: mine ? "row-reverse" : "row" }]}>
                {reactionEntries.map(([emoji, count]) => (
                  <View key={emoji} style={[styles.reactionChip, { backgroundColor: c.surface, borderColor: item.my_reaction === emoji ? c.brand : c.border }]}>
                    <AppText size={12}>{emoji}</AppText>
                    {(count as number) > 1 ? (
                      <AppText size={11} weight="bold" color={c.onSurfaceSecondary}>
                        {count as number}
                      </AppText>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

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
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="conv-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        {chat?.type === "direct" ? (
          <Avatar uri={chat?.avatar} name={chat?.display_name} size={38} color={chat?.color} />
        ) : chat?.avatar ? (
          <SmartImage uri={chat.avatar} style={styles.groupAvatar} />
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
        {chat?.type === "group" ? (
          <Pressable onPress={() => router.push(`/chat/manage?id=${id}`)} hitSlop={10} testID="chat-manage-btn">
            <Ionicons name="settings-outline" size={22} color={c.onSurface} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => setShowSettings(true)} hitSlop={10} testID="chat-options-btn" accessibilityRole="button" accessibilityLabel="Chat settings">
          <Ionicons name="ellipsis-vertical" size={22} color={c.onSurface} />
        </Pressable>
      </View>

      {chat?.pinned_message ? (
        <Pressable onPress={unpin} style={[styles.pinBar, { backgroundColor: c.brandTertiary, borderBottomColor: c.border }]} testID="pinned-bar">
          <Ionicons name="pin" size={16} color={c.brand} />
          <View style={{ flex: 1 }}>
            <AppText size={11} weight="bold" color={c.brand}>
              Pinned by {chat.pinned_message.sender?.name || "family"}
            </AppText>
            <AppText size={13} color={c.onSurface} numberOfLines={1}>
              {msgPreview(chat.pinned_message)}
            </AppText>
          </View>
          <Ionicons name="close" size={16} color={c.brand} />
        </Pressable>
      ) : null}

      {chat?.retention_days ? (
        <View style={[styles.retentionBar, { backgroundColor: c.surfaceSecondary, borderBottomColor: c.border }]} testID="retention-bar">
          <Ionicons name="timer-outline" size={14} color={c.onSurfaceTertiary} />
          <AppText size={11} color={c.onSurfaceTertiary}>
            Messages disappear after {RETENTION_OPTS.find((o) => o.days === chat.retention_days)?.label || `${chat.retention_days} days`}
          </AppText>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior="translate-with-padding" keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(m) => m.message_id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md }}
          showsVerticalScrollIndicator={false}
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
                {replyTo.text || (replyTo.type === "affection" ? AFFECTION_MAP[replyTo.affection_key]?.label : replyTo.type === "voice" ? "🎤 Voice message" : "📷 Photo")}
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

        {recording ? (
          <View style={[styles.recBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
            <View style={[styles.recDot, { backgroundColor: c.error }]} />
            <AppText size={15} weight="bold" style={{ flex: 1 }}>
              Recording… {Math.floor(recMs / 1000)}s
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              Release to send
            </AppText>
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom || spacing.md }]}>
            <Pressable onPress={() => setShowAff((s) => !s)} hitSlop={8} testID="toggle-affection">
              <Ionicons name="heart" size={26} color={showAff ? c.brand : c.onSurfaceTertiary} />
            </Pressable>
            <Pressable onPress={() => setShowAttach(true)} hitSlop={8} testID="chat-attach-btn" accessibilityRole="button" accessibilityLabel="Attach a photo, file or location">
              <Ionicons name="add-circle-outline" size={26} color={locBusy ? c.brand : c.onSurfaceTertiary} />
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
            {text.trim() ? (
              <Pressable onPress={send} style={[styles.sendBtn, { backgroundColor: c.brand }]} testID="chat-send-btn" accessibilityRole="button" accessibilityLabel="Send message">
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                onPressIn={startRec}
                onPressOut={() => finishRec(false)}
                delayLongPress={99999}
                style={[styles.sendBtn, { backgroundColor: c.surfaceSecondary }]}
                testID="chat-mic-btn"
                accessibilityRole="button"
                accessibilityLabel="Hold to record a voice message"
              >
                <Ionicons name="mic" size={22} color={c.brand} />
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* long-press action sheet */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActionMsg(null)} testID="action-backdrop">
          <View style={[styles.actionSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }, shadow(3)]}>
            <View style={styles.reactionPicker}>
              {MSG_REACTIONS.map((emoji) => (
                <Pressable key={emoji} onPress={() => actionMsg && react(actionMsg, emoji)} style={styles.pickerEmoji} testID={`msg-react-${emoji}`}>
                  <AppText size={30}>{emoji}</AppText>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => {
                setReplyTo(actionMsg);
                setActionMsg(null);
              }}
              style={[styles.actionBtn, { backgroundColor: c.surfaceSecondary }]}
              testID="action-reply"
            >
              <Ionicons name="arrow-undo" size={18} color={c.onSurface} />
              <AppText size={15} weight="semibold">
                Reply
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => (actionPinned ? unpin() : pin(actionMsg))}
              style={[styles.actionBtn, { backgroundColor: c.surfaceSecondary }]}
              testID="action-pin"
            >
              <Ionicons name={actionPinned ? "remove-circle-outline" : "pin"} size={18} color={c.onSurface} />
              <AppText size={15} weight="semibold">
                {actionPinned ? "Unpin message" : "Pin message"}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* attachment sheet */}
      <Modal visible={showAttach} transparent animationType="fade" onRequestClose={() => setShowAttach(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAttach(false)} testID="attach-backdrop">
          <View style={[styles.actionSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg }, shadow(3)]}>
            <AppText family="display" weight="bold" size={16} center style={{ marginBottom: spacing.sm }}>
              Share with the family
            </AppText>
            <AttachRow icon="image" color="#D98E5A" label="Photo" onPress={sendImage} c={c} testID="attach-photo" />
            <AttachRow icon="document-attach" color="#3A7BD5" label="File (PDF, Word, Excel…)" onPress={sendDocument} c={c} testID="attach-file" />
            <AttachRow icon="navigate" color="#2E9E6B" label="Send current location" onPress={() => shareLocation(false)} c={c} testID="attach-location" />
            <AttachRow icon="pulse" color="#E86A6A" label={`Share live location (${LIVE_MINUTES} min)`} onPress={() => shareLocation(true)} c={c} testID="attach-live" />
          </View>
        </Pressable>
      </Modal>

      {/* chat settings sheet */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)} testID="settings-backdrop">
          <Pressable style={[styles.actionSheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }, shadow(3)]} onPress={() => {}}>
            <AppText family="display" weight="bold" size={17} center>
              Chat settings
            </AppText>

            <View style={styles.settingHead}>
              <Ionicons name="timer-outline" size={18} color={c.onSurface} />
              <View style={{ flex: 1 }}>
                <AppText size={15} weight="semibold">
                  Disappearing messages
                </AppText>
                <AppText size={12} color={c.onSurfaceTertiary}>
                  {isParent ? "Auto-delete old messages for everyone" : "Only a parent can change this"}
                </AppText>
              </View>
            </View>

            <View style={styles.retentionChips}>
              {RETENTION_OPTS.map((o) => {
                const sel = (chat?.retention_days || 0) === o.days;
                return (
                  <Pressable
                    key={o.days}
                    disabled={!isParent}
                    onPress={() => setRetention(o.days)}
                    style={[
                      styles.retChip,
                      { borderColor: sel ? c.brand : c.border, backgroundColor: sel ? c.brandTertiary : c.surfaceSecondary, opacity: !isParent && !sel ? 0.5 : 1 },
                    ]}
                    testID={`retention-opt-${o.days}`}
                  >
                    <AppText size={13} weight={sel ? "bold" : "medium"} color={sel ? c.onBrandTertiary : c.onSurfaceSecondary}>
                      {o.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {chat?.type === "group" ? (
              <Pressable
                onPress={() => {
                  setShowSettings(false);
                  router.push(`/chat/manage?id=${id}`);
                }}
                style={[styles.actionBtn, { backgroundColor: c.surfaceSecondary, marginTop: spacing.sm }]}
                testID="settings-manage-group"
              >
                <Ionicons name="people" size={18} color={c.onSurface} />
                <AppText size={15} weight="semibold">
                  Manage group
                </AppText>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.surfaceInverse, bottom: insets.bottom + 90 }, shadow(3)]} testID="chat-toast">
          <AppText size={13} weight="semibold" color={c.onSurfaceInverse}>
            {toast}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  pinBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  retentionBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 1 },
  groupAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubble: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 60 },
  replyPreview: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  msgImage: { width: 210, height: 210, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  locMap: { width: 220, height: 120, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  stopBtn: { alignSelf: "flex-start", marginTop: 8, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  fileCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 210, paddingVertical: 2 },
  fileIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reactionChips: { position: "absolute", bottom: -14, gap: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  metaRow: { flexDirection: "row", gap: 4, marginTop: 3, paddingHorizontal: 4 },
  typingRow: { paddingHorizontal: spacing.lg, paddingBottom: 4 },
  replyBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1 },
  affRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.md, borderTopWidth: 1 },
  affItem: { padding: 4 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1 },
  recBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1 },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  input: { flex: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.3)" },
  actionSheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  reactionPicker: { flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.sm },
  pickerEmoji: { padding: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md },
  attachRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  attachIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  settingHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  retentionChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  retChip: { borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: 9 },
  toast: { position: "absolute", alignSelf: "center", borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});

function AttachRow({ icon, color, label, onPress, c, testID }: { icon: string; color: string; label: string; onPress: () => void; c: any; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.attachRow} testID={testID} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.attachIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <AppText size={15} weight="semibold" color={c.onSurface}>
        {label}
      </AppText>
    </Pressable>
  );
}
