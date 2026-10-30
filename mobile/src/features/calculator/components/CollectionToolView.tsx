import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";
import { formatQuantity } from "../preferences/engineeringFormat";
import { useCalculatorPreferences } from "../preferences/calculatorPreferences";
import type { CollectionKind, CollectionToolConfig } from "../registry/types";
import { equivalentValue } from "../tools/seriesParallel/calculations";
import { CollectionSchematic } from "./CollectionSchematic";
import { ToolSelectInput } from "./ToolSelectInput";

const kinds: CollectionKind[] = ["resistance", "capacitance", "inductance"];

/** Configured repeated-element solver; no per-calculator screen logic. */
export function CollectionToolView({ collection }: { collection: CollectionToolConfig }) {
  const { preferences } = useCalculatorPreferences();
  const inputRefs = useRef<Array<{ focus: () => void } | null>>([]);
  const [connection, setConnection] = useState<"series" | "parallel">(collection.defaultConnection);
  const [kind, setKind] = useState<CollectionKind>(collection.defaultKind);
  const [count, setCount] = useState(Number(collection.count.defaultValue));
  // Keep hidden values when count decreases or the type is changed.
  const [values, setValues] = useState<Record<CollectionKind, string[]>>({ resistance: [], capacitance: [], inductance: [] });
  const kindConfig = collection.kindOptions.find(item => item.id === kind) ?? collection.kindOptions[0];
  const current = values[kind];
  const parsed = Array.from({ length: count }, (_, index) => {
    const raw = current[index];
    if (raw === undefined || !raw.trim()) return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number * kindConfig.factor : null;
  });
  const result = equivalentValue(kind, connection, parsed);
  const variable = kind === "resistance" ? "R" : kind === "capacitance" ? "C" : "L";
  const formula = (kind === "capacitance" ? connection === "parallel" : connection === "series")
    ? `${variable}eq = ${Array.from({ length: count }, (_, i) => `${variable}${i+1}`).join(" + ")}`
    : `1/${variable}eq = ${Array.from({ length: count }, (_, i) => `1/${variable}${i+1}`).join(" + ")}`;
  function update(index: number, text: string) {
    setValues(previous => {
      const next = [...previous[kind]];
      next[index] = text;
      return { ...previous, [kind]: next };
    });
  }
  return <View style={styles.screen}>
    <View style={styles.tabs}>
      {(["series", "parallel"] as const).map(id => <Button key={id} compact style={[styles.tab, connection === id && styles.selected]} labelStyle={{ color: connection === id ? c.darkTeal : c.mutedText }} onPress={() => setConnection(id)}>{id === "series" ? "Series" : "Parallel"}</Button>)}
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <SegmentedButtons value={kind} onValueChange={value => { if (kinds.includes(value as CollectionKind)) setKind(value as CollectionKind); }} buttons={collection.kindOptions.map(item => ({ value: item.id, label: item.label }))} />
      <ToolSelectInput config={collection.count} value={String(count)} onChange={value => setCount(Number(value))} />
      <CollectionSchematic kind={kind} connection={connection} count={count} onSelect={index => inputRefs.current[index]?.focus()} />
      <View style={styles.inputs}>
        {Array.from({ length: count }, (_, index) => <TextInput key={`${kind}-${index}`} mode="outlined" dense
          style={styles.input} ref={element => { inputRefs.current[index] = element; }} label={`${variable}${index+1} (${kindConfig.unit})`}
          value={current[index] ?? ""} onChangeText={text => update(index, text)} keyboardType="decimal-pad" />)}
      </View>
      <Text style={styles.formula}>{formula}</Text>
      <View style={styles.result}>
        <Text style={styles.resultLabel}>{variable}eq</Text>
        <Text style={styles.resultValue}>{result === null ? "—" : formatQuantity(result, kind, preferences)}</Text>
      </View>
      <Button icon="refresh" mode="text" onPress={() => setValues(previous => ({ ...previous, [kind]: [] }))}>Reset values</Button>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.grid },
  tab: { flex: 1, height: 46, justifyContent: "center", borderRadius: 0 },
  selected: { backgroundColor: "#E7F2F4" },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 120, gap: 15 },
  inputs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { width: "47%", flexGrow: 1, backgroundColor: c.surface },
  formula: { textAlign: "center", fontSize: 15, color: c.darkTeal },
  result: { alignItems: "center", gap: 4, paddingVertical: 12 },
  resultLabel: { color: c.darkTeal, fontSize: 16 },
  resultValue: { color: c.orange, fontWeight: "600", fontSize: 28 },
});
