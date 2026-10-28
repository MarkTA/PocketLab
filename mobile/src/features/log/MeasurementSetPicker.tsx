import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button, RadioButton, Text, TextInput } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pocketLabColors as c } from "../../themes/theme";
import { createMeasurementSet, listMeasurementSets, moveSavedMeasurement, type MeasurementSet, type SavedMeasurement } from "../dmm/storage/savedMeasurements";

type Props = {
  visible: boolean;
  measurement: SavedMeasurement | null;
  onDismiss: () => void;
  onMoved: (set: MeasurementSet) => void;
};

export function MeasurementSetPicker({ visible, measurement, onDismiss, onMoved }: Props) {
  const insets = useSafeAreaInsets();
  const [sets, setSets] = useState<MeasurementSet[]>([]);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initialSetId = measurement?.setId;
  const load = useCallback(async () => {
    try {
      const result = await listMeasurementSets();
      setSets(result);
      setSelected(initialSetId ?? result[0]?.id ?? "");
      setCreating(false);
      setNewName("");
      setError("");
    } catch { setError("Unable to load measurement sets."); }
  }, [initialSetId]);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [visible, load]);

  const apply = async () => {
    if (!measurement || busy) return;
    setBusy(true); setError("");
    try {
      let target = sets.find(set => set.id === selected);
      if (creating) target = await createMeasurementSet(newName);
      if (!target) throw new Error("Select a measurement set.");
      await moveSavedMeasurement(measurement.id, target.id);
      onMoved(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to move measurement.");
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 48) + 24 }]}>
          <Text variant="titleLarge">Organize measurement</Text>
          <Text variant="bodyMedium" style={styles.muted}>{measurement ? `${measurement.value.toPrecision(8)} ${measurement.unit}` : ""}</Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <RadioButton.Group value={creating ? "__new__" : selected} onValueChange={value => { setCreating(false); setSelected(value); }}>
              {sets.map(set => <RadioButton.Item key={set.id} label={set.name} value={set.id} />)}
            </RadioButton.Group>
            {creating ? (
              <TextInput label="New set name" value={newName} onChangeText={setNewName} autoFocus mode="outlined" maxLength={80} />
            ) : (
              <Button icon="plus" onPress={() => setCreating(true)}>Create new set</Button>
            )}
          </ScrollView>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button disabled={busy} onPress={onDismiss}>Cancel</Button>
            <Button mode="contained" loading={busy} disabled={busy || (creating ? !newName.trim() : !selected)} onPress={() => { void apply(); }}>
              {creating ? "Create & Move" : "Move & Use Set"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: "80%" },
  list: { flexGrow: 0, maxHeight: 320 },
  muted: { color: c.mutedText },
  error: { color: c.danger },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
