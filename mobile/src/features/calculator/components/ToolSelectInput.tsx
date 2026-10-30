import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Button, Menu, Text } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";

export type ToolSelectOption = { value: string; label: string };
export type ToolSelectConfig = { id: string; label: string; options: ToolSelectOption[]; defaultValue: string };

/** Reusable bounded selector for circuit order, component count, topology, etc. */
export function ToolSelectInput({ config, value, onChange }: {
  config: ToolSelectConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = config.options.find(option => option.value === value)?.label ?? value;
  return <View style={styles.row}>
    <Text style={styles.caption}>{config.label}</Text>
    <Menu visible={open} onDismiss={() => setOpen(false)} anchor={<Button mode="outlined" compact icon="chevron-down" contentStyle={styles.buttonContent} onPress={() => setOpen(true)}>{label}</Button>}>
      {config.options.map(option => <Menu.Item key={option.value} title={option.label} onPress={() => { setOpen(false); onChange(option.value); }} />)}
    </Menu>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 8, backgroundColor: c.surface },
  caption: { fontSize: 14, fontWeight: "600", color: c.darkTeal },
  buttonContent: { flexDirection: "row-reverse", minHeight: 36 },
});
