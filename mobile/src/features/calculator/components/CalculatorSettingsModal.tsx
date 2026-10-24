import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button, SegmentedButtons, Switch, Text } from "react-native-paper";
import { useCalculatorPreferences, type NumberFormat } from "../preferences/calculatorPreferences";
import { formatQuantity } from "../preferences/engineeringFormat";

export function CalculatorSettingsModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { preferences, setPreferences } = useCalculatorPreferences();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text variant="titleLarge">Calculator settings</Text>
            <Text variant="titleMedium">Significant figures: {preferences.significantFigures}</Text>
            <View style={styles.row}>
              <Button mode="outlined" disabled={preferences.significantFigures <= 2}
                onPress={() => setPreferences({ significantFigures: preferences.significantFigures - 1 })}>−</Button>
              <Text variant="titleLarge">{preferences.significantFigures}</Text>
              <Button mode="outlined" disabled={preferences.significantFigures >= 8}
                onPress={() => setPreferences({ significantFigures: preferences.significantFigures + 1 })}>+</Button>
            </View>
            <Text variant="titleMedium">Number format</Text>
            <SegmentedButtons value={preferences.numberFormat} onValueChange={value => setPreferences({ numberFormat: value as NumberFormat })}
              buttons={[{ value: "auto", label: "Auto" }, { value: "decimal", label: "Decimal" }]} />
            <SegmentedButtons value={preferences.numberFormat} onValueChange={value => setPreferences({ numberFormat: value as NumberFormat })}
              buttons={[{ value: "scientific", label: "Scientific" }, { value: "engineering", label: "Engineering" }]} />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">Use SI prefixes</Text>
                <Text variant="bodySmall">Use kΩ, mV, µF, etc. in Auto mode</Text>
              </View>
              <Switch value={preferences.useSIPrefixes} onValueChange={value => setPreferences({ useSIPrefixes: value })} />
            </View>
            <View style={styles.preview}>
              <Text variant="labelLarge">Live preview</Text>
              <Text>{formatQuantity(12345.678, "resistance", preferences)}</Text>
              <Text>{formatQuantity(0.00947302956, "voltage", preferences)}</Text>
            </View>
            <Button mode="contained" onPress={onDismiss}>Done</Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", padding: 20, justifyContent: "center" },
  card: { backgroundColor: "white", borderRadius: 16, maxHeight: "85%", overflow: "hidden" },
  content: { padding: 18, gap: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  preview: { backgroundColor: "#F2F5F6", borderRadius: 8, padding: 14, gap: 4 },
});
