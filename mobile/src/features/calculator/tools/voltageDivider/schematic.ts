import type { GridElement, GridSize } from "../../schematic/grid";
export const unloadedGrid: GridSize = { rows: 3, columns: 4 };
export const unloadedElements: GridElement[] = [
  { type: "terminal", cell: 0, side: "east", id: "vin", label: "Vin" },
  { type: "resistor", cell: 1, id: "r1", label: "R1", orientation: "horizontal" },
  { type: "node", cell: 2, sides: ["west", "east", "south"], id: "vout", label: "Vout" },
  { type: "terminal", cell: 3, side: "west", id: "voutTap", label: "Vout" },
  { type: "resistor", cell: 6, id: "r2", label: "R2", orientation: "vertical" },
  { type: "ground", cell: 10 },
];

export const loadedGrid: GridSize = { rows: 6, columns: 6 };
export const loadedElements: GridElement[] = [
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

