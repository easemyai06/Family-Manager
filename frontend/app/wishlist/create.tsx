import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { SmartImage } from "@/src/components/ui/SmartImage";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia } from "@/src/lib/api";
import { OCCASIONS, CATEGORIES, VISIBILITIES, PRIORITY } from "@/src/lib/wishMeta";

export default function CreateWish() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { owner, id } = useLocalSearchParams<{ owner: string; id?: string }>();
  const isFamily = owner === "family";
  const editing = !!id;

  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productUrl, setProductUrl] = useState("");
  const [price, setPrice] = useState("");
  const [store, setStore] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(2);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState("family");
  const [selected, setSelected] = useState<string[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/families/members").then(setMembers).catch(() => {});
    if (editing) {
      api(`/wishlists/items/${id}`).then((w: any) => {
        setName(w.name || "");
        setPhoto(w.photo_url || null);
        setProductUrl(w.product_url || "");
        setPrice(w.price || "");
        setStore(w.store || "");
        setSize(w.size || "");
        setColor(w.color || "");
        setNotes(w.notes || "");
        setPriority(w.priority || 2);
        setOccasion(w.occasion || null);
        setCategory(w.category || null);
        setVisibility(w.visibility || "family");
        setSelected(w.visible_member_ids || []);
      }).catch(() => {});
    }
  }, [id, editing]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const up = await uploadMedia(result.assets[0].uri, "image");
      setPhoto(up.url);
    } catch {} finally {
      setUploading(false);
    }
  };

  const toggleMember = (mid: string) => setSelected((prev) => (prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid]));

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("Give the wish a name");
      return;
    }
    const body = {
      name: name.trim(),
      photo_url: photo,
      product_url: productUrl.trim() || null,
      price: price.trim() || null,
      store: store.trim() || null,
      size: size.trim() || null,
      color: color.trim() || null,
      notes: notes.trim() || null,
      priority,
      occasion,
      category,
      visibility: isFamily ? "family" : visibility,
      visible_member_ids: visibility === "selected" ? selected : [],
    };
    setSaving(true);
    try {
      if (editing) await api(`/wishlists/items/${id}`, { method: "PATCH", body });
      else await api(`/wishlists/${owner}/items`, { method: "POST", body });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({ active, label, onPress, testID }: { active: boolean; label: string; onPress: () => void; testID?: string }) => (
    <Pressable onPress={onPress} testID={testID} style={[styles.chip, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}>
      <AppText size={13} weight="semibold" color={active ? "#fff" : c.onSurfaceSecondary}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-create-wish">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          {editing ? "Edit Wish" : "Add a Wish"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <Pressable onPress={pickPhoto} style={[styles.photoPick, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]} testID="wish-photo-pick">
          {photo ? (
            <SmartImage uri={photo} style={StyleSheet.absoluteFillObject as any} />
          ) : (
            <>
              <Ionicons name={uploading ? "hourglass-outline" : "image-outline"} size={24} color={c.onSurfaceTertiary} />
              <AppText size={13} color={c.onSurfaceTertiary} style={{ marginTop: 4 }}>
                {uploading ? "Uploading…" : "Add a photo (optional)"}
              </AppText>
            </>
          )}
        </Pressable>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="What do you wish for?" icon="gift-outline" placeholder="e.g. LEGO Space Set" value={name} onChangeText={setName} testID="wish-name-input" />
        </View>

        <View style={styles.two}>
          <View style={{ flex: 1 }}>
            <TextField label="Price (optional)" placeholder="₹4,999" value={price} onChangeText={setPrice} testID="wish-price-input" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Store (optional)" placeholder="Amazon" value={store} onChangeText={setStore} testID="wish-store-input" />
          </View>
        </View>
        <View style={styles.two}>
          <View style={{ flex: 1 }}>
            <TextField label="Size" placeholder="UK 6" value={size} onChangeText={setSize} testID="wish-size-input" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Colour" placeholder="Blue" value={color} onChangeText={setColor} testID="wish-color-input" />
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <TextField label="Product link (optional)" icon="link-outline" placeholder="https://…" value={productUrl} onChangeText={setProductUrl} autoCapitalize="none" testID="wish-url-input" />
        </View>

        {/* priority */}
        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          How much do you want it?
        </AppText>
        <View style={styles.chipWrap}>
          {PRIORITY.map((p) => (
            <Chip key={p.v} active={priority === p.v} label={`${p.stars} ${p.label}`} onPress={() => setPriority(p.v)} testID={`wish-priority-${p.v}`} />
          ))}
        </View>

        {/* occasion */}
        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Occasion
        </AppText>
        <View style={styles.chipWrap}>
          {OCCASIONS.map((o) => (
            <Chip key={o.key} active={occasion === o.key} label={`${o.emoji} ${o.label}`} onPress={() => setOccasion(occasion === o.key ? null : o.key)} testID={`wish-occasion-${o.key}`} />
          ))}
        </View>

        {/* category */}
        <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
          Type
        </AppText>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((cat) => (
            <Chip key={cat.key} active={category === cat.key} label={`${cat.emoji} ${cat.label}`} onPress={() => setCategory(category === cat.key ? null : cat.key)} testID={`wish-category-${cat.key}`} />
          ))}
        </View>

        {/* visibility */}
        {!isFamily ? (
          <>
            <AppText family="display" weight="bold" size={15} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
              Who can see this?
            </AppText>
            <View style={styles.chipWrap}>
              {VISIBILITIES.map((v) => (
                <Chip key={v.key} active={visibility === v.key} label={v.label} onPress={() => setVisibility(v.key)} testID={`wish-visibility-${v.key}`} />
              ))}
            </View>
            {visibility === "selected" ? (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {members.map((m) => {
                  const on = selected.includes(m.member_id);
                  return (
                    <Pressable key={m.member_id} onPress={() => toggleMember(m.member_id)} style={[styles.memRow, { borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brandTertiary : c.surface }]} testID={`wish-select-${m.member_id}`}>
                      <Avatar uri={m.photo_url} name={m.name} size={32} color={m.color} />
                      <AppText size={14} weight="semibold" style={{ flex: 1 }}>
                        {m.name}
                      </AppText>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? c.brand : c.onSurfaceTertiary} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <TextField label="Notes (optional)" icon="text-outline" placeholder="Anything else to add" value={notes} onChangeText={setNotes} multiline style={{ height: 76, textAlignVertical: "top", paddingTop: 4 }} testID="wish-notes-input" />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="wish-error">
            {error}
          </AppText>
        ) : null}
        <Button label={editing ? "Save Changes" : "Add to Wishlist"} onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-wish-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  photoPick: { height: 130, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  two: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  memRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
});
