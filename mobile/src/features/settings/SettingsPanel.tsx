import { useEffect } from "react";
import { LayoutAnimation, Platform, ScrollView, StyleSheet, UIManager, View } from "react-native";
import { IconButton, Surface, Text } from "react-native-paper";
import { SettingsField } from "./SettingsField";
import type { SettingsDefinition, SettingValue } from "./settingsTypes";

// Expands below the app header and reflows the active screen instead of covering it.
export function SettingsPanel({ visible, definition, values, onChange, onDismiss }: {
  visible: boolean;
  definition: SettingsDefinition;
  values: Readonly<Record<string, SettingValue>>;
  onChange: (id: string, value: SettingValue) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
  }, []);
  useEffect(() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }, [visible]);
  if (!visible) return null;
  return <Surface style={styles.surface} elevation={2}>
    <View style={styles.heading}><Text variant="titleSmall">{definition.title}</Text><IconButton icon="close" size={20} accessibilityLabel="Close settings" onPress={onDismiss} /></View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {definition.fields.length ? definition.fields.map(field => <SettingsField key={field.id} field={field} value={values[field.id]} onChange={value => onChange(field.id, value)} />) : <Text variant="bodySmall">No settings available for this section yet.</Text>}
    </ScrollView>
  </Surface>;
}
const styles = StyleSheet.create({
  surface: { paddingHorizontal: 16, paddingBottom: 10, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, zIndex: 10 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  fields: { gap: 12, paddingBottom: 8 }, scroll: { maxHeight: 260, overflow: "visible" },
});
