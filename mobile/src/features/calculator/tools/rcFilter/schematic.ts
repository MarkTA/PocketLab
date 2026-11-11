import type { SchematicConfig } from "../../registry/types";
/** Ideal source/load schematic: R then shunt C for LP; C then shunt R for HP. */
export function rcSchematic(mode: string): SchematicConfig {
  const low = mode === "lowpass";
  return {
    grid: { rows: 3, columns: 4 },
    elements: [
      { type: "terminal", cell: 0, side: "east", id: "vin", label: "Vin" },
      { type: low ? "resistor" : "capacitor", cell: 1, id: low ? "r" : "c", label: low ? "R" : "C", orientation: "horizontal" },
      { type: "node", cell: 2, sides: ["west", "east", "south"] },
      { type: "terminal", cell: 3, side: "west", id: "vout", label: "Vout" },
      { type: low ? "capacitor" : "resistor", cell: 6, id: low ? "c" : "r", label: low ? "C" : "R", orientation: "vertical" },
      { type: "ground", cell: 10 },
    ],
  };
}
