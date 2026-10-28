import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { ActivityIndicator, Button, IconButton, Text, TextInput } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";
import { useAppShell } from "@/features/appShell/AppShellContext";
import { MeasurementSetPicker } from "@/features/log/MeasurementSetPicker";
import {
  deleteSavedMeasurement, listMeasurementSets, listSavedMeasurements, updateMeasurementDetails,
  type MeasurementSet, type SavedMeasurement,
} from "@/features/dmm/storage/savedMeasurements";

const formatValue = (item: SavedMeasurement) => {
  const a = Math.abs(item.value);
  if (item.kind === "resistance") return a >= 1e6 ? `${(item.value / 1e6).toPrecision(6)} MΩ` : a >= 1e3 ? `${(item.value / 1e3).toPrecision(6)} kΩ` : `${item.value.toPrecision(6)} Ω`;
  return a > 0 && a < 0.001 ? `${(item.value * 1e6).toPrecision(6)} µV` : a > 0 && a < 1 ? `${(item.value * 1e3).toPrecision(6)} mV` : `${item.value.toPrecision(7)} V`;
};

export default function LogRoute() {
  const focused = useIsFocused();
  const { refreshSavedCount } = useAppShell();
  const [sets, setSets] = useState<MeasurementSet[]>([]);
  const [readings, setReadings] = useState<SavedMeasurement[]>([]);
  const [currentSet, setCurrentSet] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedMeasurement | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [moving, setMoving] = useState<SavedMeasurement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [nextSets, nextReadings] = await Promise.all([listMeasurementSets(), listSavedMeasurements()]);
      setSets(nextSets);
      setReadings(nextReadings);
      setError("");
      await refreshSavedCount();
    } catch { setError("Unable to load measurements."); }
    finally { setBusy(false); }
  }, [refreshSavedCount]);

  useEffect(() => {
    if (!focused) return;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [focused, refresh]);
  const current = sets.find(set => set.id === currentSet);
  const visible = readings.filter(item => item.setId === currentSet);

  const remove = (item: SavedMeasurement) => Alert.alert(
    "Delete measurement?", `Delete ${formatValue(item)}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void (async () => {
        try { await deleteSavedMeasurement(item.id); await refresh(); }
        catch { setError("Unable to delete measurement."); }
      })(); } },
    ]
  );

  const saveDetails = async () => {
    if (!editing) return;
    setBusy(true);
    try { await updateMeasurementDetails(editing.id, label, notes); setEditing(null); await refresh(); }
    catch { setError("Unable to update measurement."); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {currentSet && <IconButton icon="arrow-left" onPress={() => { setCurrentSet(null); setEditing(null); }} />}
        <View style={{ flex: 1 }}><Text variant="headlineSmall">{current?.name ?? "Measurement Sets"}</Text>
          <Text style={styles.muted}>{currentSet ? `${visible.length} readings` : `${sets.length} sets · ${readings.length} saved readings`}</Text></View>
        <IconButton icon="refresh" disabled={busy} onPress={() => { void refresh(); }} />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {busy && !readings.length && <ActivityIndicator />}
      {!currentSet ? (
        <ScrollView contentContainerStyle={styles.list}>
          {sets.map(set => {
            const count = readings.filter(item => item.setId === set.id).length;
            return <Pressable key={set.id} style={styles.card} accessibilityRole="button" onPress={() => setCurrentSet(set.id)}>
              <View style={styles.row}><View style={{ flex: 1 }}><Text variant="titleMedium">{set.name}</Text><Text style={styles.muted}>{count} {count === 1 ? "measurement" : "measurements"}</Text></View><IconButton icon="chevron-right" onPress={() => setCurrentSet(set.id)} /></View>
            </Pressable>;
          })}
          <Text style={styles.muted}>Save a reading from Measure, then use Change to create a new set.</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No measurements in this set yet.</Text>}
          renderItem={({ item }) => <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}><Text variant="titleLarge" style={styles.value}>{formatValue(item)}</Text>
                {!!item.label && <Text variant="titleSmall">{item.label}</Text>}
                <Text style={styles.muted}>{new Date(item.measuredAt).toLocaleString()} · {item.kind}</Text>
                {item.averagingWindowMs !== undefined && <Text style={styles.muted}>{item.averagingWindowMs} ms average</Text>}
              </View>
              <IconButton icon="pencil-outline" accessibilityLabel="Edit measurement" onPress={() => { setEditing(item); setLabel(item.label ?? ""); setNotes(item.notes ?? ""); }} />
              <IconButton icon="folder-move-outline" accessibilityLabel="Move measurement" onPress={() => setMoving(item)} />
              <IconButton icon="delete-outline" accessibilityLabel="Delete measurement" onPress={() => remove(item)} />
            </View>
            {!!item.notes && <Text style={styles.muted}>{item.notes}</Text>}
            {editing?.id === item.id && <View style={styles.editor}>
              <TextInput mode="outlined" label="Label" value={label} onChangeText={setLabel} />
              <TextInput mode="outlined" label="Notes" value={notes} onChangeText={setNotes} multiline />
              <View style={styles.row}><Button onPress={() => setEditing(null)}>Cancel</Button><Button disabled={busy} mode="contained" onPress={() => { void saveDetails(); }}>Save changes</Button></View>
            </View>}
          </View>}
        />
      )}
      <MeasurementSetPicker visible={moving !== null} measurement={moving} onDismiss={() => setMoving(null)} onMoved={() => { setMoving(null); void refresh(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.grid },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.grid },
  row: { flexDirection: "row", alignItems: "center" },
  value: { color: c.darkTeal, fontVariant: ["tabular-nums"] },
  muted: { color: c.mutedText }, error: { color: c.danger, padding: 12 },
  editor: { marginTop: 12, gap: 10 },
});
