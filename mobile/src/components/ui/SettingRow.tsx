/* src/components/ui/SettingRow.tsx */

import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "react-native-paper";

type SettingRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  showDivider?: boolean;
  accessibilityLabel?: string;
};

export function SettingRow({
  icon,
  label,
  value,
  onPress,
  disabled = false,
  style,
  showDivider = true,
  accessibilityLabel,
}: SettingRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}, ${value}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.divider,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.left}>
        <View style={styles.icon}>{icon}</View>
        <Text variant="bodyLarge">{label}</Text>
      </View>

      <View style={styles.right}>
        <Text variant="bodyLarge" style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  icon: {
    width: 34,
    alignItems: "center",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 12,
  },
  value: {
    opacity: 0.75,
    maxWidth: 180,
  },
  chevron: {
    fontSize: 34,
    lineHeight: 20,
    opacity: 0.45,
    marginBottom: 4,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.45,
  },
});
