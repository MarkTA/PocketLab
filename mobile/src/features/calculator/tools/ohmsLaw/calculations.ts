import type { SolveResult } from "../../registry/types";

/** All input values are in SI units. Guard invalid and singular solutions. */
export function solveOhmsLaw(mode: string, target: string, input: Record<string, number>, variant?: string): SolveResult {
  const { voltage: v, current: i, resistance: r, power: p } = input;
  let result: number;
  if (mode === "ohms") {
    switch (target) {
      case "voltage": result = i * r; break;
      case "current": result = v / r; break;
      case "resistance": result = v / i; break;
      default: return { ok: false, error: "Unknown Ohm's Law variable." };
    }
  } else if (mode === "power") {
    if (variant === "ir") {
      if (r < 0 || p < 0) return { ok: false, error: "Resistive power and resistance must be nonnegative." };
      switch (target) {
        case "power": result = i * i * r; break;
        case "current": result = Math.sqrt(p / r); break;
        case "resistance": result = p / (i * i); break;
        default: return { ok: false, error: "Unknown power variable." };
      }
    } else if (variant === "vr") {
      if (r < 0 || p < 0) return { ok: false, error: "Resistive power and resistance must be nonnegative." };
      switch (target) {
        case "power": result = v * v / r; break;
        case "voltage": result = Math.sqrt(p * r); break;
        case "resistance": result = v * v / p; break;
        default: return { ok: false, error: "Unknown power variable." };
      }
    } else {
      switch (target) {
        case "power": result = v * i; break;
        case "voltage": result = p / i; break;
        case "current": result = p / v; break;
        default: return { ok: false, error: "Unknown power variable." };
      }
    }
  } else return { ok: false, error: "Unknown calculation mode." };

  if (!Number.isFinite(result)) return { ok: false, error: "Cannot divide by zero or produce an infinite result." };
  // Signed voltage/current are valid relative to the schematic reference direction.
  // Resistance remains a passive, nonnegative quantity.
  if (target === "resistance" && result < 0) return { ok: false, error: "Resistance cannot be negative." };
  return { ok: true, value: result };
}
