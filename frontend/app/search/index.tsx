import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, fonts } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function Search() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const ql = q.trim();
    if (!ql) {
      setRes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        setRes(await api(`/search?q=${encodeURIComponent(ql)}`));
      } catch {
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const total = res ? (res.members.length + res.memories.length + res.posts.length + res.chats.length) : 0;

  const SectionTitle = ({ label }: { label: string }) => (
    <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1 }}>
      {label.toUpperCase()}
    </AppText>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top + 6 }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="search-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={[styles.searchBar, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
          <Ionicons name="search" size={18} color={c.onSurfaceTertiary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search people, memories, posts, chats"
            placeholderTextColor={c.onSurfaceTertiary}
            style={[styles.input, { color: c.onSurface, fontFamily: fonts.textMedium }]}
            testID="global-search-input"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8} testID="global-search-clear">
              <Ionicons name="close-circle" size={18} color={c.onSurfaceTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        {!res ? (
          <View style={styles.hint}>
            <AppText size={40}>🔎</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              Search your whole family world
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4 }}>
              Find a person, a memory, a post or a chat
            </AppText>
          </View>
        ) : loading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: spacing["3xl"] }} />
        ) : total === 0 ? (
          <View style={styles.hint}>
            <AppText size={40}>🤷</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No results for &ldquo;{res.query}&rdquo;
            </AppText>
          </View>
        ) : (
          <>
            {res.members.length ? (
              <>
                <SectionTitle label="People" />
                {res.members.map((m: any) => (
                  <Pressable key={m.member_id} onPress={() => router.push(`/member/${m.member_id}`)} style={[styles.row, { borderColor: c.border }]} testID={`search-member-${m.member_id}`}>
                    <Avatar uri={m.photo_url} name={m.name} size={44} color={m.color} ring />
                    <View style={{ flex: 1 }}>
                      <AppText family="display" weight="bold" size={15}>
                        {m.name}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        {m.relationship}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {res.memories.length ? (
              <>
                <SectionTitle label="Memories" />
                {res.memories.map((m: any) => (
                  <Pressable key={m.timeline_id} onPress={() => router.push(`/timeline/${m.timeline_id}`)} style={[styles.row, { borderColor: c.border }]} testID={`search-memory-${m.timeline_id}`}>
                    {m.media?.[0] ? <SmartImage uri={m.media[0].url} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" }]}><AppText size={18}>📖</AppText></View>}
                    <View style={{ flex: 1 }}>
                      <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                        {m.title}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        {dayjs(m.date).format("D MMM YYYY")}
                        {m.location ? ` · ${m.location}` : ""}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {res.posts.length ? (
              <>
                <SectionTitle label="Posts" />
                {res.posts.map((p: any) => (
                  <Pressable key={p.post_id} onPress={() => router.push(`/post/${p.post_id}`)} style={[styles.row, { borderColor: c.border }]} testID={`search-post-${p.post_id}`}>
                    {p.cover ? <SmartImage uri={p.cover} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" }]}><AppText size={18}>📝</AppText></View>}
                    <View style={{ flex: 1 }}>
                      <AppText size={14} numberOfLines={2}>
                        {p.caption || "Photo post"}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        by {p.author?.name}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {res.chats.length ? (
              <>
                <SectionTitle label="Chats" />
                {res.chats.map((ch: any) => (
                  <Pressable key={ch.chat_id} onPress={() => router.push(`/chat/${ch.chat_id}`)} style={[styles.row, { borderColor: c.border }]} testID={`search-chat-${ch.chat_id}`}>
                    {ch.type === "direct" ? (
                      <Avatar uri={ch.avatar} name={ch.display_name} size={44} color={ch.color} />
                    ) : ch.avatar ? (
                      <SmartImage uri={ch.avatar} style={styles.chatAvatar} />
                    ) : (
                      <View style={[styles.chatAvatar, { backgroundColor: ch.color || c.brand, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name={ch.type === "family" ? "heart" : "people"} size={20} color="#fff" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <AppText family="display" weight="bold" size={15} numberOfLines={1}>
                        {ch.display_name}
                      </AppText>
                      <AppText size={12} color={c.onSurfaceTertiary}>
                        {ch.type === "direct" ? "Direct message" : `${ch.members?.length || 0} members`}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: "#EAE4D9" },
  chatAvatar: { width: 44, height: 44, borderRadius: 22 },
  hint: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
