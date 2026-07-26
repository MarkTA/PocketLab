import profileJson from "./profiles/pocketlab-fg-prototype-01.json";
import { deriveOperatingLimits, parseCalibrationProfile } from "./calibrationProfile";

/**
 * Prototype selection point. Replace this import with per-device profile
 * lookup when multiple PocketLab units are supported.
 */
export const ACTIVE_CALIBRATION_PROFILE = parseCalibrationProfile(profileJson);

export const ACTIVE_FUNCTION_GENERATOR_LIMITS = deriveOperatingLimits(
  ACTIVE_CALIBRATION_PROFILE
);