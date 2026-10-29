import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";
import { pocketLabColors as c } from "@/themes/theme";
import type { DividerMode, VariableId } from "./interactiveDividerMath";

type Props = {
  mode: DividerMode;
  calculated: VariableId;
  values: Readonly<Partial<Record<VariableId, string>>>;
  onVariablePress: (id: VariableId) => void;
};

type Expression =
  | { type: "variable"; id: VariableId }
  | { type: "text"; value: string }
  | { type: "row"; children: Expression[] }
  | { type: "fraction"; numerator: Expression; denominator: Expression };

const v = (id: VariableId): Expression => ({ type: "variable", id });
const t = (value: string): Expression => ({ type: "text", value });
const row = (...children: Expression[]): Expression => ({ type: "row", children });
const frac = (numerator: Expression, denominator: Expression): Expression => ({ type: "fraction", numerator, denominator });
const sum = (a: Expression, b: Expression) => row(a, t(" + "), b);
const diff = (a: Expression, b: Expression) => row(a, t(" − "), b);
const product = (a: Expression, b: Expression) => row(a, t(" × "), b);
const parens = (x: Expression) => row(t("("), x, t(")"));
const parallel = () => parens(row(v("r2"), t(" ∥ "), v("rl")));

/** Preserve a true typographic fraction for every rearranged equation. */
function equation(mode: DividerMode, result: VariableId): Expression {
  const vin = v("vin"), vout = v("vout"), r1 = v("r1"), r2 = v("r2"), rl = v("rl");
  const p = () => parallel();
  if (mode === "unloaded") {
    switch (result) {
      case "vin": return product(vout, frac(sum(r1, r2), r2));
      case "r1": return product(r2, parens(diff(frac(vin, vout), t("1"))));
      case "r2": return frac(product(vout, r1), diff(vin, vout));
      default: return product(vin, frac(r2, sum(r1, r2)));
    }
  }
  switch (result) {
    case "vin": return product(vout, frac(sum(r1, p()), p()));
    case "r1": return product(p(), parens(diff(frac(vin, vout), t("1"))));
    case "r2": {
      const q = () => frac(product(vout, r1), diff(vin, vout));
      return frac(product(q(), rl), diff(rl, q()));
    }
    case "rl": {
      const q = () => frac(product(vout, r1), diff(vin, vout));
      return frac(product(q(), r2), diff(r2, q()));
    }
    default: return product(vin, frac(p(), sum(r1, p())));
  }
}

const LABELS: Record<VariableId, { base: string; sub: string }> = {
  vin: { base: "V", sub: "in" },
  vout: { base: "V", sub: "out" },
  r1: { base: "R", sub: "1" },
  r2: { base: "R", sub: "2" },
  rl: { base: "R", sub: "L" },
};

function VariableGlyph({ id, orange }: { id: VariableId; orange: boolean }) {
  const { base, sub } = LABELS[id];
  const size = 25;
  const width = size * (sub.length === 3 ? 2 : sub.length === 2 ? 1.65 : 1.25);
  const height = size * 1.45;
  const color = orange ? c.orange : c.darkTeal;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgText x={1} y={size} fontSize={size} fontFamily="serif" fontStyle="italic" fill={color}>
        {base}
      </SvgText>
      <SvgText x={size * 0.75} y={size * 1.23} fontSize={size * 0.55} fontFamily="serif" fontStyle="italic" fill={color}>
        {sub}
      </SvgText>
    </Svg>
  );
}

function ExpressionNode({ node, calculated, values, onVariablePress, depth = 0, showValues = true }: {
  node: Expression;
  calculated: VariableId;
  values: Props["values"];
  onVariablePress: Props["onVariablePress"];
  depth?: number;
  showValues?: boolean;
}) {
  switch (node.type) {
    case "variable": {
      const populated = showValues ? values[node.id] : undefined;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${LABELS[node.id].base} ${LABELS[node.id].sub}`}
          onPress={() => onVariablePress(node.id)}
          hitSlop={6}
          style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
        >
          {populated ? <Text style={styles.populated}>{populated}</Text> : <VariableGlyph id={node.id} orange={node.id === calculated} />}
        </Pressable>
      );
    }
    case "text": return <Text style={styles.operator}>{node.value}</Text>;
    case "row": return <View style={styles.row}>{node.children.map((child, index) => (
      <ExpressionNode key={index} node={child} calculated={calculated} values={values} onVariablePress={onVariablePress} depth={depth} showValues={showValues} />
    ))}</View>;
    case "fraction": return (
      <View style={styles.fraction}>
        <View style={styles.fractionHalf}>
          <ExpressionNode node={node.numerator} calculated={calculated} values={values} onVariablePress={onVariablePress} depth={depth + 1} showValues={showValues} />
        </View>
        <View style={styles.bar} />
        <View style={styles.fractionHalf}>
          <ExpressionNode node={node.denominator} calculated={calculated} values={values} onVariablePress={onVariablePress} depth={depth + 1} showValues={showValues} />
        </View>
      </View>
    );
  }
}

export function InteractiveDividerEquation({ mode, calculated, values, onVariablePress }: Props) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  // Keep the equation's true math layout, but scale it uniformly to fit the
  // available space. RN transforms don't change layout size, so reserve the
  // scaled height and compensate for the transform's center origin explicitly.
  const naturalWidth = naturalSize.width;
  const naturalHeight = naturalSize.height;
  const scale = availableWidth > 0 && naturalWidth > 0
    ? Math.min(1, availableWidth / naturalWidth)
    : 1;
  const renderedHeight = naturalHeight > 0 ? naturalHeight * scale : 96;

  return (
    <View
      style={styles.viewport}
      onLayout={(event) => {
        const width = Math.max(0, event.nativeEvent.layout.width - 20);
        setAvailableWidth((previous) => previous === width ? previous : width);
      }}
    >
      <View style={[styles.scaledArea, { height: renderedHeight }]}>
        <View
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setNaturalSize((previous) => previous.width === width && previous.height === height
              ? previous
              : { width, height });
          }}
          style={[
            styles.equationContent,
            naturalWidth > 0 && naturalHeight > 0 && {
              left: (availableWidth - naturalWidth) / 2,
              top: (renderedHeight - naturalHeight) / 2,
              transform: [{ scale }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${LABELS[calculated].base} ${LABELS[calculated].sub}`}
            onPress={() => onVariablePress(calculated)}
            style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
          >
            <VariableGlyph id={calculated} orange />
          </Pressable>
          <Text style={styles.operator}> = </Text>
          <ExpressionNode node={equation(mode, calculated)} calculated={calculated} values={values} onVariablePress={onVariablePress} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: "100%", paddingHorizontal: 10, paddingVertical: 12 },
  scaledArea: { position: "relative", width: "100%", overflow: "visible" },
  equationContent: { position: "absolute", left: 0, top: 0, flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  operator: { fontFamily: "serif", fontSize: 25, color: c.text },
  fraction: { alignItems: "stretch", justifyContent: "center", marginHorizontal: 3 },
  fractionHalf: { minHeight: 36, paddingHorizontal: 7, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  bar: { height: 1.5, backgroundColor: c.text, marginVertical: 2 },
  touch: { paddingHorizontal: 1, borderRadius: 5 },
  pressed: { backgroundColor: "#F4E5DC" },
  populated: { fontFamily: "serif", fontSize: 20, color: c.darkTeal },
});
