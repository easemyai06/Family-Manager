import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking, Modal } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { DateField } from "@/src/components/ui/DateTimeField";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api, mediaUrl } from "@/src/lib/api";
import { formatDMY } from "@/src/lib/time";
import { vaultSession } from "@/src/lib/vaultSession";

export default function VaultItem() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [it, setIt] = useState<any>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [newExpiry, setNewExpiry] = useState<string | null>(null);
  const [renewBusy, setRenewBusy] = useState(false);

  const load = useCallback(async () => {
    if (!vaultSession.isUnlocked()) {
      router.replace("/vault");
      return;
    }
    vaultSession.touch();
    try {
      setIt(await api(`/vault/items/${id}`));
    } catch {}
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remove = () => {
    Alert.alert("Delete this item?", "It will be permanently removed from the Vault.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/vault/items/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  const openRenew = () => {
    setNewExpiry(null);
    setRenewOpen(true);
  };

  const confirmRenew = async () => {
    if (!newExpiry) return;
    setRenewBusy(true);
    try {
      const updated = await api(`/vault/items/${id}/renew`, { method: "POST", body: { expiry_date: newExpiry } });
      setIt(updated);
      setRenewOpen(false);
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message || "Please try again.");
    }
    setRenewBusy(false);
  };

  if (!it) return <View style={{ flex: 1, backgroundColor: c.surface }} />;
  const isIns = it.kind === "insurance";
  const days = it.days_until_expiry;
  const insRows: [string, string | null][] = [
    ["Insurance company", it.provider],
    ["Policy number", it.policy_number],
    ["Policy holder", it.policy_holder],
    ["Coverage", it.coverage_amount],
    ["Premium", it.premium],
    ["Agent / contact", it.agent_contact],
    ["Claims number", it.claims_number],
    ["Emergency assistance", it.emergency_number],
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="vault-item-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={17} numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {isIns ? "Policy" : "Document"}
        </AppText>
        {it.can_edit ? (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable onPress={() => router.push(`/vault/create?id=${it.item_id}`)} hitSlop={10} testID="vault-item-edit">
              <Ionicons name="create-outline" size={22} color={c.onSurface} />
            </Pressable>
            <Pressable onPress={remove} hitSlop={10} testID="vault-item-delete">
              <Ionicons name="trash-outline" size={21} color={c.error} />
            </Pressable>
          </View>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.titleRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
          <View style={[styles.icon, { backgroundColor: isIns ? "#7FA9C922" : "#8AB07D22" }]}>
            <Ionicons name={isIns ? "shield-checkmark" : "document-text"} size={26} color={isIns ? "#5A87AB" : "#6B8E5A"} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText family="display" weight="bold" size={19}>
              {it.title}
            </AppText>
            {it.owner ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Avatar uri={it.owner.photo_url} name={it.owner.name} size={20} color={it.owner.color} />
                <AppText size={12} color={c.onSurfaceTertiary}>
                  {it.owner.name}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        {days != null ? (
          <View style={[styles.expiryBanner, { backgroundColor: days <= 30 ? "#E8A33D22" : "#8AB07D22" }]}>
            <Ionicons name="alarm-outline" size={18} color={days <= 30 ? "#C57F1E" : "#6B8E5A"} />
            <AppText size={13} weight="bold" color={days <= 30 ? "#C57F1E" : "#6B8E5A"} style={{ flex: 1 }}>
              {days < 0 ? `Expired on ${formatDMY(it.expiry_date)}` : `Expires in ${days} day${days === 1 ? "" : "s"} · ${formatDMY(it.expiry_date)}`}
            </AppText>
            {it.can_edit && days <= 30 ? (
              <Pressable onPress={openRenew} style={[styles.renewBtn, { backgroundColor: c.brand }]} testID="vault-renew-btn">
                <Ionicons name="refresh" size={14} color="#fff" />
                <AppText size={12} weight="bold" color="#fff">Renew</AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isIns ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}>
            {insRows.filter(([, v]) => v).map(([label, value], i, arr) => (
              <View key={label} style={[styles.detailRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.divider }]}>
                <AppText size={13} color={c.onSurfaceTertiary}>
                  {label}
                </AppText>
                <AppText size={14} weight="semibold" style={{ flex: 1, textAlign: "right" }}>
                  {value}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {it.covered_members?.length ? (
          <View style={{ marginTop: spacing.lg }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              COVERED MEMBERS
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {it.covered_members.map((m: any) => (
                <View key={m.member_id} style={[styles.memberChip, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Avatar uri={m.photo_url} name={m.name} size={22} color={m.color} />
                  <AppText size={12} weight="semibold">
                    {m.name}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {it.website ? (
          <Pressable onPress={() => Linking.openURL(it.website)} style={[styles.linkBtn, { borderColor: c.border }]} testID="vault-website">
            <Ionicons name="globe-outline" size={18} color={c.brand} />
            <AppText size={14} weight="semibold" color={c.brand}>
              {it.website}
            </AppText>
          </Pressable>
        ) : null}

        {it.notes ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: spacing.lg }, shadow(1)]}>
            <AppText size={14} color={c.onSurfaceSecondary} style={{ lineHeight: 21 }}>
              {it.notes}
            </AppText>
          </View>
        ) : null}

        {it.files?.length ? (
          <View style={{ marginTop: spacing.lg }}>
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              📎 ATTACHMENTS
            </AppText>
            {it.files.map((f: any, i: number) => {
              const isImg = f.type === "image";
              return (
                <Pressable key={i} onPress={() => Linking.openURL(mediaUrl(f.url) || f.url)} style={[styles.fileRow, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`vault-file-${i}`}>
                  {isImg ? (
                    <SmartImage uri={f.url} style={styles.fileThumb} />
                  ) : (
                    <View style={[styles.fileThumb, { backgroundColor: "#E86A6A22", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="document" size={22} color="#C74B4B" />
                    </View>
                  )}
                  <AppText size={14} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                    {f.name || (isImg ? "Photo" : "Document")}
                  </AppText>
                  <Ionicons name="open-outline" size={18} color={c.brand} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={renewOpen} transparent animationType="fade" onRequestClose={() => setRenewOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setRenewOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: c.surface }]} onPress={() => {}}>
            <View style={[styles.renewIcon, { backgroundColor: c.brandTertiary }]}>
              <Ionicons name="refresh" size={22} color={c.onBrandTertiary} />
            </View>
            <AppText family="display" weight="bold" size={18} center style={{ marginTop: spacing.sm }}>
              Mark as renewed
            </AppText>
            <AppText size={13} color={c.onSurfaceTertiary} center style={{ marginTop: 4, marginBottom: spacing.lg }}>
              Set the new expiry date. The reminder clears once it’s in the future.
            </AppText>
            <DateField label="New expiry date" value={newExpiry} onChange={setNewExpiry} placeholder="Select new expiry date" testID="vault-renew-date" />
            <Button
              label={renewBusy ? "Saving…" : "Save new expiry"}
              onPress={confirmRenew}
              loading={renewBusy}
              disabled={renewBusy || !newExpiry}
              testID="vault-renew-save"
              style={{ marginTop: spacing.lg }}
            />
            <Pressable onPress={() => setRenewOpen(false)} style={{ paddingVertical: spacing.md, alignItems: "center" }}>
              <AppText size={15} weight="semibold" color={c.onSurfaceSecondary}>Cancel</AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1 },
  renewBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCard: { borderRadius: radius.xl, padding: spacing.xl, alignItems: "stretch" },
  renewIcon: { alignSelf: "center", width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  icon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  expiryBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.lg, paddingHorizontal: spacing.lg, overflow: "hidden" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, marginTop: spacing.lg },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, marginBottom: spacing.sm },
  fileThumb: { width: 44, height: 44, borderRadius: radius.sm },
});
