import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Text as SvgText } from "react-native-svg";
import { pocketLabColors as c } from "@/themes/theme";
import type { Expression } from "../registry/expression";
import type { EquationConfig } from "../registry/types";

type Props = {
  expression: Expression;
  calculated: string;
  labels: EquationConfig["labels"];
  values: Readonly<Partial<Record<string, string>>>;
  onVariablePress: (id: string) => void;
};

function VariableGlyph({ id, orange, labels }: { id: string; orange: boolean; labels: EquationConfig["labels"] }) {
  const { base, sub } = labels[id] ?? { base: id, sub: "" };
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

function ExpressionNode({ node, calculated, values, labels, onVariablePress, depth = 0, showValues = true }: {
  node: Expression;
  calculated: string;
  values: Props["values"];
  labels: Props["labels"];
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
          accessibilityLabel={`Edit ${(labels[node.id]?.base ?? node.id)} ${(labels[node.id]?.sub ?? "")}`}
          onPress={() => onVariablePress(node.id)}
          hitSlop={6}
          style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
        >
          {populated ? <Text style={styles.populated}>{populated}</Text> : <VariableGlyph id={node.id} orange={node.id === calculated} labels={labels} />}
        </Pressable>
      );
    }
    case "text": return <Text style={styles.operator}>{node.value}</Text>;
    case "row": return <View style={styles.row}>{node.children.map((child, index) => (
      <ExpressionNode key={index} node={child} calculated={calculated} values={values} labels={labels} onVariablePress={onVariablePress} depth={depth} showValues={showValues} />
    ))}</View>;
    case "fraction": return (
      <View style={styles.fraction}>
        <View style={styles.fractionHalf}>
          <ExpressionNode node={node.numerator} calculated={calculated} values={values} labels={labels} onVariablePress={onVariablePress} depth={depth + 1} showValues={showValues} />
        </View>
        <View style={styles.bar} />
        <View style={styles.fractionHalf}>
          <ExpressionNode node={node.denominator} calculated={calculated} values={values} labels={labels} onVariablePress={onVariablePress} depth={depth + 1} showValues={showValues} />
        </View>
      </View>
    );
  }
}

export function InteractiveEquation({ expression, calculated, values, labels, onVariablePress }: Props) {
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
            accessibilityLabel={`Edit ${(labels[calculated]?.base ?? calculated)} ${(labels[calculated]?.sub ?? "")}`}
            onPress={() => onVariablePress(calculated)}
            style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
          >
            <VariableGlyph id={calculated} orange labels={labels} />
          </Pressable>
          <Text style={styles.operator}> = </Text>
          <ExpressionNode node={expression} calculated={calculated} values={values} labels={labels} onVariablePress={onVariablePress} />
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
