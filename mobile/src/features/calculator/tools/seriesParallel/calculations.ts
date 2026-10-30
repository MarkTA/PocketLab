import type { CollectionKind } from "../../registry/types";
/** All values are SI. Null signals an incomplete or invalid circuit. */
export function equivalentValue(kind: CollectionKind, connection: "series" | "parallel", values: readonly (number | null)[]): number | null {
  if (!values.length || values.some(v => v === null || !Number.isFinite(v) || v < 0)) return null;
  const known = values as number[];
  // Resistances and inductances combine identically in ideal uncoupled networks.
  const additive = kind === "capacitance" ? connection === "parallel" : connection === "series";
  if (additive) return known.reduce((a, b) => a + b, 0);
  // A shorted resistor/inductor or an ideal open-equivalent capacitor has zero equivalent in reciprocal mode.
  if (known.includes(0)) return 0;
  const reciprocal = known.reduce((sum, value) => sum + 1 / value, 0);
  return reciprocal > 0 ? 1 / reciprocal : null;
}
