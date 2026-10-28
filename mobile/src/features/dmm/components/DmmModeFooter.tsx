import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";

export type DmmFooterMode = "VOLTAGE" | "RESISTANCE" | "CONTINUITY";

type Props = {
  mode: DmmFooterMode;
  disabled: boolean;
  onModeChange: (mode: DmmFooterMode) => void;
};

const MODES = [
  { mode: "VOLTAGE", label: "Voltage", icon: "flash-outline" },
  { mode: "RESISTANCE", label: "Ohms", icon: "omega" },
  { mode: "CONTINUITY", label: "Continuity", icon: "volume-high" },
] as const;

export function DmmModeFooter({ mode, disabled, onModeChange }: Props) {
  return (
    <View style={styles.group} accessibilityRole="tablist">
      {MODES.map((item) => {
        const selected = mode === item.mode;
        return (
          <Pressable
            key={item.mode}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onModeChange(item.mode)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.selected,
              pressed && !disabled && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Icon source={item.icon} size={23} color={selected ? c.darkTeal : c.mutedText} />
            <Text style={[styles.text, { color: selected ? c.darkTeal : c.mutedText }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.mutedText,
  },
  tab: {
    flex: 1,
    minHeight: 62,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  selected: { backgroundColor: "#E7F2F4" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  text: { fontSize: 12, fontWeight: "600" },
});
