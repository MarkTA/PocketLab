/* src/features/dmm/graph/voltageGraphUtils.ts */

import type { DmmSample } from "../hooks/useContinuousDmm";

export type VoltagePoint = { timestamp: number; value: number };

export type VoltageStatistics = {
  count: number;
  minimum: number;
  maximum: number;
  average: number;
  peakToPeak: number;
};

export type VoltageSeries = {
  points: VoltagePoint[];
  yMin: number;
  yMax: number;
  statistics: VoltageStatistics | null;
};

/** All statistics are computed on exactly the samples visible in the graph. */
export function calculateVoltageStatistics(
  points: readonly VoltagePoint[]
): VoltageStatistics | null {
  if (points.length === 0) {
    return null;
  }

  let minimum = Infinity;
  let maximum = -Infinity;
  let sum = 0;

  for (const point of points) {
    minimum = Math.min(minimum, point.value);
    maximum = Math.max(maximum, point.value);
    sum += point.value;
  }

  return {
    count: points.length,
    minimum,
    maximum,
    average: sum / points.length,
    peakToPeak: maximum - minimum,
  };
}

/**
 * Prepare valid DC-voltage samples for a fixed-width, time-based display.
 * Keep timestamps in milliseconds so irregular BLE response times are visible.
 *
 * This function is deliberately independent of React and the rendering layer.
 */
export function prepareVoltageSeries(
  samples: readonly DmmSample[],
  windowEndMs: number,
  windowMs = 30_000
): VoltageSeries {
  const startMs = windowEndMs - windowMs;
  const points = samples
    .filter(
      (sample): sample is DmmSample & { value: number } =>
        sample.mode === "VOLTAGE" &&
        sample.unit === "V" &&
        !sample.overload &&
        sample.value !== null &&
        Number.isFinite(sample.value) &&
        sample.timestamp >= startMs &&
        sample.timestamp <= windowEndMs
    )
    .map((sample) => ({ timestamp: sample.timestamp, value: sample.value }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const statistics = calculateVoltageStatistics(points);

  if (!statistics) {
    return { points, yMin: -0.005, yMax: 0.005, statistics: null };
  }

  const { minimum, maximum, peakToPeak } = statistics;

  // Pad the trace in both directions. For a stable DC signal a small minimum
  // span keeps the waveform visible without making the axis degenerate.
  const padding = Math.max(
    peakToPeak * 0.12,
    Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.002,
    0.005
  );

  return {
    points,
    yMin: minimum - padding,
    yMax: maximum + padding,
    statistics,
  };
}
