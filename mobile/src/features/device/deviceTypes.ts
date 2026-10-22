/* src/features/device/deviceTypes.ts */

import type { Device } from "react-native-ble-plx";
import type { FunctionGeneratorState, Waveform } from "../../types/pocketLab";
import type { PocketLabCapabilities, PocketLabInfo } from "./pocketLabProtocol";

export type FunctionGeneratorSettings = {
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  waveform: Waveform;
};

export type DmmMode = "RESISTANCE" | "VOLTAGE" | "CONTINUITY";

export type DmmState = {
  mode: DmmMode;
  range: string;
  rrefOhms: number | null;
};

export type DmmReading = {
  value: number | null;
  unit: "OHM" | "V";
  overload: boolean;
  /** True only when the firmware continuity buzzer threshold is active. */
  continuity?: boolean;
};

export type DeviceContextValue = {
  state: FunctionGeneratorState;

  deviceInfo: PocketLabInfo | null;
  capabilities: PocketLabCapabilities | null;

  dmmReading: DmmReading | null;
  requestDmmReading: () => Promise<DmmReading>;

  dmmState: DmmState | null;
  requestDmmState: () => Promise<DmmState>;
  setDmmMode: (mode: DmmMode) => Promise<DmmState>;

  scanning: boolean;
  reconnecting: boolean;
  discoveredDevices: Device[];

  scanForDevices: () => Promise<void>;
  stopScan: () => void;
  connect: (device: Device) => Promise<void>;
  disconnect: () => Promise<void>;
  testWrite: () => Promise<void>;

  setGeneratorSettings: (settings: FunctionGeneratorSettings) => Promise<void>;

  setOffset: (volts: number) => Promise<void>;
  setFrequency: (hz: number) => Promise<void>;
  setAmplitude: (vpp: number) => Promise<void>;
  setWaveform: (waveform: Waveform) => Promise<void>;
  setOutputEnabled: (enabled: boolean) => Promise<void>;
};
