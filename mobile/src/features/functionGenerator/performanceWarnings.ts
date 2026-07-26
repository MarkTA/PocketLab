import {
  getOutputEnvelope,
  RECOMMENDED_FUNCTION_GENERATOR_LIMITS,
} from "../../lib/hardwareLimits";
import type { Waveform } from "../../types/pocketLab";

type WarningSettings = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
};

export function getFunctionGeneratorWarnings(
  settings: WarningSettings
): readonly string[] {
  const warnings: string[] = [];
  const envelope = getOutputEnvelope(settings.amplitudeVpp, settings.offsetV);

  if (
    settings.amplitudeVpp > RECOMMENDED_FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp ||
    envelope.minimumOutputV < RECOMMENDED_FUNCTION_GENERATOR_LIMITS.minimumOutputV ||
    envelope.maximumOutputV > RECOMMENDED_FUNCTION_GENERATOR_LIMITS.maximumOutputV
  ) {
    warnings.push(
      `Requested endpoints are ${envelope.minimumOutputV.toFixed(2)} V to ` +
        `${envelope.maximumOutputV.toFixed(2)} V, beyond the characterized ` +
        "±4.00 V margin; clipping or amplitude error may be visible."
    );
  }

  if (
    settings.offsetV < RECOMMENDED_FUNCTION_GENERATOR_LIMITS.minOffsetV ||
    settings.offsetV > RECOMMENDED_FUNCTION_GENERATOR_LIMITS.maxOffsetV
  ) {
    warnings.push(
      "Offset is beyond the characterized −2.00 V to +2.00 V control margin."
    );
  }

  if (
    ["triangle", "rampUp", "rampDown"].includes(settings.waveform) &&
    settings.frequencyHz > 50_000
  ) {
    warnings.push(
      "Above the characterized 50 kHz triangle/ramp range; expect visibly curved slopes."
    );
  } else if (
    ["triangle", "rampUp", "rampDown"].includes(settings.waveform) &&
    settings.frequencyHz > 10_000
  ) {
    warnings.push("Triangle/ramp shape may round, especially with loads below 10 kΩ.");
  } else if (settings.waveform !== "dc" && settings.frequencyHz > 100_000) {
    warnings.push(
      "Above the characterized 100 kHz range; amplitude loss or waveform distortion may occur."
    );
  }

  return warnings;
}