import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Switch, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

const EMOJIS = ["👨", "👩", "👵", "👴", "👨‍⚕️", "🏥", "🚑", "🚒", "👮", "🛡️", "🏫", "👶", "🐶", "📞"];

export default function ContactEdit() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [icon, setIcon] = useState("📞");
  const [critical, setCritical] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      api("/emergency/contacts").then((list: any[]) => {
        const ct = list.find((x) => x.contact_id === id);
        if (ct) {
          setName(ct.name || "");
          setRelationship(ct.relationship || "");
          setPhone(ct.phone || "");
          setAltPhone(ct.alt_phone || "");
          setWhatsapp(ct.whatsapp || "");
          setEmail(ct.email || "");
          setAddress(ct.address || "");
          setNotes(ct.notes || "");
          setIcon(ct.icon || "📞");
          setCritical(!!ct.critical);
        }
      }).catch(() => {});
    }
  }, [id, editing]);

  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required");
      return;
    }
    const body = {
      name: name.trim(), relationship: relationship.trim() || null, phone: phone.trim(),
      alt_phone: altPhone.trim() || null, whatsapp: whatsapp.trim() || null,
      email: email.trim() || null, address: address.trim() || null, notes: notes.trim() || null,
      icon, critical, member_id: null,
    };
    setSaving(true);
    try {
      if (editing) await api(`/emergency/contacts/${id}`, { method: "PATCH", body });
      else await api("/emergency/contacts", { method: "POST", body });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert("Delete contact?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await api(`/emergency/contacts/${id}`, { method: "DELETE" }); router.back(); } catch {} } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-contact-edit">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          {editing ? "Edit Contact" : "New Contact"}
        </AppText>
        {editing ? (
          <Pressable onPress={remove} hitSlop={12} testID="delete-contact-btn">
            <Ionicons name="trash-outline" size={22} color={c.error} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <View style={styles.emojiWrap}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setIcon(e)} style={[styles.emoji, { backgroundColor: icon === e ? c.brandTertiary : c.surfaceSecondary, borderColor: icon === e ? c.brand : "transparent" }]} testID={`contact-emoji-${e}`}>
              <AppText size={22}>{e}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Name" placeholder="e.g. Dr. Sharma" value={name} onChangeText={setName} testID="contact-name-input" />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Relationship / Organization" placeholder="Family Doctor" value={relationship} onChangeText={setRelationship} testID="contact-rel-input" />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Phone" placeholder="+91 …" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="contact-phone-input" />
        </View>
        <View style={styles.two}>
          <View style={{ flex: 1 }}>
            <TextField label="Alt phone" value={altPhone} onChangeText={setAltPhone} keyboardType="phone-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="WhatsApp" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" testID="contact-wa-input" />
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Address (optional)" value={address} onChangeText={setAddress} />
        </View>

        <Pressable onPress={() => setCritical((v) => !v)} style={[styles.critRow, { backgroundColor: c.surfaceSecondary }]} testID="contact-critical-toggle">
          <View style={{ flex: 1 }}>
            <AppText size={15} weight="bold">
              ⭐ Mark as critical
            </AppText>
            <AppText size={12} color={c.onSurfaceTertiary}>
              Always shown at the top with a quick Call button
            </AppText>
          </View>
          <Switch value={critical} onValueChange={setCritical} />
        </Pressable>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="contact-error">
            {error}
          </AppText>
        ) : null}
        <Button label={editing ? "Save Changes" : "Add Contact"} onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-contact-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emojiWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emoji: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  two: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  critRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: 12, padding: spacing.md, marginTop: spacing.lg },
});
