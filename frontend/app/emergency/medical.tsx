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

export default function MedicalList() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setMembers(await api("/families/members"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.surfaceSecondary, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="medical-back">
          <Ionicons name="chevron-back" size={26} color={c.onSurface} />
        </Pressable>
        <AppText family="display" weight="bold" size={19}>
          Medical Cards
        </AppText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <AppText size={13} color={c.onSurfaceTertiary} style={{ marginBottom: spacing.md }}>
          Quick medical info for each family member — vital in an emergency.
        </AppText>
        {members.map((m) => (
          <Pressable key={m.member_id} onPress={() => router.push(`/emergency/medical/${m.member_id}`)} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }, shadow(1)]} testID={`medical-${m.member_id}`}>
            <Avatar uri={m.photo_url} name={m.name} size={44} color={m.color} />
            <View style={{ flex: 1 }}>
              <AppText family="display" weight="bold" size={16}>
                {m.name}
              </AppText>
              <AppText size={12} color={c.onSurfaceTertiary}>
                {m.relationship}
              </AppText>
            </View>
            <Ionicons name="medkit-outline" size={20} color="#E86A6A" />
            <Ionicons name="chevron-forward" size={18} color={c.onSurfaceTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
});
