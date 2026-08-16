import React from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/src/components/ui/AppText";

export default function Index() {
  return (
    <LinearGradient colors={["#FF9E9E", "#FF6B6B"]} style={styles.container}>
      <AppText family="display" weight="bold" size={44} color="#FFFFFF">
        ❤️
      </AppText>
      <AppText family="display" weight="bold" size={30} color="#FFFFFF" style={{ marginTop: 8 }}>
        FamilyHome
      </AppText>
      <ActivityIndicator color="#FFFFFF" style={{ marginTop: 24 }} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
