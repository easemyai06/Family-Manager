import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { TextField } from "@/src/components/ui/TextField";
import { Button } from "@/src/components/ui/Button";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";
import { api, uploadMedia, uploadDocument } from "@/src/lib/api";
import { VISIBILITIES } from "@/src/lib/wishMeta";

type FileT = { url: string; type: string; name?: string };

export default function VaultCreate() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, folder_id } = useLocalSearchParams<{ id?: string; folder_id?: string }>();
  const editing = !!id;

  const [kind, setKind] = useState<"document" | "insurance">("document");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState<string | null>(folder_id || null);
  const [owner, setOwner] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState("parents");
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<FileT[]>([]);
  // insurance
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [policyHolder, setPolicyHolder] = useState("");
  const [coverage, setCoverage] = useState("");
  const [premium, setPremium] = useState("");
  const [agent, setAgent] = useState("");
  const [claims, setClaims] = useState("");
  const [emNumber, setEmNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [covered, setCovered] = useState<string[]>([]);

  const [folders, setFolders] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/vault/folders").then(setFolders).catch(() => {});
    api("/families/members").then(setMembers).catch(() => {});
    if (editing) {
      api(`/vault/items/${id}`).then((v: any) => {
        setKind(v.kind);
        setTitle(v.title || "");
        setFolder(v.folder_id || null);
        setOwner(v.owner_member_id || null);
        setIssueDate(v.issue_date || "");
        setExpiryDate(v.expiry_date || "");
        setNotes(v.notes || "");
        setVisibility(v.visibility || "parents");
        setSelected(v.visible_member_ids || []);
        setFiles(v.files || []);
        setProvider(v.provider || "");
        setPolicyNumber(v.policy_number || "");
        setPolicyHolder(v.policy_holder || "");
        setCoverage(v.coverage_amount || "");
        setPremium(v.premium || "");
        setAgent(v.agent_contact || "");
        setClaims(v.claims_number || "");
        setEmNumber(v.emergency_number || "");
        setWebsite(v.website || "");
        setCovered(v.covered_member_ids || []);
      }).catch(() => {});
    }
  }, [id, editing]);

  const addPhoto = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") {
      if (Platform.OS !== "web") Linking.openSettings();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    try {
      const up = await uploadMedia(res.assets[0].uri, "image");
      setFiles((f) => [...f, { url: up.url, type: "image", name: "Photo" }]);
    } catch {} finally {
      setBusy(false);
    }
  };

  const addDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const up = await uploadDocument(a.uri, a.name || "document", a.mimeType || "application/octet-stream");
      const t = (a.mimeType || "").includes("pdf") ? "pdf" : (a.mimeType || "").startsWith("image") ? "image" : "document";
      setFiles((f) => [...f, { url: up.url, type: t, name: a.name || "Document" }]);
    } catch {} finally {
      setBusy(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, mid: string) =>
    set(list.includes(mid) ? list.filter((x) => x !== mid) : [...list, mid]);

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Give this a title");
      return;
    }
    const body: any = {
      kind, title: title.trim(), folder_id: folder, owner_member_id: owner,
      notes: notes.trim() || null, tags: [], issue_date: issueDate.trim() || null,
      expiry_date: expiryDate.trim() || null, files, visibility,
      visible_member_ids: visibility === "selected" ? selected : [],
    };
    if (kind === "insurance") {
      Object.assign(body, {
        provider: provider.trim() || null, policy_number: policyNumber.trim() || null,
        policy_holder: policyHolder.trim() || null, coverage_amount: coverage.trim() || null,
        premium: premium.trim() || null, agent_contact: agent.trim() || null,
        claims_number: claims.trim() || null, emergency_number: emNumber.trim() || null,
        website: website.trim() || null, covered_member_ids: covered,
      });
    }
    setSaving(true);
    try {
      if (editing) await api(`/vault/items/${id}`, { method: "PATCH", body });
      else await api("/vault/items", { method: "POST", body });
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
        <Pressable onPress={() => router.back()} hitSlop={12} testID="close-vault-create">
          <Ionicons name="close" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={18}>
          {editing ? "Edit Item" : "Add to Vault"}
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        {/* kind toggle */}
        <View style={styles.chipWrap}>
          <Chip active={kind === "document"} label="📄 Document" onPress={() => setKind("document")} testID="vault-kind-document" />
          <Chip active={kind === "insurance"} label="🛡️ Insurance" onPress={() => setKind("insurance")} testID="vault-kind-insurance" />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Title" icon="pricetag-outline" placeholder={kind === "insurance" ? "e.g. Health Insurance" : "e.g. Passport"} value={title} onChangeText={setTitle} testID="vault-title-input" />
        </View>

        {/* folder */}
        <AppText family="display" weight="bold" size={14} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Folder
        </AppText>
        <View style={styles.chipWrap}>
          {folders.map((f) => (
            <Chip key={f.folder_id} active={folder === f.folder_id} label={f.name} onPress={() => setFolder(folder === f.folder_id ? null : f.folder_id)} testID={`vault-folder-pick-${f.folder_id}`} />
          ))}
        </View>

        {/* insurance fields */}
        {kind === "insurance" ? (
          <>
            <View style={{ marginTop: spacing.lg }}>
              <TextField label="Insurance company" value={provider} onChangeText={setProvider} testID="vault-provider-input" />
            </View>
            <View style={styles.two}>
              <View style={{ flex: 1 }}>
                <TextField label="Policy number" value={policyNumber} onChangeText={setPolicyNumber} testID="vault-policy-input" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Coverage" value={coverage} onChangeText={setCoverage} testID="vault-coverage-input" />
              </View>
            </View>
            <View style={styles.two}>
              <View style={{ flex: 1 }}>
                <TextField label="Policy holder" value={policyHolder} onChangeText={setPolicyHolder} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Premium" value={premium} onChangeText={setPremium} />
              </View>
            </View>
            <View style={styles.two}>
              <View style={{ flex: 1 }}>
                <TextField label="Claims number" value={claims} onChangeText={setClaims} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Emergency no." value={emNumber} onChangeText={setEmNumber} />
              </View>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <TextField label="Agent / contact" value={agent} onChangeText={setAgent} />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <TextField label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" testID="vault-website-input" />
            </View>
            <AppText family="display" weight="bold" size={14} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Covered members
            </AppText>
            <View style={styles.chipWrap}>
              {members.map((m) => (
                <Chip key={m.member_id} active={covered.includes(m.member_id)} label={m.name} onPress={() => toggle(covered, setCovered, m.member_id)} testID={`vault-covered-${m.member_id}`} />
              ))}
            </View>
          </>
        ) : (
          <>
            <AppText family="display" weight="bold" size={14} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Belongs to (optional)
            </AppText>
            <View style={styles.chipWrap}>
              {members.map((m) => (
                <Chip key={m.member_id} active={owner === m.member_id} label={m.name} onPress={() => setOwner(owner === m.member_id ? null : m.member_id)} testID={`vault-owner-${m.member_id}`} />
              ))}
            </View>
          </>
        )}

        {/* dates */}
        <View style={styles.two}>
          <View style={{ flex: 1 }}>
            <TextField label="Issue date" placeholder="YYYY-MM-DD" value={issueDate} onChangeText={setIssueDate} testID="vault-issue-input" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Expiry date" placeholder="YYYY-MM-DD" value={expiryDate} onChangeText={setExpiryDate} testID="vault-expiry-input" />
          </View>
        </View>

        {/* visibility */}
        <AppText family="display" weight="bold" size={14} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Who can see this?
        </AppText>
        <View style={styles.chipWrap}>
          {VISIBILITIES.map((v) => (
            <Chip key={v.key} active={visibility === v.key} label={v.label} onPress={() => setVisibility(v.key)} testID={`vault-visibility-${v.key}`} />
          ))}
        </View>
        {visibility === "selected" ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {members.map((m) => {
              const on = selected.includes(m.member_id);
              return (
                <Pressable key={m.member_id} onPress={() => toggle(selected, setSelected, m.member_id)} style={[styles.memRow, { borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brandTertiary : c.surface }]} testID={`vault-select-${m.member_id}`}>
                  <Avatar uri={m.photo_url} name={m.name} size={30} color={m.color} />
                  <AppText size={14} weight="semibold" style={{ flex: 1 }}>
                    {m.name}
                  </AppText>
                  <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? c.brand : c.onSurfaceTertiary} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* attachments */}
        <AppText family="display" weight="bold" size={14} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
          Attachments {busy ? "· uploading…" : ""}
        </AppText>
        {files.map((f, i) => (
          <View key={i} style={[styles.fileRow, { backgroundColor: c.surfaceSecondary }]}>
            <Ionicons name={f.type === "image" ? "image" : "document"} size={18} color={c.onSurfaceSecondary} />
            <AppText size={13} style={{ flex: 1 }} numberOfLines={1}>
              {f.name || f.type}
            </AppText>
            <Pressable onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8} testID={`vault-file-remove-${i}`}>
              <Ionicons name="close-circle" size={20} color={c.onSurfaceTertiary} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
          <Pressable onPress={addPhoto} style={[styles.attachBtn, { borderColor: c.border }]} testID="vault-add-photo">
            <Ionicons name="image-outline" size={18} color={c.brand} />
            <AppText size={13} weight="semibold" color={c.brand}>
              Photo
            </AppText>
          </Pressable>
          <Pressable onPress={addDoc} style={[styles.attachBtn, { borderColor: c.border }]} testID="vault-add-doc">
            <Ionicons name="document-attach-outline" size={18} color={c.brand} />
            <AppText size={13} weight="semibold" color={c.brand}>
              PDF / Scan
            </AppText>
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Notes (optional)" icon="text-outline" placeholder="Anything to remember" value={notes} onChangeText={setNotes} multiline style={{ height: 76, textAlignVertical: "top", paddingTop: 4 }} testID="vault-notes-input" />
        </View>

        {error ? (
          <AppText size={13} color={c.error} style={{ marginTop: spacing.lg }} testID="vault-error">
            {error}
          </AppText>
        ) : null}
        <Button label={editing ? "Save Changes" : "Save to Vault"} onPress={save} loading={saving} style={{ marginTop: spacing.xl }} testID="save-vault-btn" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  two: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  memRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  attachBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", paddingVertical: spacing.md },
});
