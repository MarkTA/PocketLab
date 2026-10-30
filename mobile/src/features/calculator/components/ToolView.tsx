import { useMemo, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, SegmentedButtons, Snackbar, Text, TextInput } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";
import { useCalculatorPreferences } from "../preferences/calculatorPreferences";
import { formatQuantity } from "../preferences/engineeringFormat";
import { InteractiveEquation } from "./InteractiveEquation";
import { listSavedMeasurements, type SavedMeasurement } from "../../dmm/storage/savedMeasurements";
import { SchematicView } from "./SchematicView";
import { ToolVariantTabs } from "./ToolVariantTabs";
import type { ToolConfig } from "../registry/types";
import { CollectionToolView } from "./CollectionToolView";


type Source = "manual" | "measurement";
type Entry = { value: number; source: Source; measurementId?: string };
type VariableId = string;
type Entries = Partial<Record<VariableId, Entry>>;
type Unit = { label: string; factor: number };
const voltageUnits: Unit[] = [
  { label: "µV", factor: 1e-6 }, { label: "mV", factor: 1e-3 },
  { label: "V", factor: 1 }, { label: "kV", factor: 1e3 },
];
const currentUnits: Unit[] = [
  { label: "µA", factor: 1e-6 }, { label: "mA", factor: 1e-3 }, { label: "A", factor: 1 },
];
const powerUnits: Unit[] = [
  { label: "µW", factor: 1e-6 }, { label: "mW", factor: 1e-3 }, { label: "W", factor: 1 },
];
const resistanceUnits: Unit[] = [
  { label: "Ω", factor: 1 }, { label: "kΩ", factor: 1e3 }, { label: "MΩ", factor: 1e6 },
];
function unitsForKind(kind: ToolConfig["variables"][string]["kind"]): Unit[] {
  switch (kind) {
    case "voltage": return voltageUnits;
    case "resistance": return resistanceUnits;
    case "current": return currentUnits;
    case "power": return powerUnits;
  }
}
function formatted(id: VariableId, value: number, preferences: ReturnType<typeof useCalculatorPreferences>["preferences"], config: ToolConfig) {
  return formatQuantity(value, config.variables[id].kind, preferences);
}

/** The ordered ids are the independent inputs. One remaining id is calculated. */
export function ToolView({ config }: { config: ToolConfig }) {
  return config.collection ? <CollectionToolView collection={config.collection} /> : <EquationToolView config={config} />;
}

