import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Menu, SegmentedButtons, Switch, Text, TextInput } from "react-native-paper";
import type { SettingField as Field, SettingValue } from "./settingsTypes";

type Props = { field: Field; value: SettingValue | undefined; onChange: (value: SettingValue) => void };

export function SettingsField({ field, value, onChange }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [numberDraft, setNumberDraft] = useState<string | null>(null);
  const title = <View style={styles.labelArea}><Text variant="bodyMedium">{field.label}</Text>{field.description ? <Text variant="bodySmall" style={styles.description}>{field.description}</Text> : null}</View>;

  if (field.type === "switch") return <View style={styles.row}>{title}<Switch accessibilityLabel={field.label} value={value === true} onValueChange={onChange} /></View>;

  if (field.type === "segmented") return <View style={styles.stack}>{title}<SegmentedButtons density="small" value={String(value ?? "")} onValueChange={onChange} buttons={field.options.map(option => ({ label: option.label, value: String(option.value) }))} /></View>;

  if (field.type === "select") {
    const selected = field.options.find(option => option.value === value);
    return <View style={styles.row}>{title}<Menu visible={menuVisible} onDismiss={() => setMenuVisible(false)} anchor={<Button compact mode="outlined" onPress={() => setMenuVisible(true)} accessibilityLabel={`Select ${field.label}`}>{selected?.label ?? "Select"}</Button>}>
      {field.options.map(option => <Menu.Item key={String(option.value)} title={option.label} onPress={() => { setMenuVisible(false); onChange(option.value); }} />)}
    </Menu></View>;
  }

  const shown = numberDraft ?? String(value ?? "");
  const commit = () => {
    setNumberDraft(null);
    if (!shown.trim()) return;
    const parsed = Number(shown);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, parsed));
    onChange(clamped);
  };
  return <View style={styles.row}>{title}<TextInput style={styles.number} dense mode="outlined" accessibilityLabel={field.label} keyboardType="decimal-pad" value={shown} onChangeText={setNumberDraft} onBlur={commit} onSubmitEditing={commit} /></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 },
  stack: { gap: 8 }, labelArea: { flex: 1, minWidth: 0 }, description: { opacity: 0.7 },
  number: { minWidth: 92, maxWidth: 120, height: 42 },
});
