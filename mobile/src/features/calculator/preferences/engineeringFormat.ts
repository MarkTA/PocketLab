import type { CalculatorPreferences } from "./calculatorPreferences";

export type EngineeringQuantity = "voltage" | "resistance" | "current" | "capacitance" | "inductance" | "frequency";
const units: Record<EngineeringQuantity, string> = {
  voltage: "V", resistance: "Ω", current: "A", capacitance: "F", inductance: "H", frequency: "Hz",
};
const prefixes: Record<number, string> = {
  [-12]: "p", [-9]: "n", [-6]: "µ", [-3]: "m", [0]: "", [3]: "k", [6]: "M", [9]: "G", [12]: "T",
};
export type FormattedQuantity = { mantissa: string; exponent: number | null; unit: string };
/** Produce display parts; calculations must always use the unrounded input. */
export function formatQuantityParts(value: number, kind: EngineeringQuantity, prefs: CalculatorPreferences): FormattedQuantity {
  const baseUnit = units[kind];
  if (!Number.isFinite(value)) return { mantissa: "—", exponent: null, unit: baseUnit };
  const significantFigures = Math.min(8, Math.max(2, prefs.significantFigures));
  const round = (n: number) => String(Number(n.toPrecision(significantFigures)));
  if (value === 0) return { mantissa: "0", exponent: null, unit: baseUnit };
  const abs = Math.abs(value);
  if (prefs.numberFormat === "decimal") {
    return { mantissa: round(value), exponent: null, unit: baseUnit };
  }
  if (prefs.numberFormat === "scientific") {
    const exponent = Math.floor(Math.log10(abs));
    const rounded = Number((value / 10 ** exponent).toPrecision(significantFigures));
    if (Math.abs(rounded) >= 10) return { mantissa: round(rounded / 10), exponent: exponent + 1, unit: baseUnit };
    return { mantissa: String(rounded), exponent, unit: baseUnit };
  }
  let exponent = Math.floor(Math.log10(abs) / 3) * 3;
  let coefficient = Number((value / 10 ** exponent).toPrecision(significantFigures));
  if (Math.abs(coefficient) >= 1000) { coefficient /= 1000; exponent += 3; }
  const prefixed = prefs.useSIPrefixes && prefixes[exponent] !== undefined && prefs.numberFormat === "auto";
  if (prefixed) return { mantissa: String(coefficient), exponent: null, unit: `${prefixes[exponent]}${baseUnit}` };
  // Engineering mode always shows a power of 10; auto without prefixes uses base units.
  if (prefs.numberFormat === "auto" && !prefs.useSIPrefixes) return { mantissa: round(value), exponent: null, unit: baseUnit };
  return { mantissa: String(coefficient), exponent, unit: baseUnit };
}
export function formatQuantity(value: number, kind: EngineeringQuantity, prefs: CalculatorPreferences): string {
  const result = formatQuantityParts(value, kind, prefs);
  return result.exponent === null
    ? `${result.mantissa} ${result.unit}`
    : `${result.mantissa} × 10^${result.exponent} ${result.unit}`;
}
