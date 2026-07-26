// Keep these values synchronized with firmware/PocketLab-FG/PocketLab-FG.ino.

export const AD9833_LIMITS = {
  minFrequencyHz: 1,
  maxFrequencyHz: 1_000_000,
  minPeriodSec: 1 / 1_000_000,
  maxPeriodSec: 1,
} as const;

export type FunctionGeneratorLimits = {
  minFrequencyHz: number;
  maxFrequencyHz: number;
  dcFrequencyHz: number;
  minAmplitudeVpp: number;
  maxAmplitudeVpp: number;
  minOffsetV: number;
  maxOffsetV: number;
  minimumOutputV: number;
  maximumOutputV: number;
};

/**
 * Absolute command safety limits enforced by firmware 0.7.x. Approaching the
 * endpoint limits may intentionally produce clipping.
 *
 * offsetV is the signed center voltage at the final output. It is no longer
 * the raw, unipolar AD5626 voltage.
 */
export const FIRMWARE_FUNCTION_GENERATOR_LIMITS: FunctionGeneratorLimits = {
  minFrequencyHz: 1,
  maxFrequencyHz: 1_000_000,
  dcFrequencyHz: 0,
  minAmplitudeVpp: 0,
  maxAmplitudeVpp: 4.15,
  minOffsetV: -2.02,
  maxOffsetV: 2.06,
  minimumOutputV: -5,
  maximumOutputV: 5,
};

// Backward-compatible name for UI code that only needs the firmware limits.
export const FUNCTION_GENERATOR_LIMITS = FIRMWARE_FUNCTION_GENERATOR_LIMITS;

/**
 * Characterized/clean-output guidance. Crossing these values is educationally
 * useful and remains allowed; the UI should warn rather than reject.
 */
export const RECOMMENDED_FUNCTION_GENERATOR_LIMITS: FunctionGeneratorLimits = {
  ...FIRMWARE_FUNCTION_GENERATOR_LIMITS,
  maxAmplitudeVpp: 4,
  minOffsetV: -2,
  maxOffsetV: 2,
  minimumOutputV: -4,
  maximumOutputV: 4,
};

export type OutputEnvelope = {
  minimumOutputV: number;
  maximumOutputV: number;
};

export function getOutputEnvelope(amplitudeVpp: number, offsetV: number): OutputEnvelope {
  const halfAmplitude = amplitudeVpp / 2;

  return {
    minimumOutputV: offsetV - halfAmplitude,
    maximumOutputV: offsetV + halfAmplitude,
  };
}

export function getMaximumAmplitudeVpp(
  offsetV: number,
  limits: FunctionGeneratorLimits = FIRMWARE_FUNCTION_GENERATOR_LIMITS
): number {
  return Math.max(
    0,
    Math.min(
      2 * (offsetV - limits.minimumOutputV),
      2 * (limits.maximumOutputV - offsetV),
      limits.maxAmplitudeVpp
    )
  );
}

export function getOffsetRangeForAmplitude(
  amplitudeVpp: number,
  limits: FunctionGeneratorLimits = FIRMWARE_FUNCTION_GENERATOR_LIMITS
): { minimum: number; maximum: number } {
  const halfAmplitude = amplitudeVpp / 2;

  return {
    minimum: Math.max(limits.minOffsetV, limits.minimumOutputV + halfAmplitude),
    maximum: Math.min(limits.maxOffsetV, limits.maximumOutputV - halfAmplitude),
  };
}

export function settingsFitOutputEnvelope(
  amplitudeVpp: number,
  offsetV: number,
  limits: FunctionGeneratorLimits = FIRMWARE_FUNCTION_GENERATOR_LIMITS
): boolean {
  if (
    !Number.isFinite(amplitudeVpp) ||
    !Number.isFinite(offsetV) ||
    amplitudeVpp < limits.minAmplitudeVpp ||
    amplitudeVpp > limits.maxAmplitudeVpp ||
    offsetV < limits.minOffsetV ||
    offsetV > limits.maxOffsetV
  ) {
    return false;
  }

  const envelope = getOutputEnvelope(amplitudeVpp, offsetV);

  return (
    envelope.minimumOutputV >= limits.minimumOutputV &&
    envelope.maximumOutputV <= limits.maximumOutputV
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function frequencyToPeriodSec(frequencyHz: number) {
  if (frequencyHz === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return 1 / frequencyHz;
}

export function periodSecToFrequency(periodSec: number) {
  return 1 / periodSec;
}