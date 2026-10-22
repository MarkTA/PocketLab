import type { DmmSample } from "../hooks/useContinuousDmm";
import type { SensitivityPreset } from "../components/DcVoltageSettings";

/** Timestamp-based averaging of valid voltage samples. */
export function averageRecentVoltage(samples: readonly DmmSample[], windowMs: number): number | null {
  const latest = samples.length ? samples[samples.length - 1].timestamp : undefined;
  if (latest === undefined) return null;
  let sum = 0;
  let count = 0;
  for (const sample of samples) {
    if (sample.timestamp < latest - windowMs || sample.mode !== "VOLTAGE" || sample.unit !== "V" ||
        sample.overload || sample.value === null || !Number.isFinite(sample.value)) continue;
    sum += sample.value;
    count++;
  }
  return count ? sum / count : null;
}

/** Rounds presentation only. Does not modify stored readings. */
export function formatDcVoltage(value: number, sensitivity: SensitivityPreset): { value: string; unit: string } {
  if (!Number.isFinite(value)) return { value: "—", unit: "V" };
  const resolution = sensitivity === "HIGH" ? 0.000001 : sensitivity === "LOW" ? 0.01 : 0.001;
  const rounded = Math.round(value / resolution) * resolution;
  if (sensitivity === "HIGH" && Math.abs(rounded) < 0.001 && rounded !== 0) {
    return { value: (rounded * 1e6).toFixed(0), unit: "µV" };
  }
  if (Math.abs(rounded) < 1 && rounded !== 0) {
    return { value: (rounded * 1000).toFixed(sensitivity === "HIGH" ? 3 : 0), unit: "mV" };
  }
  return { value: rounded.toFixed(sensitivity === "HIGH" ? 6 : sensitivity === "LOW" ? 2 : 3), unit: "V" };
}
