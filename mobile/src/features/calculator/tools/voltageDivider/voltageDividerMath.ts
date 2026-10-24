/** Pure voltage divider mathematics. All resistances are in ohms. */
export type SolveFor = "r1" | "r2";
export type DividerInput = {
  vin: number;
  targetVout: number;
  knownResistance: number;
  solveFor: SolveFor;
  loadResistance?: number;
};
export type DividerResult = {
  r1: number;
  r2: number;
  loadResistance?: number;
  outputResistance: number;
  actualVout: number;
  dividerCurrent: number;
  loadCurrent: number;
  sourceCurrent: number;
  r1Power: number;
  r2Power: number;
  loadPower: number;
};
export type DividerCalculation =
  | { ok: true; value: DividerResult }
  | { ok: false; error: string };

export function calculateVoltageDivider(input: DividerInput): DividerCalculation {
  const { vin, targetVout, knownResistance, solveFor, loadResistance } = input;
  if (![vin, targetVout, knownResistance].every(Number.isFinite) ||
      (loadResistance !== undefined && !Number.isFinite(loadResistance))) {
    return { ok: false, error: "Enter finite numeric values." };
  }
  if (vin <= 0 || targetVout <= 0 || targetVout >= vin) {
    return { ok: false, error: "For this positive-supply divider, use 0 < Vout < Vin." };
  }
  if (knownResistance <= 0 || (loadResistance !== undefined && loadResistance <= 0)) {
    return { ok: false, error: "Resistances must be greater than zero." };
  }
  if (solveFor !== "r1" && solveFor !== "r2") {
    return { ok: false, error: "Choose R1 or R2 to solve for." };
  }

  const load = loadResistance;
  let r1: number;
  let r2: number;
  if (solveFor === "r1") {
    r2 = knownResistance;
    const equivalent = load === undefined ? r2 : r2 * load / (r2 + load);
    r1 = equivalent * (vin / targetVout - 1);
  } else {
    r1 = knownResistance;
    const equivalent = r1 * targetVout / (vin - targetVout);
    if (load !== undefined && equivalent >= load) {
      return { ok: false, error: "This load is too small to achieve the target with the chosen R1." };
    }
    r2 = load === undefined ? equivalent : equivalent * load / (load - equivalent);
  }
  if (!Number.isFinite(r1) || !Number.isFinite(r2) || r1 <= 0 || r2 <= 0) {
    return { ok: false, error: "No physically valid resistor pair for these inputs." };
  }
  const outputResistance = load === undefined ? r2 : r2 * load / (r2 + load);
  const actualVout = vin * outputResistance / (r1 + outputResistance);
  const dividerCurrent = actualVout / r2;
  const loadCurrent = load === undefined ? 0 : actualVout / load;
  const sourceCurrent = (vin - actualVout) / r1;
  return { ok: true, value: {
    r1, r2, loadResistance: load, outputResistance, actualVout,
    dividerCurrent, loadCurrent, sourceCurrent,
    r1Power: (vin - actualVout) ** 2 / r1,
    r2Power: actualVout ** 2 / r2,
    loadPower: load === undefined ? 0 : actualVout ** 2 / load,
  } };
}
