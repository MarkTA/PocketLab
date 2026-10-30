import type { ToolSelectConfig } from "../components/ToolSelectInput";
import type { GridElement, GridSize } from "../schematic/grid";
import type { Expression } from "./expression";
export type VariableKind = "voltage" | "resistance" | "current" | "power";
export type ToolVariable = { name: string; title: string; kind: VariableKind; defaultUnit: string; mathLabel: { base: string; sub: string } };
export type SchematicConfig = { grid: GridSize; elements: GridElement[]; aliases?: Record<string, string> };
export type EquationConfig = { labels: Record<string, { base: string; sub: string }> };
export type SolveResult = { ok: true; value: number } | { ok: false; error: string };
export type ToolEquationVariant = { id: string; label: string; variables: string[]; equations: Record<string, Expression> };
export type ToolModeConfig = {
  variants?: ToolEquationVariant[];
  id: string; label: string; variables: string[]; schematic: SchematicConfig;
  equations: Record<string, Expression>;
};
export type ToolApplication = { title: string; description: string; keywords?: string[] };
export type ToolInfo = {
  overview: string;
  equations: string[];
  applications: ToolApplication[];
  considerations?: string[];
};
export type CollectionKind = "resistance" | "capacitance" | "inductance";
export type CollectionToolConfig = {
  kindOptions: { id: CollectionKind; label: string; unit: string; factor: number }[];
  count: ToolSelectConfig;
  defaultKind: CollectionKind;
  defaultConnection: "series" | "parallel";
};
export type ToolConfig = {
  collection?: CollectionToolConfig;
  info?: ToolInfo;
  slug: string; title: string; defaultMode: string; defaultSolveFor: string;
  variables: Record<string, ToolVariable>;
  modes: ToolModeConfig[];
  solve: (mode: string, output: string, inputs: Record<string, number>, variant?: string) => SolveResult;
  /** Independent manual inputs required for this tool; defaults to mode variables minus one. */
  independentInputs?: number | ((mode: string) => number);
  /** Derive additional values without changing the entered inputs. */
  resolveValues?: (inputs: Record<string, number>, mode: string) => Record<string, number>;
};
