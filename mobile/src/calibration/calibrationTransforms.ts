import {
  FIRMWARE_FUNCTION_GENERATOR_LIMITS,
  getOutputEnvelope,
  settingsFitOutputEnvelope,
  type FunctionGeneratorLimits,
} from "../lib/hardwareLimits";
import { deriveOperatingLimits, type CalibrationProfile } from "./calibrationProfile";

export type CalibratableGeneratorSettings = {
  amplitudeVpp: number;
  offsetV: number;
  waveform?: string;
};

export function toHardwareGeneratorSettings<
  Settings extends CalibratableGeneratorSettings,
>(requested: Settings, profile: CalibrationProfile): Settings {
  const operatingLimits = deriveOperatingLimits(profile);
  assertSettingsWithinLimits(requested, operatingLimits, "Requested");

  const dcWaveform = requested.waveform === "dc" || requested.waveform === "DC";
  const hardware = {
    ...requested,
    amplitudeVpp: dcWaveform
      ? 0
      : requested.amplitudeVpp * profile.amplitude.gainCorrection +
        profile.amplitude.offsetCorrectionVpp,
    offsetV:
      requested.offsetV * profile.offset.gainCorrection +
      profile.offset.offsetCorrectionV +
      profile.output.zeroCorrectionV,
  };

  assertSettingsWithinLimits(
    hardware,
    FIRMWARE_FUNCTION_GENERATOR_LIMITS,
    "Calibrated hardware"
  );

  return hardware;
}

export function fromHardwareGeneratorSettings<
  Settings extends CalibratableGeneratorSettings,
>(hardware: Settings, profile: CalibrationProfile): Settings {
  const dcWaveform = hardware.waveform === "dc" || hardware.waveform === "DC";

  return {
    ...hardware,
    amplitudeVpp: dcWaveform
      ? 0
      : (hardware.amplitudeVpp - profile.amplitude.offsetCorrectionVpp) /
        profile.amplitude.gainCorrection,
    offsetV:
      (hardware.offsetV -
        profile.offset.offsetCorrectionV -
        profile.output.zeroCorrectionV) /
      profile.offset.gainCorrection,
  };
}

export function assertSettingsWithinLimits(
  settings: CalibratableGeneratorSettings,
  limits: FunctionGeneratorLimits,
  label = "Settings"
): void {
  if (settingsFitOutputEnvelope(settings.amplitudeVpp, settings.offsetV, limits)) {
    return;
  }

  const { minimumOutputV, maximumOutputV } = getOutputEnvelope(
    settings.amplitudeVpp,
    settings.offsetV
  );

  throw new Error(
    `${label} would produce ${minimumOutputV.toFixed(2)} V to ` +
      `${maximumOutputV.toFixed(2)} V; allowed output is ` +
      `${limits.minimumOutputV.toFixed(2)} V to ${limits.maximumOutputV.toFixed(2)} V.`
  );
}