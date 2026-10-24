import { useMemo, useState } from "react";
import { Keyboard, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button, IconButton, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";
import { CalculatorPreferencesProvider, useCalculatorPreferences } from "../../preferences/calculatorPreferences";
import { formatQuantity } from "../../preferences/engineeringFormat";
import { CalculatorSettingsModal } from "../../components/CalculatorSettingsModal";
import { InteractiveDividerEquation } from "./InteractiveDividerEquation";
import { listSavedMeasurements, type SavedMeasurement } from "../../../dmm/storage/savedMeasurements";
import { VoltageDividerSchematic } from "./VoltageDividerSchematic";
import { dividerIds, solveDivider, type DividerMode, type DividerValues, type VariableId } from "./interactiveDividerMath";

type Source = "manual" | "measurement";
type Entry = { value: number; source: Source; measurementId?: string };
type Entries = Partial<Record<VariableId, Entry>>;
type Unit = { label: string; factor: number };
const voltageUnits: Unit[] = [
  { label: "µV", factor: 1e-6 }, { label: "mV", factor: 1e-3 },
  { label: "V", factor: 1 }, { label: "kV", factor: 1e3 },
];
const resistanceUnits: Unit[] = [
  { label: "Ω", factor: 1 }, { label: "kΩ", factor: 1e3 }, { label: "MΩ", factor: 1e6 },
];
const info: Record<VariableId, { name: string; title: string; kind: "voltage" | "resistance" }> = {
  vin: { name: "Vin", title: "Input voltage", kind: "voltage" },
  vout: { name: "Vout", title: "Output voltage", kind: "voltage" },
  r1: { name: "R1", title: "Upper resistor", kind: "resistance" },
  r2: { name: "R2", title: "Lower resistor", kind: "resistance" },
  rl: { name: "RL", title: "Load resistor", kind: "resistance" },
};
const emptyUnits: Record<VariableId, string> = { vin: "V", vout: "V", r1: "kΩ", r2: "kΩ", rl: "kΩ" };
function formatted(id: VariableId, value: number, preferences: ReturnType<typeof useCalculatorPreferences>["preferences"]) {
  return formatQuantity(value, info[id].kind, preferences);
}

/** The ordered ids are the independent inputs. One remaining id is calculated. */
export function VoltageDividerTool() {
  return <CalculatorPreferencesProvider><VoltageDividerToolContent /></CalculatorPreferencesProvider>;
}

function VoltageDividerToolContent() {
  const { preferences } = useCalculatorPreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<DividerMode>("unloaded");
  const [entries, setEntries] = useState<Entries>({});
  const [order, setOrder] = useState<VariableId[]>([]);
  const [preferredCalculated, setPreferredCalculated] = useState<VariableId | null>(null);
  const [editing, setEditing] = useState<VariableId | null>(null);
  const [editMode, setEditMode] = useState<"set" | "calculate">("set");
  const [draft, setDraft] = useState("");
  const [unit, setUnit] = useState("V");
  const [unitMenu, setUnitMenu] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedMeasurement[]>([]);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [pendingMeasurement, setPendingMeasurement] = useState<SavedMeasurement | null>(null);

  const ids = useMemo(() => dividerIds(mode), [mode]);
  const unknown = preferredCalculated && !order.includes(preferredCalculated) ? preferredCalculated
    : ids.find(id => !order.includes(id)) ?? null;
  const ready = order.length === ids.length - 1 && unknown !== null;
  const inputs = useMemo(() => {
    const result: DividerValues = {};
    for (const id of order) { const entry = entries[id]; if (entry) result[id] = entry.value; }
    return result;
  }, [entries, order]);
  const calculation = useMemo(
    () => ready && unknown ? solveDivider(mode, unknown, inputs) : null,
    [ready, unknown, mode, inputs],
  );
  const values: DividerValues = { ...inputs };
  if (unknown && calculation?.ok) values[unknown] = calculation.value;
  const displayValues: Record<string, string> = {};
  const states: Record<string, "entered" | "measured" | "calculated" | "empty"> = {};
  for (const id of ids) {
    const value = values[id];
    if (value !== undefined) displayValues[id] = formatted(id, value, preferences);
    const entry = entries[id];
    states[id] = order.includes(id) ? (entry?.source === "measurement" ? "measured" : "entered")
      : value !== undefined ? "calculated" : "empty";
  }
  states.voutTap = states.vout ?? "empty";

  function changeMode(next: DividerMode) {
    if (next === mode) return;
    // Intentional: switching circuit variations starts a new design.
    setMode(next);
    setEntries({});
    setOrder([]);
    setPreferredCalculated(null);
    setEditing(null);
  }
  function openEditor(id: VariableId) {
    if (!ids.includes(id)) return;
    const current = values[id];
    const units = info[id].kind === "voltage" ? voltageUnits : resistanceUnits;
    const defaultUnit = units.find(u => u.label === emptyUnits[id]) ?? units[0];
    setUnit(defaultUnit.label);
    setDraft(current === undefined ? "" : String(Number((current / defaultUnit.factor).toPrecision(9))));
    setPendingMeasurement(null);
    setEditMode(unknown === id && ready ? "calculate" : "set");
    setError("");
    setEditing(id);
  }
  function closeEditor() { setEditing(null); setMeasurementOpen(false); setPendingMeasurement(null); setUnitMenu(false); }
  function chooseCalculated() {
    if (!editing) return;
    const id = editing;
    const remaining = ids.filter(candidate => candidate !== id && entries[candidate] !== undefined);
    if (remaining.length < ids.length - 1) {
      setError(`Set the other ${ids.length - 1} variables before calculating ${info[id].name}.`);
      return;
    }
    const nextEntries = { ...entries };
    delete nextEntries[id];
    setEntries(nextEntries);
    setOrder(order.filter(candidate => candidate !== id));
    setPreferredCalculated(id);
    closeEditor();
  }
  function applyValue(value: number, source: Source, measurementId?: string) {
    if (!editing) return;
    if (!Number.isFinite(value) || value <= 0) { setError("Enter a positive, finite value."); return; }
    const id = editing;
    const next = { ...entries, [id]: { value, source, measurementId } };
    let nextOrder = [...order.filter(candidate => candidate !== id), id];
    if (nextOrder.length >= ids.length) {
      const displaced = nextOrder.shift();
      if (displaced) delete next[displaced];
    }
    setEntries(next);
    setOrder(nextOrder);
    setPreferredCalculated(null);
    Keyboard.dismiss();
    closeEditor();
  }
  function applyEdit() {
    if (editMode === "calculate") { chooseCalculated(); return; }
    if (pendingMeasurement) { applyValue(pendingMeasurement.value, "measurement", pendingMeasurement.id); return; }
    const parsed = Number(draft.trim());
    const units = editing && info[editing].kind === "voltage" ? voltageUnits : resistanceUnits;
    const factor = units.find(item => item.label === unit)?.factor ?? 1;
    applyValue(draft.trim() === "" ? Number.NaN : parsed * factor, "manual");
  }
  async function openMeasurements() {
    setMeasurementOpen(true);
    setLoadingSaved(true);
    setError("");
    try { setSaved(await listSavedMeasurements()); }
    catch { setError("Could not load saved measurements."); }
    finally { setLoadingSaved(false); }
  }
  const filtered = saved.filter(item => editing && item.kind === info[editing].kind && Number.isFinite(item.value));
  const units = editing && info[editing].kind === "voltage" ? voltageUnits : resistanceUnits;

  return <View style={styles.card}>
    <View style={styles.settingsRow}><Text variant="titleSmall">Voltage divider</Text><IconButton icon="cog-outline" accessibilityLabel="Calculator settings" onPress={() => setSettingsOpen(true)} /></View>
    <CalculatorSettingsModal visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
    <SegmentedButtons value={mode} onValueChange={v => changeMode(v as DividerMode)} buttons={[
      { value: "unloaded", label: "Unloaded" }, { value: "loaded", label: "Loaded" },
    ]} />
    <InteractiveDividerEquation mode={mode} values={displayValues} onVariablePress={openEditor} />
    <Text style={styles.hint}>Tap a resistor or voltage terminal to set a value or calculate it.</Text>
    <VoltageDividerSchematic mode={mode} values={displayValues} states={states}
      showGrid={false} onVariablePress={openEditor} />
    <View style={styles.legend}>
      <Text style={{ color: c.darkTeal }}>● Set value</Text>
      <Text style={{ color: "#2563EB" }}>● Saved measurement</Text>
      <Text style={styles.hint}>● Calculated</Text>
    </View>
    {calculation?.ok === false && <Text style={styles.error}>{calculation.error}</Text>}
    {!ready && <Text style={styles.hint}>Set {ids.length - 1 - order.length} more value(s) to solve the remaining variable.</Text>}
    {ready && calculation?.ok && unknown && <Text variant="titleMedium">Calculated {info[unknown].name}: {formatted(unknown, calculation.value, preferences)}</Text>}
    <Button onPress={() => { setEntries({}); setOrder([]); setPreferredCalculated(null); }}>Reset values</Button>
    <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEditor}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text variant="titleLarge">{editing ? `${info[editing].title} (${info[editing].name})` : "Edit"}</Text>
          <SegmentedButtons value={editMode} onValueChange={v => { setEditMode(v as "set" | "calculate"); setError(""); }} buttons={[
            { value: "set", label: "Set Value" }, { value: "calculate", label: "Calculate" },
          ]} />
          {editMode === "set" ? <>
            <View style={styles.inputRow}>
              <TextInput style={styles.numberInput} mode="outlined" label="Value" value={draft}
                onChangeText={text => { setDraft(text); setPendingMeasurement(null); setError(""); }}
                keyboardType="decimal-pad" selectTextOnFocus />
              <Button mode="outlined" style={styles.unitButton} onPress={() => { Keyboard.dismiss(); setUnitMenu(true); }}>
                {unit} ▾
              </Button>
            </View>
            <Button icon="bookmark-outline" onPress={openMeasurements}>
              {pendingMeasurement ? "Change saved measurement" : "Use saved measurement"}
            </Button>
            {pendingMeasurement && <Text style={styles.hint}>Selected: {formatted(editing ?? "vin", pendingMeasurement.value, preferences)}</Text>}
          </> : <Text style={styles.hint}>Calculate this variable using the other {ids.length - 1} values.</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button onPress={closeEditor}>Cancel</Button>
            <Button mode="contained" onPress={applyEdit}>{editMode === "set" ? "Save" : "Calculate"}</Button>
          </View>
        </View>
      </View>
    </Modal>
    {/* A separate native Modal avoids React Native Paper Menu being clipped
        or rendered beneath the editor's React Native Modal on Android. */}
    <Modal visible={unitMenu} transparent animationType="fade" onRequestClose={() => setUnitMenu(false)}>
      <View style={styles.backdrop}>
        <View style={styles.unitPicker}>
          <Text variant="titleMedium">Select unit</Text>
          {units.map(option => (
            <Button key={option.label} mode={option.label === unit ? "contained-tonal" : "text"}
              onPress={() => {
                const oldFactor = units.find(u => u.label === unit)?.factor ?? 1;
                const previous = Number(draft);
                if (draft.trim() && Number.isFinite(previous)) {
                  setDraft(String(Number((previous * oldFactor / option.factor).toPrecision(10))));
                }
                setUnit(option.label);
                setUnitMenu(false);
              }}>
              {option.label}
            </Button>
          ))}
          <Button onPress={() => setUnitMenu(false)}>Cancel</Button>
        </View>
      </View>
    </Modal>
    <Modal visible={measurementOpen} transparent animationType="slide" onRequestClose={() => setMeasurementOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.picker}>
          <Text variant="titleLarge">Saved {editing ? info[editing].kind : ""} measurements</Text>
          <Text style={styles.hint}>Choose a reading to import its exact value.</Text>
          <ScrollView style={styles.savedList}>
            {loadingSaved ? <Text>Loading…</Text> : filtered.length === 0 ? <Text>No matching measurements saved yet.</Text>
              : filtered.map(item => <Button key={item.id} style={styles.savedRow} contentStyle={styles.savedRowContent}
                  onPress={() => {
                    setPendingMeasurement(item);
                    const matching = units.find(u => u.label === emptyUnits[editing ?? "vin"]) ?? units[0];
                    setUnit(matching.label);
                    setDraft(String(Number((item.value / matching.factor).toPrecision(10))));
                    setMeasurementOpen(false);
                    setEditMode("set");
                  }}>
                  {formatted(editing ?? "vin", item.value, preferences)} · {new Date(item.measuredAt).toLocaleString()}
                </Button>)}
          </ScrollView>
          <Button onPress={() => setMeasurementOpen(false)}>Back</Button>
        </View>
      </View>
    </Modal>
    <Text style={styles.hint}>Ideal DC divider. Check resistor ratings, tolerances, and loading before building.</Text>
  </View>;
}

const styles = StyleSheet.create({
  settingsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -12 },
  card: { padding: 16, backgroundColor: c.surface, gap: 12, borderRadius: 12 },
  hint: { color: c.mutedText },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  error: { color: "#B42318" },
  backdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: c.surface, padding: 18, borderRadius: 14, gap: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  numberInput: { flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  unitButton: { justifyContent: "center", minWidth: 92 },
  unitPicker: { backgroundColor: c.surface, padding: 20, borderRadius: 14, gap: 8, alignSelf: "center", width: "80%", maxWidth: 320 },
  picker: { backgroundColor: c.surface, padding: 18, borderRadius: 14, gap: 12, maxHeight: "75%" },
  savedList: { flexGrow: 0 },
  savedRow: { marginVertical: 4 },
  savedRowContent: { justifyContent: "flex-start" },
});
