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

  // OFFSET is the physical AD5626 command. The final bipolar output center is
  // OFFSET - bipolarReferenceV.
  minOffsetV: 0,
  maxOffsetV: 4.089,
  bipolarReferenceV: 2.027,

  minActiveOutputV: -4.4,
  maxActiveOutputV: 4.4,
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