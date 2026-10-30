import type { ToolConfig } from "../../registry/types";
export const seriesParallelConfig: ToolConfig = {
  slug: "series-parallel",
  title: "Series & Parallel",
  defaultMode: "series",
  defaultSolveFor: "equivalent",
  variables: {},
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
  solve: () => ({ ok: false, error: "Use the collection solver" }),
  collection: {
    defaultConnection: "series",
    defaultKind: "resistance",
    kindOptions: [
      { id: "resistance", label: "Resistors", unit: "Ω", factor: 1 },
      { id: "capacitance", label: "Capacitors", unit: "nF", factor: 1e-9 },
      { id: "inductance", label: "Inductors", unit: "mH", factor: 1e-3 },
    ],
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
