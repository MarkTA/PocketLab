import type { ToolConfig } from "../../registry/types";
import { solveOhmsLaw } from "./calculations";
import { resolveOhmsValues } from "./resolveValues";
import {
  ohmsEquations,
  powerCurrentResistanceEquations,
  powerEquations,
  powerVoltageResistanceEquations,
} from "./equations";

/** Closed-loop Ohm’s law and power circuit layouts. */
export const ohmsLawConfig: ToolConfig = {
  slug: "ohms-law-power",
  title: "Ohm's Law & Power",
  info: {
    overview: "Ohm's law relates voltage, current, and resistance in an ohmic component. The power relationships help estimate energy dissipation and select parts that can operate safely.",
    equations: ["V = I × R", "P = V × I", "P = I² × R", "P = V² / R"],
    applications: [
      { title: "LED current limiting", description: "Estimate the series resistance required for an LED, using the voltage across the resistor and the desired LED current.", keywords: ["LED resistor", "series resistor", "current limit"] },
      { title: "Resistor power dissipation", description: "Calculate heat-producing power in a resistor to help choose a suitable wattage rating.", keywords: ["wattage", "heat", "power rating"] },
      { title: "Circuit troubleshooting", description: "Compare measured current, voltage, and resistance with the values predicted for a resistive load.", keywords: ["diagnostics", "test", "measure"] },
      { title: "Load and supply estimates", description: "Estimate the current and power requirements of a simple resistive load.", keywords: ["battery load", "supply current"] },
    ],
    considerations: [
      "A single fixed R describes an ohmic component; LEDs and other nonlinear devices require their own voltage-current models.",
      "The direction of the current arrow is a reference convention. Negative current means flow opposite to that arrow.",
      "Resistor ratings need margin for temperature, tolerance, and operating conditions.",
    ],
  },
  defaultMode: "ohms",
  defaultSolveFor: "voltage",
  variables: {
    voltage: {
      name: "V",
      title: "Voltage",
      kind: "voltage",
      defaultUnit: "V",
      mathLabel: { base: "V", sub: "" },
    },
    current: {
      name: "I",
      title: "Current",
      kind: "current",
      defaultUnit: "mA",
      mathLabel: { base: "I", sub: "" },
    },
    resistance: {
      name: "R",
      title: "Resistance",
      kind: "resistance",
      defaultUnit: "kΩ",
      mathLabel: { base: "R", sub: "" },
    },
    power: {
      name: "P",
      title: "Power",
      kind: "power",
      defaultUnit: "mW",
      mathLabel: { base: "P", sub: "" },
    },
  },
  modes: [
    {
      id: "ohms",
      label: "Ohm's Law",
      variables: ["voltage", "current", "resistance"],
      schematic: {
        // A closed reference loop: battery positive at top; clockwise current is positive.
        grid: { rows: 3, columns: 3 },
        elements: [
          { type: "wire", cell: 0, sides: ["east", "south"] },
          { type: "wire", cell: 1, sides: ["west", "east"] },
          { type: "wire", cell: 2, sides: ["west", "south"] },
          {
            type: "battery",
            cell: 3,
            id: "voltage",
            label: "V",
            orientation: "vertical",
            positive: "north",
          },
          {
            type: "currentArrow",
            cell: 4,
            id: "current",
            label: "I",
            direction: "cw",
            radius: 42,
          },
          {
            type: "resistor",
            cell: 5,
            id: "resistance",
            label: "R",
            orientation: "vertical",
          },
          { type: "wire", cell: 6, sides: ["north", "east"] },
          { type: "wire", cell: 7, sides: ["west", "east"] },
          { type: "wire", cell: 8, sides: ["north", "west"] },
        ],
      },
      equations: ohmsEquations,
    },
    {
      id: "power",
      label: "Power",
      variables: ["voltage", "current", "power"],
      variants: [
        {
          id: "vi",
          label: "V · I",
          variables: ["voltage", "current", "power"],
          equations: powerEquations,
        },
        {
          id: "ir",
          label: "I² · R",
          variables: ["current", "resistance", "power"],
          equations: powerCurrentResistanceEquations,
        },
        {
          id: "vr",
          label: "V² / R",
          variables: ["voltage", "resistance", "power"],
          equations: powerVoltageResistanceEquations,
        },
      ],
      schematic: {
        // The resistor remains R in every power equation variant.
        grid: { rows: 3, columns: 3 },
        elements: [
          { type: "wire", cell: 0, sides: ["east", "south"] },
          { type: "wire", cell: 1, sides: ["west", "east"] },
          { type: "wire", cell: 2, sides: ["west", "south"] },
          {
            type: "battery",
            cell: 3,
            id: "voltage",
            label: "V",
            orientation: "vertical",
            positive: "north",
          },
          {
            type: "currentArrow",
            cell: 4,
            id: "current",
            label: "I",
            direction: "cw",
            radius: 42,
          },
          {
            type: "resistor",
            cell: 5,
            id: "resistance",
            label: "R",
            orientation: "vertical",
          },
          { type: "wire", cell: 6, sides: ["north", "east"] },
          { type: "wire", cell: 7, sides: ["west", "east"] },
          { type: "wire", cell: 8, sides: ["north", "west"] },
        ],
      },
      equations: powerEquations,
    },
  ],
  independentInputs: 2,
  resolveValues: resolveOhmsValues,
  solve: solveOhmsLaw,
};