function EquationToolView({ config }: { config: ToolConfig }) {
  const { preferences } = useCalculatorPreferences();
  const [mode, setMode] = useState<string>(config.defaultMode);
  const [equationVariants, setEquationVariants] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<Entries>({});
  const [order, setOrder] = useState<VariableId[]>([]);
  const [preferredCalculated, setPreferredCalculated] = useState<VariableId | null>(config.defaultSolveFor);
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
  const [priorityNotice, setPriorityNotice] = useState("");

  const activeMode = config.modes.find(item => item.id === mode) ?? config.modes[0];
  const variant = activeMode.variants?.find(item => item.id === equationVariants[mode]) ?? activeMode.variants?.[0];
  const ids = variant?.variables ?? activeMode.variables;
  const capacity = typeof config.independentInputs === "function"
    ? config.independentInputs(mode) : config.independentInputs ?? activeMode.variables.length - 1;
  const activeOrder = order.filter(id => activeMode.variables.includes(id));
  const inputs = useMemo(() => {
    const result: Record<string, number> = {};
    for (const id of order) {
      const entry = entries[id];
      if (entry) result[id] = entry.value;
    }
    return result;
  }, [entries, order]);
  // Derived values have no independent state: they are recomputed on every input change.
  const resolved = useMemo(() => config.resolveValues?.(inputs, mode) ?? inputs,
    [config, inputs, mode]);
  const unknown = preferredCalculated && ids.includes(preferredCalculated) && !activeOrder.includes(preferredCalculated)
    ? preferredCalculated : ids.find(id => !activeOrder.includes(id)) ?? null;
  const target: VariableId = unknown ?? preferredCalculated ?? config.defaultSolveFor;
  const neededIds = ids.filter(id => id !== target);
  const canSolve = neededIds.every(id => Number.isFinite(resolved[id]));
  const calculation = canSolve && ids.includes(target) && !activeOrder.includes(target)
    ? config.solve(mode, target, resolved, variant?.id) : null;
  const values: Record<string, number> = { ...resolved };
  if (calculation?.ok) values[target] = calculation.value;
  // Presentation is scoped to the selected equation, not to the last
  // calculated variable in a different mode. Inactive variables still carry
  // derived values; they simply cannot be edited from this schematic.
  const schematicStates: Record<string, "entered" | "measured" | "calculated" | "empty" | "inactive"> = {};
  for (const id of Object.keys(config.variables)) {
    schematicStates[id] = !ids.includes(id) ? "inactive" : id === target ? "calculated" : "entered";
  }
  for (const [alias, id] of Object.entries(activeMode.schematic.aliases ?? {})) {
    schematicStates[alias] = schematicStates[id];
  }
  const displayValues: Record<string, string> = {};
  const states: Record<string, "entered" | "measured" | "calculated" | "empty"> = {};
  for (const id of Object.keys(config.variables)) {
    const value = values[id];
    if (Number.isFinite(value)) displayValues[id] = formatted(id, value, preferences, config);
    const entry = entries[id];
    states[id] = order.includes(id) ? (entry?.source === "measurement" ? "measured" : "entered")
      : Number.isFinite(value) ? "calculated" : "empty";
  }

  function changeMode(next: string) {
    if (next === mode) return;
    setMode(next);
    // Inputs are circuit-wide, not owned by a mode. An absent target is chosen
    // in the new mode without clearing values saved for other modes.
    setPreferredCalculated(next === "power" && config.variables.power ? "power" : config.defaultSolveFor);
    setEditing(null);
  }
  function openEditor(id: VariableId) {
    if (!ids.includes(id)) return;
    const current = values[id];
    const units = unitsForKind(config.variables[id].kind);
    const defaultUnit = units.find(u => u.label === config.variables[id].defaultUnit) ?? units[0];
    setUnit(defaultUnit.label);
    setDraft(current === undefined ? "" : String(Number((current / defaultUnit.factor).toPrecision(9))));
    setPendingMeasurement(null);
    setEditMode("set");
    setError("");
    setEditing(id);
  }
  function closeEditor() { setEditing(null); setMeasurementOpen(false); setPendingMeasurement(null); setUnitMenu(false); }
  function chooseCalculated() {
    if (!editing) return;
    const id = editing;
    const nextEntries = { ...entries };
    delete nextEntries[id];
    setEntries(nextEntries);
    setOrder(order.filter(candidate => candidate !== id));
    setPriorityNotice("");
    setPreferredCalculated(id);
    closeEditor();
  }
  function applyValue(value: number, source: Source, measurementId?: string) {
    if (!editing) return;
    if (!Number.isFinite(value) || (config.variables[editing].kind === "resistance" && value <= 0)) {
      setError("Enter a valid finite value (resistance must be positive).");
      return;
    }
    const id = editing;
    const next = { ...entries, [id]: { value, source, measurementId } };
    const nextOrder = [...order.filter(candidate => candidate !== id), id];
    const activeInputs = nextOrder.filter(candidate => activeMode.variables.includes(candidate));
    if (activeInputs.length > capacity) {
      const displaced = activeInputs[0];
      delete next[displaced];
      nextOrder.splice(nextOrder.indexOf(displaced), 1);
      setPreferredCalculated(displaced);
      setPriorityNotice(`Now calculating ${config.variables[displaced].name}`);
    } else {
      setPriorityNotice("");
      if (id === preferredCalculated) setPreferredCalculated(null);
    }
    setEntries(next);
    setOrder(nextOrder);
    Keyboard.dismiss();
    closeEditor();
  }
  function applyEdit() {
    if (editMode === "calculate") { chooseCalculated(); return; }
    if (pendingMeasurement) { applyValue(pendingMeasurement.value, "measurement", pendingMeasurement.id); return; }
    const parsed = Number(draft.trim());
    const units = editing ? unitsForKind(config.variables[editing].kind) : voltageUnits;
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
  const filtered = saved.filter(item => editing && item.kind === config.variables[editing].kind && Number.isFinite(item.value));
  const units = editing ? unitsForKind(config.variables[editing].kind) : voltageUnits;

  return <View style={styles.screen}>
    <View style={styles.modeBar} accessibilityRole="tablist">
      {config.modes.map(variant => {
        const selected = mode === variant.id;
        return <Pressable key={variant.id} accessibilityRole="tab"
          accessibilityState={{ selected }} onPress={() => changeMode(variant.id)}
          style={({ pressed }) => [styles.modeTab, selected && styles.modeTabSelected, pressed && styles.modeTabPressed]}>
          <Text style={[styles.modeTabLabel, { color: selected ? c.darkTeal : c.mutedText }]}>
            {variant.label}
          </Text>
        </Pressable>;
      })}
    </View>
    {activeMode.variants && activeMode.variants.length > 0 && (
      <ToolVariantTabs
        variants={activeMode.variants}
        selectedId={variant?.id ?? activeMode.variants[0].id}
        onSelect={id => {
          if (id === variant?.id) return;
          // Variant changes only presentation; entered circuit values persist.
          setEquationVariants(previous => ({ ...previous, [mode]: id }));
          setPreferredCalculated(activeMode.variants?.find(item => item.id === id)?.variables.includes("power") ? "power" : config.defaultSolveFor);
        }}
      />
    )}
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator
      overScrollMode="always"
    >
    <Text style={styles.instruction}>Tap to edit</Text>
    <SchematicView config={activeMode.schematic} values={displayValues} states={schematicStates} onVariablePress={openEditor} />
    <InteractiveEquation key={`${mode}:${target}`} expression={(variant?.equations ?? activeMode.equations)[target]} calculated={target} labels={Object.fromEntries(Object.entries(config.variables).map(([id, variable]) => [id, variable.mathLabel]))} values={displayValues} onVariablePress={openEditor} />
    <View style={styles.resultArea}>
      {calculation?.ok && !activeOrder.includes(target)
        ? <Text style={styles.calculatedResult}>{config.variables[target].name} = {formatted(target, calculation.value, preferences, config)}</Text>
        : <Text style={styles.pendingResult}>{config.variables[target].name} = —</Text>}
      {calculation?.ok === false && <Text style={styles.error}>{calculation.error}</Text>}
    </View>
    <Button compact mode="text" icon="refresh" onPress={() => { setEntries({}); setOrder([]); setPreferredCalculated(config.defaultSolveFor); setPriorityNotice(""); }}>Reset</Button>
    </ScrollView>
    <Snackbar visible={!!priorityNotice} onDismiss={() => setPriorityNotice("")} duration={2600}>
      {priorityNotice}
    </Snackbar>
    <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={closeEditor}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text variant="titleLarge">{editing ? `${config.variables[editing].title} (${config.variables[editing].name})` : "Edit"}</Text>
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
            {pendingMeasurement && <Text style={styles.hint}>Selected: {formatted(editing ?? config.defaultSolveFor, pendingMeasurement.value, preferences, config)}</Text>}
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
          <Text variant="titleLarge">Saved {editing ? config.variables[editing].kind : ""} measurements</Text>
          <Text style={styles.hint}>Choose a reading to import its exact value.</Text>
          <ScrollView style={styles.savedList}>
            {loadingSaved ? <Text>Loading…</Text> : filtered.length === 0 ? <Text>No matching measurements saved yet.</Text>
              : filtered.map(item => <Button key={item.id} style={styles.savedRow} contentStyle={styles.savedRowContent}
                  onPress={() => {
                    setPendingMeasurement(item);
                    const matching = units.find(u => u.label === config.variables[editing ?? config.defaultSolveFor].defaultUnit) ?? units[0];
                    setUnit(matching.label);
                    setDraft(String(Number((item.value / matching.factor).toPrecision(10))));
                    setMeasurementOpen(false);
                    setEditMode("set");
                  }}>
                  {formatted(editing ?? config.defaultSolveFor, item.value, preferences, config)} · {new Date(item.measuredAt).toLocaleString()}
                </Button>)}
          </ScrollView>
          <Button onPress={() => setMeasurementOpen(false)}>Back</Button>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  modeBar: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.mutedText },
  modeTab: { flex: 1, height: 46, justifyContent: "center", alignItems: "center" },
  modeTabSelected: { backgroundColor: "#E7F2F4" },
  modeTabPressed: { opacity: 0.75 },
  modeTabLabel: { fontSize: 14, fontWeight: "600" },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, gap: 4 },
  instruction: { alignSelf: "flex-end", textAlign: "right", color: c.mutedText, fontSize: 11, fontStyle: "italic", marginRight: 4 },
  resultArea: { alignItems: "center", minHeight: 54, justifyContent: "center", gap: 6 },
  calculatedResult: { color: c.orange, fontSize: 29, fontWeight: "600", textAlign: "center" },
  pendingResult: { color: c.mutedText, fontSize: 25, textAlign: "center" },
  hint: { color: c.mutedText },
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
