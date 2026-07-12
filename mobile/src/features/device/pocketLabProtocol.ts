import { bleDiagnostic } from "./bleClient";

export type PocketLabWaveform =
  "SINE" | "SQUARE" | "TRIANGLE" | "RAMP_UP" | "RAMP_DOWN" | "DC";

export type PocketLabInfo = {
  model: string;
  firmwareVersion: string;
  hardwareVersion: string;
};

export type PocketLabState = {
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  waveform: PocketLabWaveform;
  outputEnabled: boolean;
};

function parseFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const field of text.split(";")) {
    const separatorIndex = field.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const key = field.slice(0, separatorIndex).trim();
    const value = field.slice(separatorIndex + 1).trim();

    fields[key] = value;
  }

  return fields;
}

function throwIfProtocolError(response: string): void {
  if (!response.startsWith("ERR ")) {
    return;
  }

  const errorCode = response.slice(4).trim();

  throw new Error(`PocketLab protocol error: ${errorCode}`);
}

async function expectOk(command: string): Promise<void> {
  const response = await bleDiagnostic.request(command);

  throwIfProtocolError(response);

  if (response !== "OK") {
    throw new Error(`Unexpected PocketLab response to "${command}": "${response}"`);
  }
}

export async function pingPocketLab(): Promise<void> {
  const response = await bleDiagnostic.request("PING");

  throwIfProtocolError(response);

  if (response !== "PONG") {
    throw new Error(`Unexpected PING response: "${response}"`);
  }
}

export async function getPocketLabInfo(): Promise<PocketLabInfo> {
  const response = await bleDiagnostic.request("INFO");

  throwIfProtocolError(response);

  if (!response.startsWith("INFO ")) {
    throw new Error(`Unexpected INFO response: "${response}"`);
  }

  const fields = parseFields(response.slice(5));

  if (!fields.MODEL || !fields.FW || !fields.HW) {
    throw new Error(`Incomplete INFO response: "${response}"`);
  }

  return {
    model: fields.MODEL,
    firmwareVersion: fields.FW,
    hardwareVersion: fields.HW,
  };
}

export async function getPocketLabState(): Promise<PocketLabState> {
  const response = await bleDiagnostic.request("GET_STATE");

  throwIfProtocolError(response);

  if (!response.startsWith("STATE ")) {
    throw new Error(`Unexpected GET_STATE response: "${response}"`);
  }

  const fields = parseFields(response.slice(6));

  const frequencyHz = Number(fields.FREQ);
  const amplitudeVpp = Number(fields.AMP);
  const offsetV = Number(fields.OFFSET);
  const waveform = fields.WAVE as PocketLabWaveform;
  const outputEnabled = fields.OUTPUT === "ON";

  if (
    !Number.isFinite(frequencyHz) ||
    !Number.isFinite(amplitudeVpp) ||
    !Number.isFinite(offsetV) ||
    !fields.WAVE ||
    !["ON", "OFF"].includes(fields.OUTPUT)
  ) {
    throw new Error(`Invalid STATE response: "${response}"`);
  }

  return {
    frequencyHz,
    amplitudeVpp,
    offsetV,
    waveform,
    outputEnabled,
  };
}

export async function setPocketLabFrequency(frequencyHz: number): Promise<void> {
  if (!Number.isInteger(frequencyHz)) {
    throw new Error("Frequency must be an integer.");
  }

  await expectOk(`SET_FREQ ${frequencyHz}`);
}

export async function setPocketLabAmplitude(amplitudeVpp: number): Promise<void> {
  if (!Number.isFinite(amplitudeVpp)) {
    throw new Error("Amplitude must be finite.");
  }

  await expectOk(`SET_AMP ${amplitudeVpp.toFixed(2)}`);
}

export async function setPocketLabOffset(offsetV: number): Promise<void> {
  if (!Number.isFinite(offsetV)) {
    throw new Error("Offset must be finite.");
  }

  await expectOk(`SET_OFFSET ${offsetV.toFixed(2)}`);
}

export async function setPocketLabWaveform(waveform: PocketLabWaveform): Promise<void> {
  await expectOk(`SET_WAVE ${waveform}`);
}

export async function setPocketLabOutput(enabled: boolean): Promise<void> {
  await expectOk(`OUTPUT ${enabled ? "ON" : "OFF"}`);
}
