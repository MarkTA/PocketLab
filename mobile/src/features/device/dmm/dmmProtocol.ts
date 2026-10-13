/* src/features/device/dmm/dmmProtocol.ts */

import type { DmmReading, DmmState } from "../deviceTypes";

export type ParsedDmmReading = {
  reading: DmmReading;
  // Resistance responses can optionally include the current range/RREF.
  inferredState: DmmState | null;
};

export function parseDmmState(response: string): DmmState {
  const prefix = "DMM:STATE ";

  if (!response.startsWith(prefix)) {
    throw new Error(`Unexpected DMM state response: "${response}"`);
  }

  const fields = response
    .slice(prefix.length)
    .split(";")
    .map((field) => field.trim())
    .filter(Boolean);

  const values = new Map<string, string>();

  for (const field of fields) {
    const separatorIndex = field.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = field.slice(0, separatorIndex).trim();
    const value = field.slice(separatorIndex + 1).trim();

    values.set(key, value);
  }

  const mode = values.get("MODE");

  if (mode !== "RESISTANCE" && mode !== "VOLTAGE") {
    throw new Error(`Invalid DMM mode in response: "${response}"`);
  }

  const range = values.get("RANGE");

  if (!range) {
    throw new Error(`Missing DMM range in response: "${response}"`);
  }

  const rrefRaw = values.get("RREF");

  const rrefOhms = rrefRaw !== undefined ? Number(rrefRaw) : null;

  if (rrefOhms !== null && !Number.isFinite(rrefOhms)) {
    throw new Error(`Invalid DMM RREF in response: "${response}"`);
  }

  return {
    mode,
    range,
    rrefOhms,
  };
}

/** Convert one DMM:READ response into a reading and optional range metadata. */
export function parseDmmReading(response: string): ParsedDmmReading {
  const prefix = "DMM:VALUE ";

  if (!response.startsWith(prefix)) {
    throw new Error(`Unexpected DMM reading response: "${response}"`);
  }

  const payload = response.slice(prefix.length);

  const fields = payload
    .split(";")
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    throw new Error(`Missing DMM value in response: "${response}"`);
  }

  const rawValue = fields[0];

  const values = new Map<string, string>();

  for (const field of fields.slice(1)) {
    const separatorIndex = field.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = field.slice(0, separatorIndex).trim();

    const fieldValue = field.slice(separatorIndex + 1).trim();

    values.set(key, fieldValue);
  }

  const unit = values.get("UNIT");

  const range = values.get("RANGE");
  let inferredState: DmmState | null = null;
  const rrefRaw = values.get("RREF");

  if (unit === "OHM" && range && rrefRaw !== undefined) {
    const rrefOhms = Number(rrefRaw);

    if (Number.isFinite(rrefOhms)) {
      inferredState = {
        mode: "RESISTANCE",
        range,
        rrefOhms,
      };
    }
  }

  if (unit !== "OHM" && unit !== "V") {
    throw new Error(`Invalid DMM unit in response: "${response}"`);
  }

  /*
   * OL is a valid resistance measurement state,
   * not an error.
   */
  if (rawValue === "OL") {
    if (unit !== "OHM") {
      throw new Error(`OL is only valid for resistance: "${response}"`);
    }

    const reading: DmmReading = {
      value: null,
      unit,
      overload: true,
    };

    return { reading, inferredState };
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid DMM value in response: "${response}"`);
  }

  const reading: DmmReading = {
    value,
    unit,
    overload: false,
  };

  return { reading, inferredState };
}
