import type { CollectionKind, SchematicConfig } from "../../registry/types";
import type { Expression } from "../../registry/expression";
import type { GridElement, Side } from "../../schematic/grid";

export const collectionSymbol = (kind: CollectionKind) => kind === "resistance" ? "R" : kind === "capacitance" ? "C" : "L";
export const collectionId = (index: number) => `component-${index}`;

export function generateCollectionSchematic(kind: CollectionKind, connection: "series" | "parallel", count: number): SchematicConfig {
  const type = kind === "resistance" ? "resistor" : kind === "capacitance" ? "capacitor" : "inductor";
  const columns = Math.max(count + 2, 6);
  const offset = Math.floor((columns - count) / 2);
  const elements: GridElement[] = [];
  const label = collectionSymbol(kind);
  if (connection === "series") {
    for (let col = 0; col < columns; col++) {
      const index = col - offset;
      elements.push(index >= 0 && index < count
        ? { type, cell: col, id: collectionId(index), label: `${label}${index + 1}`, orientation: "horizontal" }
        : { type: "wire", cell: col, sides: ["west", "east"] });
    }
    return { grid: { rows: 1, columns }, elements };
  }
  // Top and bottom buses meet each branch at a tee; every branch is a real
  // vertical component between matching bus nodes, not separate SVG artwork.
  const first = offset;
  const last = offset + count - 1;
  for (let col = 0; col < columns; col++) {
    const top: Side[] = ["west", "east"];
    const bottom: Side[] = ["west", "east"];
    if (col >= first && col <= last) { top.push("south"); bottom.push("north"); }
    elements.push({ type: "wire", cell: col, sides: top });
    elements.push({ type: "wire", cell: 2 * columns + col, sides: bottom });
    if (col >= first && col <= last) {
      const index = col - first;
      elements.push({ type, cell: columns + col, id: collectionId(index), label: `${label}${index + 1}`, orientation: "vertical" });
    }
  }
  return { grid: { rows: 3, columns }, elements };
}

const variable = (id: string): Expression => ({ type: "variable", id });
const text = (value: string): Expression => ({ type: "text", value });
export function generateCollectionEquation(kind: CollectionKind, connection: "series" | "parallel", count: number): Expression {
  const additive = kind === "capacitance" ? connection === "parallel" : connection === "series";
  const children: Expression[] = [];
  for (let i = 0; i < count; i++) {
    if (i) children.push(text(" + "));
    const term = variable(collectionId(i));
    children.push(additive ? term : { type: "fraction", numerator: text("1"), denominator: term });
  }
  const sum: Expression = { type: "row", children };
  return additive ? sum : { type: "fraction", numerator: text("1"), denominator: sum };
}

export function collectionEquationLabels(kind: CollectionKind, count: number) {
  const base = collectionSymbol(kind);
  return Object.fromEntries([
    ["equivalent", { base, sub: "eq" }],
    ...Array.from({ length: count }, (_, index) => [collectionId(index), { base, sub: String(index + 1) }] as const),
  ]);
}
