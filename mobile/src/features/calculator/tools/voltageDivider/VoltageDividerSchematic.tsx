import { SchematicCanvas } from "../../schematic/SchematicCanvas";
import type { ElementState, GridElement, GridSize } from "../../schematic/grid";

export type DividerMode = "unloaded" | "loaded";

// Electrical paths follow adjacent cell-edge ports, not arbitrary coordinates.
// Three rows × four columns, numbered left-to-right from zero:
//  0 Vin  -> 1 R1 -> 2 Vout junction -> 3 Vout terminal
//                        |
//                      6 R2
//                        |
//                     10 GND
// Each component occupies one cell; connections meet at edge midpoints.
const unloadedGrid: GridSize = { rows: 3, columns: 4 };
const unloadedElements: GridElement[] = [
  { type: "terminal", cell: 0, side: "east", id: "vin", label: "Vin" },
  { type: "resistor", cell: 1, id: "r1", label: "R1", orientation: "horizontal" },
  { type: "node", cell: 2, sides: ["west", "east", "south"], id: "vout", label: "Vout" },
  { type: "terminal", cell: 3, side: "west", id: "voutTap", label: "Vout" },
  { type: "resistor", cell: 6, id: "r2", label: "R2", orientation: "vertical" },
  { type: "ground", cell: 10 },
];

const loadedGrid: GridSize = { rows: 6, columns: 6 };
const loadedElements: GridElement[] = [
  { type: "terminal", cell: 1, side: "south", id: "vin", label: "Vin" },
  { type: "resistor", cell: 7, id: "r1", label: "R1", orientation: "vertical" },
  { type: "node", cell: 13, sides: ["north", "south", "east"], id: "vout", label: "Vout" },
  { type: "wire", cell: 14, sides: ["west", "east"] },
  { type: "wire", cell: 15, sides: ["west", "east"] },
  { type: "node", cell: 16, sides: ["west", "east", "south"] },
  { type: "terminal", cell: 17, side: "west", id: "voutTap", label: "Vout" },
  { type: "resistor", cell: 19, id: "r2", label: "R2", orientation: "vertical" },
  { type: "resistor", cell: 22, id: "rl", label: "RL", orientation: "vertical" },
  { type: "node", cell: 25, sides: ["north", "east", "south"] },
  { type: "wire", cell: 26, sides: ["west", "east"] },
  { type: "wire", cell: 27, sides: ["west", "east"] },
  { type: "wire", cell: 28, sides: ["north", "west"] },
  { type: "ground", cell: 31 },
];

type VariableId = "vin" | "vout" | "r1" | "r2" | "rl";
const isVariableId = (value: string): value is VariableId =>
  value === "vin" || value === "vout" || value === "r1" || value === "r2" || value === "rl";

export function VoltageDividerSchematic({ mode, values, states, onVariablePress, showGrid = false }: {
  mode: DividerMode;
  values?: Readonly<Record<string, string>>;
  states?: Readonly<Record<string, ElementState>>;
  onVariablePress?: (id: VariableId) => void;
  showGrid?: boolean;
}) {
  const grid = mode === "loaded" ? loadedGrid : unloadedGrid;
  const elements = mode === "loaded" ? loadedElements : unloadedElements;
  const displayValues: Record<string, string> = { ...(values ?? {}), voutTap: values?.vout ?? "" };
  return <SchematicCanvas grid={grid} elements={elements} values={displayValues} states={states}
    showGrid={showGrid} showNumbers={showGrid}
    onElementPress={id => {
      const variable = id === "voutTap" ? "vout" : id;
      if (isVariableId(variable)) onVariablePress?.(variable);
    }} />;
}
