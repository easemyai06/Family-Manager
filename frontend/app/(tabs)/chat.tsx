import React, { useCallback, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/lib/api";

// Chat is now a single family conversation. This tab route just forwards to it
// (the Chat tab press already opens it directly; this is a safety net).
export default function ChatRedirect() {
  const { c } = useTheme();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const chats = await api<any[]>("/chats");
          const fam = chats.find((ch) => ch.type === "family");
          if (active && fam?.chat_id) {
            router.replace(`/chat/${fam.chat_id}?name=${encodeURIComponent("Family Chat")}`);
          } else if (active) {
            setFailed(true);
          }
        } catch {
          if (active) setFailed(true);
        }
      })();
      return () => {
        active = false;
      };
    }, [router])
  );

  return (
    <View style={[styles.center, { backgroundColor: c.surface }]}>
      {!failed ? <ActivityIndicator color={c.brand} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
