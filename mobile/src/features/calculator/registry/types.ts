import type { ToolSelectConfig } from "../components/ToolSelectInput";
import type { GridElement, GridSize } from "../schematic/grid";
import type { Expression } from "./expression";
export type VariableKind = "voltage" | "resistance" | "current" | "power" | "capacitance" | "inductance";
export type ToolVariable = { name: string; title: string; kind: VariableKind; defaultUnit: string; mathLabel: { base: string; sub: string } };
export type SchematicConfig = { grid: GridSize; elements: GridElement[]; aliases?: Record<string, string> };
export type EquationConfig = { labels: Record<string, { base: string; sub: string }> };
export type SolveResult = { ok: true; value: number } | { ok: false; error: string };
export type ToolEquationVariant = { id: string; label: string; preferredSolveFor?: string; variables: string[]; equations: Record<string, Expression> };
export type ToolModeConfig = {
  variants?: ToolEquationVariant[];
  /** Optional shared selection across modes (e.g. component kind). */
  variantGroup?: string;
  defaultVariant?: string;
  preferredSolveFor?: string;
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
  defaultKind: CollectionKind;
  defaultConnection: "series" | "parallel";
};
/** Resolved presentation for the currently selected tool controls. */
export type ToolPresentation = {
  variables: Record<string, ToolVariable>;
  mode: ToolModeConfig;
  /** IDs participating in the selected equation. */
  activeVariables: string[];
  expression?: Expression;
  equationLabels?: EquationConfig["labels"];
  /** Maps renderer IDs to the corresponding stable state IDs. */
  displayIds?: Record<string, string>;
  /** Derived output is not counted among independently entered variables. */
  output?: { id: string; label: string; kind: VariableKind };
};
export type ToolGenerationContext = {
  mode: string;
  variant?: string;
  parameters: Readonly<Record<string, string>>;
};
/** Tool-specific behavior without tool-specific branches in ToolView. */
export type ToolCalculationContext = {
  mode: string;
  variant?: string;
  parameters: Readonly<Record<string, string>>;
  target: string;
  values: Readonly<Record<string, number>>;
  activeVariables: readonly string[];
  independentVariables: readonly string[];
};
export type ToolInputPolicy = {
  /** false for collections whose output cannot be entered as an independent input. */
  allowCalculate?: boolean;
  /** All entries may be retained when using variable-length collections. */
  maxIndependent?: number | ((context: ToolCalculationContext) => number);
  /** Blank entry removes a previous value instead of showing a validation error. */
  clearOnEmpty?: boolean;
  /** Validation error; null means the value is accepted. */
  validate?: (value: number, kind: VariableKind) => string | null;
  /** Reset only variables in the current presentation, preserving other variants. */
  resetScope?: "all" | "active";
};
export type ToolConfig = {
  /** Dynamic tools generate the same presentation consumed by the shared view. */
  generate?: (context: ToolGenerationContext) => ToolPresentation;

  /** Per-tool calculation and input behavior supplied through generic contracts. */
  evaluate?: (context: ToolCalculationContext) => SolveResult | null;
  inputPolicy?: ToolInputPolicy;
  /** Discrete settings rendered by the shared controller. */
  parameters?: ToolSelectConfig[];
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
