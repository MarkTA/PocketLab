/** Pure, SI-unit calculations for an ideal positive DC voltage divider. */
export type DividerMode = "unloaded" | "loaded";
export type VariableId = "vin" | "vout" | "r1" | "r2" | "rl";
export type DividerValues = Partial<Record<VariableId, number>>;
export type Solution = { ok: true; value: number } | { ok: false; error: string };

export const dividerIds = (mode: DividerMode): VariableId[] =>
  mode === "loaded" ? ["vin", "vout", "r1", "r2", "rl"] : ["vin", "vout", "r1", "r2"];

const fail = (error: string): Solution => ({ ok: false, error });
const valid = (id: VariableId, v: number): boolean =>
  Number.isFinite(v) && (id === "vin" || id === "vout" ? v > 0 : v > 0);

export function solveDivider(mode: DividerMode, unknown: VariableId, known: DividerValues): Solution {
  if (mode === "unloaded" && unknown === "rl") return fail("RL is unavailable in unloaded mode.");
  for (const id of dividerIds(mode)) {
    if (id !== unknown && !valid(id, known[id] ?? NaN)) return fail(`Set a valid ${id.toUpperCase()} first.`);
  }
  const vin = known.vin ?? NaN;
  const vout = known.vout ?? NaN;
  const r1 = known.r1 ?? NaN;
  const r2 = known.r2 ?? NaN;
  const rl = mode === "loaded" ? known.rl ?? NaN : Infinity;
  const parallel = (a: number, b: number) => a === Infinity ? b : b === Infinity ? a : a * b / (a + b);
  let result: number;
  switch (unknown) {
    case "vout": result = vin * parallel(r2, rl) / (r1 + parallel(r2, rl)); break;
    case "vin": result = vout * (r1 + parallel(r2, rl)) / parallel(r2, rl); break;
    case "r1": result = parallel(r2, rl) * (vin / vout - 1); break;
    case "r2": {
      const req = r1 * vout / (vin - vout);
      if (mode === "loaded" && req >= rl) return fail("The load is too small for this target; R2 would not be positive.");
      result = mode === "unloaded" ? req : req * rl / (rl - req);
      break;
    }
    case "rl": {
      const req = r1 * vout / (vin - vout);
      if (req >= r2) return fail("R2 is too small for a positive load resistance at this target.");
      result = req * r2 / (r2 - req);
      break;
    }
  }
  if (!Number.isFinite(result) || result <= 0) return fail("These inputs have no physically valid positive solution.");
  return { ok: true, value: result };
}
