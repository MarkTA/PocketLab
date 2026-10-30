import { pocketLabColors as c } from "@/themes/theme";
import { useMemo, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, SegmentedButtons, Snackbar, Text, TextInput } from "react-native-paper";
import {
  listSavedMeasurements,
  type SavedMeasurement,
} from "../../dmm/storage/savedMeasurements";
import { useCalculatorPreferences } from "../preferences/calculatorPreferences";
import { formatQuantity } from "../preferences/engineeringFormat";
import type { ToolCalculationContext, ToolConfig } from "../registry/types";

import { InteractiveEquation } from "./InteractiveEquation";
import { SchematicView } from "./SchematicView";
import { ToolSelectInput } from "./ToolSelectInput";
import { ToolVariantTabs } from "./ToolVariantTabs";

type Source = "manual" | "measurement";
type Entry = { value: number; source: Source; measurementId?: string };
type VariableId = string;
type Entries = Partial<Record<VariableId, Entry>>;
type Unit = { label: string; factor: number };
const voltageUnits: Unit[] = [
  { label: "µV", factor: 1e-6 },
  { label: "mV", factor: 1e-3 },
  { label: "V", factor: 1 },
  { label: "kV", factor: 1e3 },
];
const currentUnits: Unit[] = [
  { label: "µA", factor: 1e-6 },
  { label: "mA", factor: 1e-3 },
  { label: "A", factor: 1 },
];
const powerUnits: Unit[] = [
  { label: "µW", factor: 1e-6 },
  { label: "mW", factor: 1e-3 },
  { label: "W", factor: 1 },
];
const resistanceUnits: Unit[] = [
  { label: "Ω", factor: 1 },
  { label: "kΩ", factor: 1e3 },
  { label: "MΩ", factor: 1e6 },
];
function unitsForKind(kind: ToolConfig["variables"][string]["kind"]): Unit[] {
  switch (kind) {
    case "capacitance":
      return [
        { label: "pF", factor: 1e-12 },
        { label: "nF", factor: 1e-9 },
        { label: "µF", factor: 1e-6 },
        { label: "mF", factor: 1e-3 },
        { label: "F", factor: 1 },
      ];
    case "inductance":
      return [
        { label: "µH", factor: 1e-6 },
        { label: "mH", factor: 1e-3 },
        { label: "H", factor: 1 },
      ];
    case "voltage":
      return voltageUnits;
    case "resistance":
      return resistanceUnits;
    case "current":
      return currentUnits;
    case "power":
      return powerUnits;
  }
}
/** The ordered ids are the independent inputs. One remaining id is calculated. */
export function ToolView({ config }: { config: ToolConfig }) {
  return <EquationToolView config={config} />;
}

