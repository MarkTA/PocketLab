import type { FrequencySample, SolveResult } from "../../registry/types";

export function solveRc(output: string, inputs: Record<string, number>): SolveResult {
  const { r, c, fc } = inputs;
  if (output === "fc" && r > 0 && c > 0) return { ok: true, value: 1 / (2 * Math.PI * r * c) };
  if (output === "r" && fc > 0 && c > 0) return { ok: true, value: 1 / (2 * Math.PI * fc * c) };
  if (output === "c" && fc > 0 && r > 0) return { ok: true, value: 1 / (2 * Math.PI * fc * r) };
  return { ok: false, error: "Enter two positive values to calculate the third." };
}

/** Ideal unloaded first-order passive RC, driven by an ideal voltage source. */
export function simulateRc(values: Readonly<Record<string, number>>, mode: string): FrequencySample[] | null {
  const fc = values.fc > 0 ? values.fc : (values.r > 0 && values.c > 0 ? 1 / (2 * Math.PI * values.r * values.c) : Number.NaN);
  if (!(fc > 0) || !Number.isFinite(fc)) return null;
  const highPass = mode === "highpass";
  const samples: FrequencySample[] = [];
  for (let i = 0; i <= 120; i++) {
    const frequency = fc * 10 ** (-2 + i / 30);
    const ratio = frequency / fc;
    const amplitude = highPass ? ratio / Math.sqrt(1 + ratio * ratio) : 1 / Math.sqrt(1 + ratio * ratio);
    const phaseDeg = highPass ? Math.atan(1 / ratio) * 180 / Math.PI : -Math.atan(ratio) * 180 / Math.PI;
    samples.push({ frequency, magnitudeDb: 20 * Math.log10(amplitude), phaseDeg });
  }
  return samples;
}
