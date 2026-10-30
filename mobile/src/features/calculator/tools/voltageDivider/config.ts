import type { ToolConfig } from "../../registry/types";
import {
  solveDivider,
  type DividerMode,
  type DividerValues,
  type VariableId,
} from "./calculations";
import { dividerEquation } from "./equations";
import { loadedElements, loadedGrid, unloadedElements, unloadedGrid } from "./schematic";

const variables: ToolConfig["variables"] = {
  vin: {
    name: "Vin",
    title: "Input voltage",
    kind: "voltage",
    defaultUnit: "V",
    mathLabel: { base: "V", sub: "in" },
  },
  vout: {
    name: "Vout",
    title: "Output voltage",
    kind: "voltage",
    defaultUnit: "V",
    mathLabel: { base: "V", sub: "out" },
  },
  r1: {
    name: "R1",
    title: "Upper resistor",
    kind: "resistance",
    defaultUnit: "kΩ",
    mathLabel: { base: "R", sub: "1" },
  },
  r2: {
    name: "R2",
    title: "Lower resistor",
    kind: "resistance",
    defaultUnit: "kΩ",
    mathLabel: { base: "R", sub: "2" },
  },
  rl: {
    name: "RL",
    title: "Load resistor",
    kind: "resistance",
    defaultUnit: "kΩ",
    mathLabel: { base: "R", sub: "L" },
  },
};
const mode = (
  id: DividerMode,
  label: string,
  grid: typeof unloadedGrid,
  elements: typeof unloadedElements
) => {
  const ids =
    id === "loaded" ? ["vin", "vout", "r1", "r2", "rl"] : ["vin", "vout", "r1", "r2"];
  return {
    id,
    label,
    variables: ids,
    schematic: { grid, elements, aliases: { voutTap: "vout" } },
    equations: Object.fromEntries(
      ids.map((variable) => [variable, dividerEquation(id, variable)])
    ),
  };
};
export const voltageDividerConfig: ToolConfig = {
  slug: "voltage-divider",
  title: "Voltage Divider",
  info: {
    overview:
      "A voltage divider uses two series resistors to produce a fraction of an input voltage. A load connected to the output changes the effective resistance of the lower branch and therefore changes the output voltage.",
    equations: [
      "Vout = Vin × R2 / (R1 + R2)",
      "Loaded: Req = R2 × RL / (R2 + RL)",
      "Loaded: Vout = Vin × Req / (R1 + Req)",
    ],
    applications: [
      {
        title: "Voltage scaling",
        description:
          "Scale a voltage to a lower level appropriate for a measurement input.",
        keywords: ["reduce voltage", "attenuator", "ADC input"],
      },
      {
        title: "Sensor and reference bias",
        description:
          "Generate a bias or reference level for high-impedance circuit inputs.",
        keywords: ["sensor bias", "reference voltage", "bias network"],
      },
      {
        title: "Resistor selection",
        description: "Choose upper and lower resistor values for a desired output ratio.",
        keywords: ["resistor ratio", "potentiometer", "R1 R2"],
      },
      {
        title: "Output loading",
        description: "Explore how connecting a load resistor reduces the output voltage.",
        keywords: ["loaded divider", "load resistance", "input impedance"],
      },
    ],
    considerations: [
      "A divider is not a regulated power supply: the output voltage changes with load current.",
      "Resistor tolerance, source impedance, and input impedance affect accuracy.",
      "Check the resistor power dissipation and the allowable voltage range of the connected circuit.",
    ],
  },
  defaultMode: "unloaded",
  defaultSolveFor: "vout",
  variables,
  modes: [
    mode("unloaded", "Unloaded", unloadedGrid, unloadedElements),
    mode("loaded", "Loaded", loadedGrid, loadedElements),
  ],
  solve: (modeId, output, inputs) =>
    solveDivider(modeId as DividerMode, output as VariableId, inputs as DividerValues),
};
