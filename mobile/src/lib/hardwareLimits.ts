// src/lib/hardwareLimits.ts

export const AD9833_LIMITS = {
  minFrequencyHz: 1,
  maxFrequencyHz: 1_000_000, // conservative V1 target
  minAmplitudeVpp: 0,
  maxAmplitudeVpp: 5, // based on module spec
  minPeriodSec: 1 / 1_000_000,
  maxPeriodSec: 1,
};

export const FUNCTION_GENERATOR_LIMITS = {
  minFrequencyHz: 1,
  maxFrequencyHz: 1_000_000,
  dcFrequencyHz: 0,

  minAmplitudeVpp: 0,
  maxAmplitudeVpp: 4.15,

  // Bipolar AC output target. Keep the offset control inside the intended
  // +/-2.5 V range and constrain the complete waveform to the safe rails.
  minOffsetV: -2.5,
  maxOffsetV: 2.5,

  minActiveOutputV: -4.5,
  maxActiveOutputV: 4.5,
};

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