function EquationToolView({ config }: { config: ToolConfig }) {
  const { preferences } = useCalculatorPreferences();
  const [mode, setMode] = useState<string>(config.defaultMode);
  const [parameters, setParameters] = useState<Record<string, string>>(() =>
    Object.fromEntries((config.parameters ?? []).map((parameter) => [parameter.id, parameter.defaultValue]))
  );
  const [equationVariants, setEquationVariants] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<Entries>({});
  const [order, setOrder] = useState<VariableId[]>([]);
  const [preferredCalculated, setPreferredCalculated] = useState<VariableId | null>(
    config.defaultSolveFor
  );
  const [editing, setEditing] = useState<VariableId | null>(null);
  const [editMode, setEditMode] = useState<"set" | "calculate">("set");
  const [draft, setDraft] = useState("");
  const [unit, setUnit] = useState("V");
  const [unitMenu, setUnitMenu] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedMeasurement[]>([]);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [pendingMeasurement, setPendingMeasurement] = useState<SavedMeasurement | null>(
    null
  );
  const [priorityNotice, setPriorityNotice] = useState("");

  const configuredMode = config.modes.find((item) => item.id === mode) ?? config.modes[0];
  const variantKey = configuredMode.variantGroup ?? mode;
  const configuredVariant = configuredMode.variants?.find(
    (item) => item.id === equationVariants[variantKey]
  ) ?? configuredMode.variants?.find(
    (item) => item.id === configuredMode.defaultVariant
  ) ?? configuredMode.variants?.[0];
  // Every tool supplies a resolved presentation; static tools use their mode as-is.
  // The tool supplies its presentation, solver and input policy.
  const presentation = config.generate?.({ mode, variant: configuredVariant?.id, parameters });
  const variables = presentation?.variables ?? config.variables;
  const activeMode = presentation?.mode ?? configuredMode;
  const variant = configuredVariant;
  const ids = presentation?.activeVariables ?? (variant?.variables ?? activeMode.variables);
  const output = presentation?.output;
  const inputPolicy = config.inputPolicy;
  const allowCalculate = inputPolicy?.allowCalculate !== false;
  const targetCandidates = ids;
  const activeOrder = order.filter((id) => activeMode.variables.includes(id));
  const inputs = useMemo(() => {
    const result: Record<string, number> = {};
    for (const id of order) {
      const entry = entries[id];
      if (entry) result[id] = entry.value;
    }
    return result;
  }, [entries, order]);
  // Derived values have no independent state: they are recomputed on every input change.
  const resolved = useMemo(
    () => config.resolveValues?.(inputs, mode) ?? inputs,
    [config, inputs, mode]
  );
  const unknown =
    preferredCalculated &&
    targetCandidates.includes(preferredCalculated) &&
    !activeOrder.includes(preferredCalculated)
      ? preferredCalculated
      : (targetCandidates.find((id) => !activeOrder.includes(id)) ?? null);
  const target: VariableId = output?.id ?? (unknown ?? preferredCalculated ?? config.defaultSolveFor);
  const neededIds = ids.filter((id) => id !== target);
  const canSolve = neededIds.every((id) => Number.isFinite(resolved[id]));
  const calculationContext: ToolCalculationContext = {
    mode,
    variant: variant?.id,
    parameters,
    target,
    values: resolved,
    activeVariables: ids,
    independentVariables: activeOrder,
  };
  const capacity = typeof inputPolicy?.maxIndependent === "function"
    ? inputPolicy.maxIndependent(calculationContext)
    : (inputPolicy?.maxIndependent ?? (typeof config.independentInputs === "function"
      ? config.independentInputs(mode)
      : (config.independentInputs ?? activeMode.variables.length - 1)));
  const calculation = config.evaluate
    ? config.evaluate(calculationContext)
    : canSolve && ids.includes(target) && !activeOrder.includes(target)
      ? config.solve(mode, target, resolved, variant?.id)
      : null;
  const values: Record<string, number> = { ...resolved };
  if (calculation?.ok) values[target] = calculation.value;
  // Presentation is scoped to the selected equation, not to the last
  // calculated variable in a different mode. Inactive variables still carry
  // derived values; they simply cannot be edited from this schematic.
  const schematicStates: Record<
    string,
    "entered" | "measured" | "calculated" | "empty" | "inactive"
  > = {};
  for (const id of Object.keys(variables)) {
    schematicStates[id] = !ids.includes(id)
      ? "inactive"
      : id === target
        ? "calculated"
        : "entered";
  }
  for (const [alias, id] of Object.entries(activeMode.schematic.aliases ?? {})) {
    schematicStates[alias] = schematicStates[id];
  }
  const displayValues: Record<string, string> = {};
  const states: Record<string, "entered" | "measured" | "calculated" | "empty"> = {};
  for (const id of Object.keys(variables)) {
    const value = values[id];
    if (Number.isFinite(value))
      displayValues[id] = formatQuantity(value, variables[id].kind, preferences);
    const entry = entries[id];
    states[id] = order.includes(id)
      ? entry?.source === "measurement"
        ? "measured"
        : "entered"
      : Number.isFinite(value)
        ? "calculated"
        : "empty";
  }

  // Renderers may use concise aliases while state retains stable, namespaced IDs.
  const displayIds = presentation?.displayIds;
  const schematicDisplayValues: Record<string, string> = displayIds
    ? Object.fromEntries(Object.entries(displayIds).map(([displayId, stateId]) => [displayId, displayValues[stateId]]))
    : displayValues;
  const schematicDisplayStates: Record<string, "entered" | "measured" | "calculated" | "empty" | "inactive"> = displayIds
    ? Object.fromEntries(Object.entries(displayIds).map(([displayId, stateId]) => [displayId, schematicStates[stateId]]))
    : schematicStates;
  function mapVariableId(id: string) {
    return displayIds?.[id] ?? id;
  }
  function changeMode(next: string) {
    if (next === mode) return;
    setMode(next);
    // Inputs are circuit-wide, not owned by a mode. An absent target is chosen
    // in the new mode without clearing values saved for other modes.
    setPreferredCalculated(
      config.modes.find((item) => item.id === next)?.preferredSolveFor ?? config.defaultSolveFor
    );
    setEditing(null);
  }
  function openEditor(id: VariableId) {
    if (id === output?.id) return;
    id = mapVariableId(id);
    if (!ids.includes(id)) return;
    const current = values[id];
    const units = unitsForKind(variables[id].kind);
    const defaultUnit =
      units.find((u) => u.label === variables[id].defaultUnit) ?? units[0];
    setUnit(defaultUnit.label);
    setDraft(
      current === undefined
        ? ""
        : String(Number((current / defaultUnit.factor).toPrecision(9)))
    );
    setPendingMeasurement(null);
    setEditMode("set");
    setError("");
    setEditing(id);
  }
  function closeEditor() {
    setEditing(null);
    setMeasurementOpen(false);
    setPendingMeasurement(null);
    setUnitMenu(false);
  }
  function chooseCalculated() {
    if (!editing || !allowCalculate) return;
    const id = editing;
    const nextEntries = { ...entries };
    delete nextEntries[id];
    setEntries(nextEntries);
    setOrder(order.filter((candidate) => candidate !== id));
    setPriorityNotice("");
    setPreferredCalculated(id);
    closeEditor();
  }
  function applyValue(value: number, source: Source, measurementId?: string) {
    if (!editing) return;
    const validationError = inputPolicy?.validate
      ? inputPolicy.validate(value, variables[editing].kind)
      : (!Number.isFinite(value) || (variables[editing].kind === "resistance" && value <= 0)
        ? "Enter a valid finite value (resistance must be positive)." : null);
    if (validationError) {
      setError(validationError);
      return;
    }
    const id = editing;
    const next = { ...entries, [id]: { value, source, measurementId } };
    const nextOrder = [...order.filter((candidate) => candidate !== id), id];
    const activeInputs = nextOrder.filter((candidate) =>
      activeMode.variables.includes(candidate)
    );
    if (activeInputs.length > capacity) {
      const displaced = activeInputs[0];
      delete next[displaced];
      nextOrder.splice(nextOrder.indexOf(displaced), 1);
      setPreferredCalculated(displaced);
      setPriorityNotice(`Now calculating ${variables[displaced].name}`);
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
    if (editMode === "calculate" && allowCalculate) {
      chooseCalculated();
      return;
    }
    if (inputPolicy?.clearOnEmpty && !pendingMeasurement && !draft.trim()) {
      if (editing) {
        setEntries((previous) => {
          const next = { ...previous };
          delete next[editing];
          return next;
        });
        setOrder((previous) => previous.filter((id) => id !== editing));
      }
      closeEditor();
      return;
    }
    if (pendingMeasurement) {
      applyValue(pendingMeasurement.value, "measurement", pendingMeasurement.id);
      return;
    }
    const parsed = Number(draft.trim());
    const units = editing ? unitsForKind(variables[editing].kind) : voltageUnits;
    const factor = units.find((item) => item.label === unit)?.factor ?? 1;
    applyValue(draft.trim() === "" ? Number.NaN : parsed * factor, "manual");
  }
  async function openMeasurements() {
    setMeasurementOpen(true);
    setLoadingSaved(true);
    setError("");
    try {
      setSaved(await listSavedMeasurements());
    } catch {
      setError("Could not load saved measurements.");
    } finally {
      setLoadingSaved(false);
    }
  }
  const filtered = saved.filter(
    (item) =>
      editing && item.kind === variables[editing].kind && Number.isFinite(item.value)
  );
  const units = editing ? unitsForKind(variables[editing].kind) : voltageUnits;

  return (
    <View style={styles.screen}>
      <View style={styles.modeBar} accessibilityRole="tablist">
        {config.modes.map((variant) => {
          const selected = mode === variant.id;
          return (
            <Pressable
              key={variant.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => changeMode(variant.id)}
              style={({ pressed }) => [
                styles.modeTab,
                selected && styles.modeTabSelected,
                pressed && styles.modeTabPressed,
              ]}
            >
              <Text
                style={[
                  styles.modeTabLabel,
                  { color: selected ? c.darkTeal : c.mutedText },
                ]}
              >
                {variant.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {configuredMode.variants && configuredMode.variants.length > 0 && (
        <ToolVariantTabs
          variants={configuredMode.variants}
          selectedId={variant?.id ?? configuredMode.variants[0].id}
          onSelect={(id) => {
            if (id === variant?.id) return;
            // Keep inputs intact: navigation changes presentation, not stored data.
            setEquationVariants((previous) => ({ ...previous, [variantKey]: id }));
            const selected = configuredMode.variants?.find((item) => item.id === id);
            if (selected?.preferredSolveFor ?? configuredMode.preferredSolveFor) {
              setPreferredCalculated(
                selected?.preferredSolveFor ?? configuredMode.preferredSolveFor ?? config.defaultSolveFor
              );
            }
            setEditing(null);
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
        {(config.parameters ?? []).map((parameter) => (
          <ToolSelectInput
            key={parameter.id}
            config={parameter}
            value={parameters[parameter.id] ?? parameter.defaultValue}
            onChange={(value) => {
              setParameters((previous) => ({ ...previous, [parameter.id]: value }));
              setEditing(null);
            }}
          />
        ))}
        <Text style={styles.instruction}>Tap to edit</Text>
        <SchematicView
          config={activeMode.schematic}
          values={schematicDisplayValues}
          states={schematicDisplayStates}
          onVariablePress={openEditor}
        />
        <InteractiveEquation
          key={`${mode}:${target}:${configuredVariant?.id ?? ""}:${JSON.stringify(parameters)}`}
          expression={presentation?.expression ?? (variant?.equations ?? activeMode.equations)[target]}
          calculated={target}
          labels={
            presentation?.equationLabels ??
            Object.fromEntries(
              Object.entries(variables).map(([id, variable]) => [id, variable.mathLabel])
            )
          }
          values={schematicDisplayValues}
          onVariablePress={openEditor}
        />
        <View style={styles.resultArea}>
          {calculation?.ok && !activeOrder.includes(target) ? (
            <Text style={styles.calculatedResult}>
              {output?.label ?? variables[target]?.name ?? target}{" "}
              ={" "}
              {formatQuantity(calculation.value, output?.kind ?? variables[target].kind, preferences)}
            </Text>
          ) : (
            <Text style={styles.pendingResult}>
              {output?.label ?? variables[target]?.name ?? target}{" "}
              = —
            </Text>
          )}
          {calculation?.ok === false && (
            <Text style={styles.error}>{calculation.error}</Text>
          )}
        </View>
        <Button
          compact
          mode="text"
          icon="refresh"
          onPress={() => {
            const resetIds = new Set(Object.keys(variables));
            setEntries((previous) => inputPolicy?.resetScope === "active"
              ? Object.fromEntries(Object.entries(previous).filter(([id]) => !resetIds.has(id)))
              : {});
            setOrder((previous) => inputPolicy?.resetScope === "active"
              ? previous.filter((id) => !resetIds.has(id))
              : []);
            setPreferredCalculated(config.defaultSolveFor);
            setPriorityNotice("");
          }}
        >
          Reset
        </Button>
      </ScrollView>
      <Snackbar
        visible={!!priorityNotice}
        onDismiss={() => setPriorityNotice("")}
        duration={2600}
      >
        {priorityNotice}
      </Snackbar>
      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text variant="titleLarge">
              {editing
                ? `${variables[editing].title} (${variables[editing].name})`
                : "Edit"}
            </Text>
            {allowCalculate && (
              <SegmentedButtons
                value={editMode}
                onValueChange={(v) => {
                  setEditMode(v as "set" | "calculate");
                  setError("");
                }}
                buttons={[
                  { value: "set", label: "Set Value" },
                  { value: "calculate", label: "Calculate" },
                ]}
              />
            )}
            {editMode === "set" ? (
              <>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.numberInput}
                    mode="outlined"
                    label="Value"
                    value={draft}
                    onChangeText={(text) => {
                      setDraft(text);
                      setPendingMeasurement(null);
                      setError("");
                    }}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Button
                    mode="outlined"
                    style={styles.unitButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setUnitMenu(true);
                    }}
                  >
                    {unit} ▾
                  </Button>
                </View>
                <Button icon="bookmark-outline" onPress={openMeasurements}>
                  {pendingMeasurement
                    ? "Change saved measurement"
                    : "Use saved measurement"}
                </Button>
                {pendingMeasurement && (
                  <Text style={styles.hint}>
                    Selected:{" "}
                    {formatQuantity(
                      pendingMeasurement.value,
                      editing ? variables[editing].kind : "resistance",
                      preferences
                    )}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.hint}>
                Calculate this variable using the other {ids.length - 1} values.
              </Text>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.actions}>
              <Button onPress={closeEditor}>Cancel</Button>
              <Button mode="contained" onPress={applyEdit}>
                {editMode === "set" || !allowCalculate ? "Save" : "Calculate"}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      {/* A separate native Modal avoids React Native Paper Menu being clipped
        or rendered beneath the editor's React Native Modal on Android. */}
      <Modal
        visible={unitMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitMenu(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.unitPicker}>
            <Text variant="titleMedium">Select unit</Text>
            {units.map((option) => (
              <Button
                key={option.label}
                mode={option.label === unit ? "contained-tonal" : "text"}
                onPress={() => {
                  const oldFactor = units.find((u) => u.label === unit)?.factor ?? 1;
                  const previous = Number(draft);
                  if (draft.trim() && Number.isFinite(previous)) {
                    setDraft(
                      String(
                        Number(((previous * oldFactor) / option.factor).toPrecision(10))
                      )
                    );
                  }
                  setUnit(option.label);
                  setUnitMenu(false);
                }}
              >
                {option.label}
              </Button>
            ))}
            <Button onPress={() => setUnitMenu(false)}>Cancel</Button>
          </View>
        </View>
      </Modal>
      <Modal
        visible={measurementOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMeasurementOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.picker}>
            <Text variant="titleLarge">
              Saved {editing ? variables[editing].kind : ""} measurements
            </Text>
            <Text style={styles.hint}>Choose a reading to import its exact value.</Text>
            <ScrollView style={styles.savedList}>
              {loadingSaved ? (
                <Text>Loading…</Text>
              ) : filtered.length === 0 ? (
                <Text>No matching measurements saved yet.</Text>
              ) : (
                filtered.map((item) => (
                  <Button
                    key={item.id}
                    style={styles.savedRow}
                    contentStyle={styles.savedRowContent}
                    onPress={() => {
                      setPendingMeasurement(item);
                      const matching =
                        units.find(
                          (u) =>
                            u.label === (editing ? variables[editing].defaultUnit : "Ω")
                        ) ?? units[0];
                      setUnit(matching.label);
                      setDraft(
                        String(Number((item.value / matching.factor).toPrecision(10)))
                      );
                      setMeasurementOpen(false);
                      setEditMode("set");
                    }}
                  >
                    {formatQuantity(
                      item.value,
                      editing ? variables[editing].kind : "resistance",
                      preferences
                    )}{" "}
                    · {new Date(item.measuredAt).toLocaleString()}
                  </Button>
                ))
              )}
            </ScrollView>
            <Button onPress={() => setMeasurementOpen(false)}>Back</Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  modeBar: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.mutedText,
  },
  modeTab: { flex: 1, height: 46, justifyContent: "center", alignItems: "center" },
  modeTabSelected: { backgroundColor: "#E7F2F4" },
  modeTabPressed: { opacity: 0.75 },
  modeTabLabel: { fontSize: 14, fontWeight: "600" },
  scroll: { flex: 1, minHeight: 0 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 120,
    gap: 4,
  },
  instruction: {
    alignSelf: "flex-end",
    textAlign: "right",
    color: c.mutedText,
    fontSize: 11,
    fontStyle: "italic",
    marginRight: 4,
  },
  resultArea: { alignItems: "center", minHeight: 54, justifyContent: "center", gap: 6 },
  calculatedResult: {
    color: c.orange,
    fontSize: 29,
    fontWeight: "600",
    textAlign: "center",
  },
  pendingResult: { color: c.mutedText, fontSize: 25, textAlign: "center" },
  hint: { color: c.mutedText },
  error: { color: "#B42318" },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: { backgroundColor: c.surface, padding: 18, borderRadius: 14, gap: 14 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  numberInput: { flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  unitButton: { justifyContent: "center", minWidth: 92 },
  unitPicker: {
    backgroundColor: c.surface,
    padding: 20,
    borderRadius: 14,
    gap: 8,
    alignSelf: "center",
    width: "80%",
    maxWidth: 320,
  },
  picker: {
    backgroundColor: c.surface,
    padding: 18,
    borderRadius: 14,
    gap: 12,
    maxHeight: "75%",
  },
  savedList: { flexGrow: 0 },
  savedRow: { marginVertical: 4 },
  savedRowContent: { justifyContent: "flex-start" },
});
