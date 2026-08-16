import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking, Switch } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { TextField } from "@/src/components/ui/TextField";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";
import { categoryMeta, occasionMeta, priorityMeta, STATUS_META } from "@/src/lib/wishMeta";

const STATUS_STEPS = ["reserved", "purchased", "received"] as const;

export default function WishItem() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member: me } = useAuth();
  const [it, setIt] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState("");
  const [reveal, setReveal] = useState(false);

  const isAdult = me && ["admin", "parent", "adult"].includes(me.role);
  const amGiftGiver = it && !it.is_family && me && it.owner_member_id !== me.member_id && isAdult;

  const load = useCallback(async () => {
    try {
      const w = await api(`/wishlists/items/${id}`);
      setIt(w);
      setReveal(!!w.reveal_buyer);
      if (!w.is_family && me && w.owner_member_id !== me.member_id && ["admin", "parent", "adult"].includes(me.role)) {
        try {
          setNotes(await api(`/wishlists/items/${id}/notes`));
        } catch {
          setNotes([]);
        }
      }
    } catch {}
  }, [id, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reserve = async () => {
    try {
      const w = await api(`/wishlists/items/${id}/reserve`, { method: "POST", body: { reveal } });
      setIt(w);
      load();
    } catch (e: any) {
      Alert.alert("Couldn't reserve", e.message || "Try again");
    }
  };
  const unreserve = async () => {
    try {
      setIt(await api(`/wishlists/items/${id}/unreserve`, { method: "POST" }));
    } catch {}
  };
  const setStatus = async (status: string) => {
    try {
      setIt(await api(`/wishlists/items/${id}/status`, { method: "POST", body: { status } }));
    } catch {}
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      const n = await api(`/wishlists/items/${id}/notes`, { method: "POST", body: { text: noteText.trim() } });
      setNotes((p) => [...p, n]);
      setNoteText("");
    } catch {}
  };
  const remove = () => {
    Alert.alert("Delete this wish?", "It will be removed from the wishlist.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/wishlists/items/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  if (!it) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const occ = occasionMeta(it.occasion);
  const cat = categoryMeta(it.category);
  const st = STATUS_META[it.status] || STATUS_META.wished;

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <KeyboardAwareScrollView bottomOffset={20} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          {it.photo_url ? (
            <SmartImage uri={it.photo_url} style={styles.heroImg} />
          ) : (
            <LinearGradient colors={["#F19EB6", "#E86A8C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroImg}>
              <AppText size={64}>{cat?.emoji || "🎁"}</AppText>
            </LinearGradient>
          )}
          <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.circleBtn, { top: insets.top + spacing.sm, left: spacing.lg }]} testID="wish-item-back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          {it.can_edit ? (
            <View style={{ position: "absolute", top: insets.top + spacing.sm, right: spacing.lg, flexDirection: "row", gap: spacing.sm }}>
              <Pressable onPress={() => router.push(`/wishlist/create?owner=${it.is_family ? "family" : it.owner_member_id}&id=${it.wish_id}`)} hitSlop={10} style={styles.circleBtnStatic} testID="wish-edit">
                <Ionicons name="create-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={remove} hitSlop={10} style={styles.circleBtnStatic} testID="wish-delete">
                <Ionicons name="trash-outline" size={19} color="#fff" />
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <AppText family="display" weight="bold" size={23}>
            {it.name}
          </AppText>
          <View style={styles.metaRow}>
            {it.price ? (
              <AppText family="display" weight="bold" size={19} color={c.brand}>
                {it.price}
              </AppText>
            ) : null}
            <AppText size={15}>{priorityMeta(it.priority).stars}</AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              {priorityMeta(it.priority).label}
            </AppText>
          </View>

          <View style={styles.chipRow}>
            {occ ? <View style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}><AppText size={12} weight="semibold">{occ.emoji} {occ.label}</AppText></View> : null}
            {cat && cat.key !== occ?.key ? <View style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}><AppText size={12} weight="semibold">{cat.emoji} {cat.label}</AppText></View> : null}
          </View>

          {(it.size || it.color || it.store) ? (
            <View style={[styles.detailCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {it.store ? <Detail c={c} label="Store" value={it.store} /> : null}
              {it.size ? <Detail c={c} label="Size" value={it.size} /> : null}
              {it.color ? <Detail c={c} label="Colour" value={it.color} /> : null}
            </View>
          ) : null}

          {it.notes ? (
            <AppText size={14} color={c.onSurfaceSecondary} style={{ marginTop: spacing.md, lineHeight: 21 }}>
              {it.notes}
            </AppText>
          ) : null}

          {it.product_url ? (
            <Pressable onPress={() => Linking.openURL(it.product_url)} style={[styles.linkBtn, { borderColor: c.border }]} testID="wish-open-link">
              <Ionicons name="open-outline" size={18} color={c.brand} />
              <AppText size={14} weight="semibold" color={c.brand}>
                View product online
              </AppText>
            </Pressable>
          ) : null}

          {/* Secret Gift Mode — only for adult gift-givers (not the owner) */}
          {amGiftGiver ? (
            <View style={[styles.giftCard, { backgroundColor: c.surface, borderColor: st.color }]}>
              <View style={styles.giftHead}>
                <AppText size={22}>🎁</AppText>
                <AppText family="display" weight="bold" size={16} style={{ flex: 1 }}>
                  Secret Gift Mode
                </AppText>
              </View>

              {!it.is_reserved ? (
                <>
                  <View style={styles.revealRow}>
                    <AppText size={13} color={c.onSurfaceSecondary} style={{ flex: 1 }}>
                      Let them see it's you (reveal buyer)
                    </AppText>
                    <Switch value={reveal} onValueChange={setReveal} testID="wish-reveal-toggle" />
                  </View>
                  <Pressable onPress={reserve} style={[styles.reserveBtn, { backgroundColor: st.color }]} testID="wish-reserve-btn">
                    <AppText size={15} weight="bold" color="#fff">
                      I'm Getting This 🎁
                    </AppText>
                  </Pressable>
                  <AppText size={12} color={c.onSurfaceTertiary} center style={{ marginTop: spacing.sm }}>
                    Hidden from {it.owner_member_id ? "them" : "the family"} so it stays a surprise 🤫
                  </AppText>
                </>
              ) : it.i_reserved ? (
                <>
                  <AppText size={13} color={c.onSurfaceSecondary} style={{ marginBottom: spacing.sm }}>
                    You're getting this gift. Update its progress:
                  </AppText>
                  <View style={styles.stepRow}>
                    {STATUS_STEPS.map((s) => {
                      const active = it.status === s;
                      const sm = STATUS_META[s];
                      return (
                        <Pressable key={s} onPress={() => setStatus(s)} style={[styles.step, { backgroundColor: active ? sm.color : c.surfaceSecondary, borderColor: active ? sm.color : c.border }]} testID={`wish-status-${s}`}>
                          <AppText size={16}>{sm.emoji}</AppText>
                          <AppText size={11} weight="bold" color={active ? "#fff" : c.onSurfaceSecondary}>
                            {sm.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable onPress={unreserve} style={styles.cancelRes} testID="wish-unreserve-btn">
                    <AppText size={13} weight="semibold" color={c.error}>
                      I'm no longer getting this
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <View style={[styles.reservedByBox, { backgroundColor: st.color + "1A" }]}>
                  <Avatar uri={it.reserved_by?.photo_url} name={it.reserved_by?.name} size={30} color={it.reserved_by?.color} />
                  <AppText size={14} weight="semibold" color={st.color} style={{ flex: 1 }}>
                    {it.reserved_by?.name} is getting this ({st.label})
                  </AppText>
                </View>
              )}

              {/* private gift-planning notes */}
              <View style={styles.notesWrap}>
                <AppText size={13} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 0.5, marginBottom: spacing.sm }}>
                  GIFT PLANNING · PRIVATE
                </AppText>
                {notes.map((n) => (
                  <View key={n.note_id} style={styles.noteRow} testID={`wish-note-${n.note_id}`}>
                    <Avatar uri={n.member?.photo_url} name={n.member?.name} size={26} color={n.member?.color} />
                    <View style={[styles.noteBubble, { backgroundColor: c.surfaceSecondary }]}>
                      <AppText size={12} weight="bold" color={c.onSurfaceSecondary}>
                        {n.member?.name}
                      </AppText>
                      <AppText size={13}>{n.text}</AppText>
                    </View>
                  </View>
                ))}
                <View style={styles.noteInputRow}>
                  <View style={{ flex: 1 }}>
                    <TextField placeholder="Add a private note for gift-givers…" value={noteText} onChangeText={setNoteText} testID="wish-note-input" />
                  </View>
                  <Pressable onPress={addNote} style={[styles.noteSend, { backgroundColor: c.brand }]} testID="wish-note-send">
                    <Ionicons name="send" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Detail({ c, label, value }: { c: any; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText size={13} color={c.onSurfaceTertiary}>
        {label}
      </AppText>
      <AppText size={14} weight="semibold">
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { position: "relative" },
  heroImg: { width: "100%", height: 260, alignItems: "center", justifyContent: "center" },
  circleBtn: { position: "absolute", width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  circleBtnStatic: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, marginTop: -spacing.xl },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  detailCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, marginTop: spacing.md },
  giftCard: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.lg, marginTop: spacing.xl },
  giftHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  revealRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  reserveBtn: { borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: "center" },
  stepRow: { flexDirection: "row", gap: spacing.sm },
  step: { flex: 1, alignItems: "center", gap: 2, borderRadius: radius.md, borderWidth: 1.5, paddingVertical: spacing.md },
  cancelRes: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.xs },
  reservedByBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  notesWrap: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)", paddingTop: spacing.md },
  noteRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, alignItems: "flex-start" },
  noteBubble: { flex: 1, borderRadius: radius.md, padding: spacing.sm },
  noteInputRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.xs },
  noteSend: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
