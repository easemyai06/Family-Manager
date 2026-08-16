import React, { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui/AppText";
import { Avatar } from "@/src/components/ui/Avatar";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius, shadow } from "@/src/theme/tokens";
import { api } from "@/src/lib/api";

export default function FamilyTree() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<any[]>([]);
  const [famName, setFamName] = useState("");

  const load = useCallback(async () => {
    try {
      const f = await api("/families/me");
      setMembers(f.members || []);
      setFamName(f.family?.name || "");
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Automatic generation grouping from roles/relationships.
  const grand: any[] = [];
  const parents: any[] = [];
  const children: any[] = [];
  for (const m of members) {
    const rel = (m.relationship || "").toLowerCase();
    const isChild = m.role === "child" || m.is_child;
    if (rel.includes("grand")) grand.push(m);
    else if (isChild) children.push(m);
    else parents.push(m);
  }
  const tiers = [
    { key: "grandparents", label: "Grandparents", items: grand },
    { key: "parents", label: "Parents", items: parents },
    { key: "children", label: "Children", items: children },
  ].filter((t) => t.items.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="tree-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText family="display" weight="bold" size={20}>
            Family Tree 🌳
          </AppText>
          <AppText size={12} color={c.onSurfaceTertiary}>
            Tap anyone to open their story
          </AppText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.xl, paddingBottom: insets.bottom + 40 }}>
        {famName ? (
          <AppText family="display" weight="bold" size={16} center color={c.brand} style={{ marginBottom: spacing.md }}>
            {famName}
          </AppText>
        ) : null}

        {tiers.map((tier, ti) => (
          <View key={tier.key}>
            {ti > 0 ? <View style={[styles.spine, { backgroundColor: c.borderStrong }]} /> : null}
            <AppText size={12} weight="bold" color={c.onSurfaceTertiary} center style={{ marginBottom: spacing.md, letterSpacing: 1 }}>
              {tier.label.toUpperCase()}
            </AppText>
            <View style={styles.tierRow}>
              {tier.items.map((m) => (
                <Pressable
                  key={m.member_id}
                  onPress={() => router.push(`/member/${m.member_id}`)}
                  style={[styles.node, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]}
                  testID={`tree-node-${m.member_id}`}
                >
                  <Avatar uri={m.photo_url} name={m.name} size={64} color={m.color} ring />
                  <AppText family="display" weight="bold" size={14} numberOfLines={1} style={{ marginTop: 6, maxWidth: 96 }}>
                    {m.name}
                  </AppText>
                  <AppText size={11} color={c.onSurfaceTertiary} numberOfLines={1} style={{ maxWidth: 96 }}>
                    {m.relationship}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {tiers.length === 0 ? (
          <View style={styles.empty}>
            <AppText size={40}>🌳</AppText>
            <AppText family="display" weight="bold" size={16} center style={{ marginTop: spacing.md }}>
              No family members yet
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  spine: { alignSelf: "center", width: 2, height: 28, marginBottom: spacing.md },
  tierRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  node: { width: 116, alignItems: "center", borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing["3xl"] },
});
