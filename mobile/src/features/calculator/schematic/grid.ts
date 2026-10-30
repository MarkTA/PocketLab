/** Logical square cells, numbered left-to-right and then top-to-bottom. */
import type { CurrentArrowDirection } from "./symbols/CurrentArrowSymbol";

export type Side = "north" | "east" | "south" | "west";
export type Orientation = "vertical" | "horizontal";
export type ElementState = "empty" | "entered" | "measured" | "calculated" | "inactive";
export type GridPoint = { x: number; y: number };
export type GridSize = { rows: number; columns: number };

export type GridElement =
  | {
      type: "resistor";
      cell: number;
      id: string;
      label: string;
      orientation: Orientation;
    }
  | {
      type: "battery";
      cell: number;
      id: string;
      label: string;
      orientation?: Orientation;
      positive?: "north" | "south" | "east" | "west";
    }
  | {
      type: "currentArrow";
      cell: number;
      id: string;
      label: string;
      direction: CurrentArrowDirection;
      radius?: number;
      length?: number;
    }
  | { type: "wire"; cell: number; sides: Side[] }
  | { type: "node"; cell: number; sides: Side[]; id?: string; label?: string }
  | { type: "ground"; cell: number }
  | { type: "terminal"; cell: number; side: Side; id: string; label: string };

export function cellCenter(cell: number, columns: number): GridPoint {
  if (!Number.isInteger(cell) || cell < 0 || !Number.isInteger(columns) || columns < 1) {
    throw new Error("Invalid schematic grid cell");
  }
  return { x: (cell % columns) + 0.5, y: Math.floor(cell / columns) + 0.5 };
}

export function portPoint(side: Side): GridPoint {
  switch (side) {
    case "north":
      return { x: 0, y: -0.5 };
    case "east":
      return { x: 0.5, y: 0 };
    case "south":
      return { x: 0, y: 0.5 };
    case "west":
      return { x: -0.5, y: 0 };
  }
}

export function assertLayout(grid: GridSize, elements: readonly GridElement[]): void {
  if (
    !Number.isInteger(grid.rows) ||
    !Number.isInteger(grid.columns) ||
    grid.rows < 1 ||
    grid.columns < 1
  ) {
    throw new Error("Invalid schematic grid dimensions");
  }
  const occupied = new Set<number>();
  for (const element of elements) {
    const { cell } = element;
    if (!Number.isInteger(cell) || cell < 0 || cell >= grid.rows * grid.columns) {
      throw new Error(`Cell ${cell} lies outside the schematic grid`);
    }
    if (occupied.has(cell)) throw new Error(`Multiple elements occupy cell ${cell}`);
    occupied.add(cell);
  }
}
