import { collectionEquationLabels, collectionId, collectionSymbol, generateCollectionEquation, generateCollectionSchematic } from "./generators";
import type { CollectionKind, ToolConfig, ToolGenerationContext, ToolPresentation, ToolVariable } from "../../registry/types";
import { equivalentValue } from "./calculations";
const kindOptions = [
  { id: "resistance", label: "Resistors", unit: "Ω", factor: 1 },
  { id: "capacitance", label: "Capacitors", unit: "nF", factor: 1e-9 },
  { id: "inductance", label: "Inductors", unit: "mH", factor: 1e-3 },
] as const;

function generatePresentation({ mode, variant, parameters }: ToolGenerationContext): ToolPresentation {
  const kind: CollectionKind = variant === "capacitance" || variant === "inductance" ? variant : "resistance";
  const selected = kindOptions.find((option) => option.id === kind)!;
  const count = Math.max(2, Math.min(6, Number(parameters.componentCount) || 3));
  const connection = mode === "parallel" ? "parallel" : "series";
  const base = collectionSymbol(kind);
  const displayIds: Record<string, string> = {};
  const variables: Record<string, ToolVariable> = {};
  for (let index = 0; index < count; index++) {
    const displayId = collectionId(index);
    const id = `${kind}:${displayId}`;
    displayIds[displayId] = id;
    variables[id] = {
      name: `${base}${index + 1}`,
      title: `${selected.label.slice(0, -1)} ${index + 1}`,
      kind,
      defaultUnit: selected.unit,
      mathLabel: { base, sub: String(index + 1) },
    };
  }
  const activeVariables = Object.keys(variables);
  return {
    variables,
    activeVariables,
    mode: {
      id: mode,
      label: connection === "parallel" ? "Parallel" : "Series",
      variables: activeVariables,
      schematic: generateCollectionSchematic(kind, connection, count),
      equations: {},
    },
    expression: generateCollectionEquation(kind, connection, count),
    equationLabels: collectionEquationLabels(kind, count),
    displayIds,
    output: { id: "equivalent", label: `${base}eq`, kind },
  };
}

export const seriesParallelConfig: ToolConfig = {
  slug: "series-parallel",
  title: "Series & Parallel",
  defaultMode: "series",
  defaultSolveFor: "equivalent",
  variables: {},
  generate: generatePresentation,
  modes: [
    ...(["series", "parallel"] as const).map((id) => ({
      id,
      label: id === "series" ? "Series" : "Parallel",
      variables: [],
      schematic: { grid: { columns: 1, rows: 1 }, elements: [] },
      equations: {},
      variantGroup: "componentKind",
      defaultVariant: "resistance",
      variants: [
        { id: "resistance", label: "Resistors", variables: [], equations: {} },
        { id: "capacitance", label: "Capacitors", variables: [], equations: {} },
        { id: "inductance", label: "Inductors", variables: [], equations: {} },
      ],
    })),
  ],
  parameters: [
    { id: "componentCount", label: "Components", defaultValue: "3", options: [2, 3, 4, 5, 6].map(n => ({ value: String(n), label: String(n) })) },
  ],
  // The generic view calls evaluate() with the current presentation and inputs.
  evaluate: ({ mode, variant, parameters, values }) => {
    const kind: CollectionKind = variant === "capacitance" || variant === "inductance" ? variant : "resistance";
    const count = Math.max(2, Math.min(6, Number(parameters.componentCount) || 3));
    const parts = Array.from({ length: count }, (_, index) => values[`${kind}:${collectionId(index)}`] ?? null);
    const result = equivalentValue(kind, mode === "parallel" ? "parallel" : "series", parts);
    return result === null ? null : { ok: true, value: result };
  },
  inputPolicy: {
    allowCalculate: false,
    maxIndependent: Number.POSITIVE_INFINITY,
    clearOnEmpty: true,
    resetScope: "active",
    validate: (value) => Number.isFinite(value) && value >= 0
      ? null : "Enter a valid, nonnegative component value.",
  },
  info: {
    overview: "Find the equivalent resistance, capacitance, or ideal inductance of components connected in series or parallel.",
    equations: ["Resistors: Rseries = ΣRᵢ; 1/Rparallel = Σ(1/Rᵢ)", "Capacitors: 1/Cseries = Σ(1/Cᵢ); Cparallel = ΣCᵢ", "Uncoupled inductors: Lseries = ΣLᵢ; 1/Lparallel = Σ(1/Lᵢ)"],
    applications: [
      { title: "Combining resistor values", description: "Calculate equivalent resistance for resistor networks.", keywords: ["parallel resistor", "series resistor", "equivalent resistance"] },
      { title: "Capacitor banks", description: "Estimate the combined capacitance of capacitors in series or parallel.", keywords: ["capacitor bank", "equivalent capacitance"] },
      { title: "Inductor combinations", description: "Estimate ideal combined inductance for uncoupled coils.", keywords: ["inductor", "equivalent inductance"] },
    ],
    considerations: ["All components are modeled as ideal.", "Inductor calculations assume negligible mutual coupling.", "Component voltage and current ratings must be checked separately."],
  },
};
