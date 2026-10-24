import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";
import type { DividerMode, VariableId } from "./interactiveDividerMath";

type Props = {
  mode: DividerMode;
  onVariablePress: (id: VariableId) => void;
  /** Human-readable values in engineering units, keyed by variable ID. */
  values?: Readonly<Partial<Record<VariableId, string>>>;
};

const LABELS: Record<VariableId, { base: string; sub: string }> = {
  vin: { base: "V", sub: "in" },
  vout: { base: "V", sub: "out" },
  r1: { base: "R", sub: "1" },
  r2: { base: "R", sub: "2" },
  rl: { base: "R", sub: "L" },
};

/** Proper typographic subscripts; SVG avoids platform-dependent Unicode subscripts. */
function VariableGlyph({ id, size = 25 }: { id: VariableId; size?: number }) {
  const { base, sub } = LABELS[id];
  // Font-family names are resolved by Android/iOS SVG text renderers.
  // Keeping glyphs as text (rather than paths) preserves flexibility.
  const width = size * (sub.length === 3 ? 2.0 : sub.length === 2 ? 1.65 : 1.25);
  const height = size * 1.45;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgText
        x={1}
        y={size}
        fontSize={size}
        fontFamily="serif"
        fontStyle="italic"
        fontWeight="400"
        fill="#347E75"
      >
        {base}
      </SvgText>
      <SvgText
        x={size * 0.75}
        y={size * 1.23}
        fontSize={size * 0.55}
        fontFamily="serif"
        fontStyle="italic"
        fontWeight="400"
        fill="#347E75"
      >
        {sub}
      </SvgText>
    </Svg>
  );
}

function EquationRow({ mode, values, onVariablePress, substituted }: Props & { substituted: boolean }) {
  const size = substituted ? 13 : mode === "loaded" ? 22 : 25;
  const operatorSize = substituted ? 13 : 22;
  const textStyle = { fontSize: operatorSize, color: "#263238", fontFamily: "serif" as const };

  function variable(id: VariableId, occurrence: string) {
    if (substituted) {
      return <Text key={`${id}-${occurrence}`} style={styles.numeric} numberOfLines={1}>{values?.[id] ?? "?"}</Text>;
    }
    return (
      <Pressable
        key={`${id}-${occurrence}`}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${LABELS[id].base} ${LABELS[id].sub}`}
        onPress={() => onVariablePress(id)}
        hitSlop={8}
        style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
      >
        <VariableGlyph id={id} size={size} />
      </Pressable>
    );
  }
  function operator(symbol: string, key: string) {
    return <Text key={key} style={textStyle}>{symbol}</Text>;
  }
  function parallel(key: string) {
    return (
      <View key={key} style={styles.inline}>
        {operator("(", `${key}-open`)}
        {variable("r2", `${key}-r2`)}
        {operator(" ∥ ", `${key}-parallel`)}
        {variable("rl", `${key}-rl`)}
        {operator(")", `${key}-close`)}
      </View>
    );
  }
  return (
    <View style={styles.equation}>
      {variable("vout", "left")}
      {operator(" = ", "equals")}
      {variable("vin", "input")}
      {operator(" × ", "multiply")}
      <View style={styles.fraction}>
        <View style={styles.fractionHalf}>
          {mode === "loaded" ? parallel("num") : variable("r2", "numerator")}
        </View>
        <View style={styles.bar} />
        <View style={styles.fractionHalf}>
          {variable("r1", "denominator")}
          {operator(" + ", "plus")}
          {mode === "loaded" ? parallel("den") : variable("r2", "denominator-r2")}
        </View>
      </View>
    </View>
  );
}

export function InteractiveDividerEquation({ mode, onVariablePress, values }: Props) {
  const hasValues = values && Object.values(values).some(value => value !== undefined);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Equation · tap a variable to edit</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <EquationRow mode={mode} values={values} onVariablePress={onVariablePress} substituted={false} />
      </ScrollView>
      {hasValues ? (
        <View style={styles.valuesSection}>
          <Text style={styles.sectionTitle}>With current values</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <EquationRow mode={mode} values={values} onVariablePress={onVariablePress} substituted />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingVertical: 10, gap: 6 },
  sectionTitle: { textAlign: "center", fontSize: 12, color: "#64748B" },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 6, paddingVertical: 4 },
  equation: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  fraction: { alignItems: "stretch", justifyContent: "center", marginHorizontal: 3 },
  fractionHalf: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 6, minHeight: 29 },
  bar: { height: 1.5, backgroundColor: "#263238", marginVertical: 2 },
  inline: { flexDirection: "row", alignItems: "center" },
  touch: { paddingHorizontal: 1, borderRadius: 5 },
  pressed: { backgroundColor: "#D7F1EC" },
  numeric: { fontSize: 12, fontWeight: "500", color: "#347E75" },
  valuesSection: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#D6DEE1", paddingTop: 8, gap: 4 },
});
