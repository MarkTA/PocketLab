import {
  FIRMWARE_FUNCTION_GENERATOR_LIMITS,
  type FunctionGeneratorLimits,
} from "../lib/hardwareLimits";

export const CALIBRATION_PROFILE_VERSION = 1 as const;

export type CalibrationProfileV1 = {
  version: typeof CALIBRATION_PROFILE_VERSION;
  deviceId: string;
  output: {
    minimumV: number;
    maximumV: number;
    /**
     * Additive correction applied only to the signed offset command required
     * to make a requested 0 V output measure 0 V.
     */
    zeroCorrectionV: number;
  };
  amplitude: {
    gainCorrection: number;
    offsetCorrectionVpp: number;
  };
  offset: {
    gainCorrection: number;
    offsetCorrectionV: number;
  };
};

export type CalibrationProfile = CalibrationProfileV1;

export const NEUTRAL_CALIBRATION_PROFILE: CalibrationProfile = {
  version: CALIBRATION_PROFILE_VERSION,
  deviceId: "unconfigured",
  output: {
    minimumV: FIRMWARE_FUNCTION_GENERATOR_LIMITS.minimumOutputV,
    maximumV: FIRMWARE_FUNCTION_GENERATOR_LIMITS.maximumOutputV,
    zeroCorrectionV: 0,
  },
  amplitude: {
    gainCorrection: 1,
    offsetCorrectionVpp: 0,
  },
  offset: {
    gainCorrection: 1,
    offsetCorrectionV: 0,
  },
};

export function parseCalibrationProfile(value: unknown): CalibrationProfile {
  if (!isRecord(value)) {
    throw new Error("Calibration profile must be a JSON object.");
  }

  if (value.version !== CALIBRATION_PROFILE_VERSION) {
    throw new Error(`Unsupported calibration profile version: ${String(value.version)}`);
  }

  if (typeof value.deviceId !== "string" || value.deviceId.trim().length === 0) {
    throw new Error("Calibration profile deviceId must be a non-empty string.");
  }

  const output = requireRecord(value.output, "output");
  const amplitude = requireRecord(value.amplitude, "amplitude");
  const offset = requireRecord(value.offset, "offset");

  const minimumV = requireFiniteNumber(output.minimumV, "output.minimumV");
  const maximumV = requireFiniteNumber(output.maximumV, "output.maximumV");
  const amplitudeGain = requirePositiveNumber(
    amplitude.gainCorrection,
    "amplitude.gainCorrection"
  );
  const offsetGain = requirePositiveNumber(
    offset.gainCorrection,
    "offset.gainCorrection"
  );

  if (minimumV >= maximumV) {
    throw new Error("Calibration output.minimumV must be less than output.maximumV.");
  }

  return {
    version: CALIBRATION_PROFILE_VERSION,
    deviceId: value.deviceId,
    output: {
      minimumV,
      maximumV,
      zeroCorrectionV: requireFiniteNumber(
        output.zeroCorrectionV,
        "output.zeroCorrectionV"
      ),
    },
    amplitude: {
      gainCorrection: amplitudeGain,
      offsetCorrectionVpp: requireFiniteNumber(
        amplitude.offsetCorrectionVpp,
        "amplitude.offsetCorrectionVpp"
      ),
    },
    offset: {
      gainCorrection: offsetGain,
      offsetCorrectionV: requireFiniteNumber(
        offset.offsetCorrectionV,
        "offset.offsetCorrectionV"
      ),
    },
  };
}

export function deriveOperatingLimits(
  profile: CalibrationProfile,
  firmwareLimits: FunctionGeneratorLimits = FIRMWARE_FUNCTION_GENERATOR_LIMITS
): FunctionGeneratorLimits {
  const minimumOutputV = Math.max(firmwareLimits.minimumOutputV, profile.output.minimumV);
  const maximumOutputV = Math.min(firmwareLimits.maximumOutputV, profile.output.maximumV);

  if (minimumOutputV >= maximumOutputV) {
    throw new Error("Calibration output range does not overlap the firmware envelope.");
  }

  return {
    ...firmwareLimits,
    minimumOutputV,
    maximumOutputV,
    minOffsetV: Math.max(firmwareLimits.minOffsetV, minimumOutputV),
    maxOffsetV: Math.min(firmwareLimits.maxOffsetV, maximumOutputV),
  };
}

export function calibrationForDevice(
  profile: CalibrationProfile | null | undefined,
  deviceId?: string
): CalibrationProfile {
  if (!profile) {
    return {
      ...NEUTRAL_CALIBRATION_PROFILE,
      deviceId: deviceId ?? NEUTRAL_CALIBRATION_PROFILE.deviceId,
    };
  }

  if (deviceId && profile.deviceId !== deviceId) {
    throw new Error(
      `Calibration profile ${profile.deviceId} does not match device ${deviceId}.`
    );
  }

  return profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Calibration ${path} must be an object.`);
  }

  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Calibration ${path} must be a finite number.`);
  }

  return value;
}

function requirePositiveNumber(value: unknown, path: string): number {
  const number = requireFiniteNumber(value, path);

  if (number <= 0) {
    throw new Error(`Calibration ${path} must be greater than zero.`);
  }

  return number;
}