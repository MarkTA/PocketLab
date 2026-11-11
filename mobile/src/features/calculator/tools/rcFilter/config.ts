import type { ToolConfig } from "../../registry/types";
import { solveRc, simulateRc } from "./calculations";
import { rcSchematic } from "./schematic";
import { rcEquations } from "./equations";

export const rcFilterConfig: ToolConfig = {
  slug: "rc-filter",
  title: "RC Filter",
  defaultMode: "lowpass",
  defaultSolveFor: "fc",
  variables: {
    r: { name: "R", title: "Resistance", kind: "resistance", defaultUnit: "kΩ", mathLabel: { base: "R", sub: "" } },
    c: { name: "C", title: "Capacitance", kind: "capacitance", defaultUnit: "nF", mathLabel: { base: "C", sub: "" } },
    fc: { name: "fc", title: "Cutoff frequency", kind: "frequency", defaultUnit: "Hz", mathLabel: { base: "f", sub: "c" } },
  },
  modes: [
    { id: "lowpass", label: "Low-Pass", variables: ["r", "c", "fc"], schematic: rcSchematic("lowpass"), equations: rcEquations },
    { id: "highpass", label: "High-Pass", variables: ["r", "c", "fc"], schematic: rcSchematic("highpass"), equations: rcEquations },
  ],
  inputPolicy: {
    validate: (value) => Number.isFinite(value) && value > 0 ? null : "Enter a positive, finite value.",
  },
  solve: (_mode, output, values) => solveRc(output, values),
  frequencyResponse: { title: "Ideal frequency response", simulate: simulateRc },
  info: {
    overview: "A first-order passive RC filter uses a resistor and capacitor to pass lower or higher frequencies. The ideal unloaded cutoff is where the magnitude is 3.01 dB below passband.",
    equations: ["fc = 1 / (2πRC)", "Low-pass: H(s) = 1 / (1 + sRC)", "High-pass: H(s) = sRC / (1 + sRC)"],
    applications: [
      { title: "Signal smoothing", description: "Use a low-pass RC network to attenuate rapid voltage fluctuations.", keywords: ["noise filtering", "low pass", "smooth signal"] },
      { title: "AC coupling", description: "Use a high-pass network to attenuate DC and low-frequency signals.", keywords: ["DC blocking", "high pass", "coupling capacitor"] },
      { title: "Cutoff frequency design", description: "Select resistor and capacitor values for a target corner frequency.", keywords: ["filter bandwidth", "frequency response", "RC filter"] },
    ],
    considerations: [
      "This is an ideal first-order passive model with zero source impedance and negligible output loading.",
      "Source resistance and load impedance alter the real cutoff and insertion loss.",
      "Component tolerances and capacitor parasitics can affect real measurements.",
    ],
  },
};
