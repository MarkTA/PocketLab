/* src/features/dmm/components/DmmModeFooter.tsx */
import { StyleSheet, View } from "react-native";
import { Button } from "react-native-paper";
import { pocketLabColors as c } from "../../../themes/theme";

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
    <View style={styles.footer} accessibilityRole="tablist">
      {MODES.map((item) => (
        <Button
          key={item.mode}
          mode="text"
          compact
          icon={item.icon}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === item.mode, disabled }}
          disabled={disabled}
          style={[styles.tab, mode === item.mode && styles.tabSelected]}
          contentStyle={styles.tabContent}
          labelStyle={styles.tabLabel}
          textColor={c.surface}
          onPress={() => onModeChange(item.mode)}
        >
          {item.label}
        </Button>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: c.darkTeal,
    backgroundColor: c.darkTeal,
  },
  tab: { flex: 1, borderRadius: 0 },
  tabSelected: { borderTopWidth: 3, borderTopColor: c.green },
  tabContent: { minHeight: 56, paddingHorizontal: 0, flexDirection: "column" },
  tabLabel: { fontSize: 11, marginHorizontal: 0 },
});
