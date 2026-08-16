import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { radius, spacing, fonts } from "@/src/theme/tokens";
import { AppText } from "./AppText";

interface Props extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
  testID?: string;
}

export function TextField({ label, icon, isPassword, testID, style, ...rest }: Props) {
  const { c } = useTheme();
  const [hidden, setHidden] = useState(!!isPassword);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: 6 }}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: c.surfaceSecondary,
            borderColor: focused ? c.brand : c.border,
          },
        ]}
      >
        {icon ? <Ionicons name={icon} size={20} color={c.onSurfaceTertiary} /> : null}
        <TextInput
          testID={testID}
          placeholderTextColor={c.onSurfaceTertiary}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: c.onSurface, fontFamily: fonts.textMedium }, style]}
          {...rest}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={c.onSurfaceTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    height: 54,
  },
  input: { flex: 1, fontSize: 15, height: "100%" },
});
