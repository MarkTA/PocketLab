/* src/features/device/DeviceProvider.tsx */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Device } from "react-native-ble-plx";

import type { FunctionGeneratorState, Waveform } from "../../types/pocketLab";
import { ACTIVE_CALIBRATION_PROFILE } from "../../calibration/activeCalibration";
import {
  fromHardwareGeneratorSettings,
  toHardwareGeneratorSettings,
} from "../../calibration/calibrationTransforms";

import { bleDiagnostic } from "./bleClient";
import {
  getPocketLabFeatures,
  getPocketLabInfo,
  getPocketLabState,
  pingPocketLab,
  setPocketLabAmplitude,
  setPocketLabFrequency,
  setPocketLabOffset,
  setPocketLabOutput,
  setPocketLabSettings,
  type PocketLabCapabilities,
  type PocketLabInfo,
  type PocketLabSettings,
  type PocketLabState,
  type PocketLabWaveform,
} from "./pocketLabProtocol";

export type FunctionGeneratorSettings = {
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  waveform: Waveform;
};

export type DmmMode = "RESISTANCE" | "VOLTAGE";

export type DmmState = {
  mode: DmmMode;
  range: string;
  rrefOhms: number | null;
};

export type DmmReading = {
  value: number;
  unit: "OHM" | "V";
};

type DeviceContextValue = {
  state: FunctionGeneratorState;

  deviceInfo: PocketLabInfo | null;
  capabilities: PocketLabCapabilities | null;

  dmmReading: DmmReading | null;
  requestDmmReading: () => Promise<DmmReading>;

  dmmState: DmmState | null;

  scanning: boolean;
  reconnecting: boolean;
  discoveredDevices: Device[];

  scanForDevices: () => Promise<void>;
  stopScan: () => void;
  connect: (device: Device) => Promise<void>;
  disconnect: () => Promise<void>;
  testWrite: () => Promise<void>;

  requestDmmState: () => Promise<DmmState>;

  setGeneratorSettings: (settings: FunctionGeneratorSettings) => Promise<void>;

  setOffset: (volts: number) => Promise<void>;
  setFrequency: (hz: number) => Promise<void>;
  setAmplitude: (vpp: number) => Promise<void>;
  setWaveform: (waveform: Waveform) => Promise<void>;
  setOutputEnabled: (enabled: boolean) => Promise<void>;
};

const initialState: FunctionGeneratorState = {
  connected: false,
  deviceName: null,
  offsetV: 0,
  frequencyHz: 1000,
  amplitudeVpp: 0.65,
  waveform: "sine",
  outputEnabled: false,
};

const SCAN_DURATION_MS = 10_000;

const DeviceContext = createContext<DeviceContextValue | null>(null);

const UI_TO_PROTOCOL_WAVEFORM: Record<Waveform, PocketLabWaveform> = {
  sine: "SINE",
  square: "SQUARE",
  triangle: "TRIANGLE",
  rampUp: "RAMP_UP",
  rampDown: "RAMP_DOWN",
  dc: "DC",
};

const PROTOCOL_TO_UI_WAVEFORM: Record<PocketLabWaveform, Waveform> = {
  SINE: "sine",
  SQUARE: "square",
  TRIANGLE: "triangle",
  RAMP_UP: "rampUp",
  RAMP_DOWN: "rampDown",
  DC: "dc",
};

function toUiState(
  deviceState: PocketLabState
): Pick<
  FunctionGeneratorState,
  "frequencyHz" | "amplitudeVpp" | "offsetV" | "waveform" | "outputEnabled"
> {
  const requestedState = fromHardwareGeneratorSettings(
    deviceState,
    ACTIVE_CALIBRATION_PROFILE
  );

  return {
    frequencyHz: requestedState.frequencyHz,
    amplitudeVpp: requestedState.amplitudeVpp,
    offsetV: requestedState.offsetV,
    waveform: PROTOCOL_TO_UI_WAVEFORM[deviceState.waveform],
    outputEnabled: requestedState.outputEnabled,
  };
}

function toProtocolSettings(
  settings: FunctionGeneratorSettings
): PocketLabSettings {
  const normalizedSettings =
    settings.waveform === "dc"
      ? {
          ...settings,
          frequencyHz: 0,
          amplitudeVpp: 0,
        }
      : {
          ...settings,
          frequencyHz: Math.max(1, Math.round(settings.frequencyHz)),
        };

  const hardwareSettings = toHardwareGeneratorSettings(
    normalizedSettings,
    ACTIVE_CALIBRATION_PROFILE
  );

  return {
    frequencyHz: hardwareSettings.frequencyHz,
    amplitudeVpp: hardwareSettings.amplitudeVpp,
    offsetV: hardwareSettings.offsetV,
    waveform: UI_TO_PROTOCOL_WAVEFORM[hardwareSettings.waveform],
  };
}

function normalizeGeneratorSettings(
  settings: FunctionGeneratorSettings
): FunctionGeneratorSettings {
  if (settings.waveform === "dc") {
    return {
      ...settings,
      frequencyHz: 0,
      amplitudeVpp: 0,
    };
  }

  return {
    ...settings,
    frequencyHz: Math.max(1, Math.round(settings.frequencyHz)),
  };
}

function parseDmmState(response: string): DmmState {
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

  const rrefOhms =
    rrefRaw !== undefined
      ? Number(rrefRaw)
      : null;

  if (
    rrefOhms !== null &&
    !Number.isFinite(rrefOhms)
  ) {
    throw new Error(`Invalid DMM RREF in response: "${response}"`);
  }

  return {
    mode,
    range,
    rrefOhms,
  };
}

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FunctionGeneratorState>(initialState);

  const [deviceInfo, setDeviceInfo] = useState<PocketLabInfo | null>(null);

  const [dmmReading, setDmmReading] =
    useState<DmmReading | null>(null);
  
  const [capabilities, setCapabilities] =
    useState<PocketLabCapabilities | null>(null);

  const [dmmState, setDmmState] =
    useState<DmmState | null>(null);

  const [scanning, setScanning] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanTimeout = useCallback(() => {
    if (!scanTimeoutRef.current) {
      return;
    }

    clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
  }, []);

  const stopScan = useCallback(() => {
    clearScanTimeout();
    bleDiagnostic.stopScan();
    setScanning(false);
  }, [clearScanTimeout]);

  useEffect(() => {
    return () => {
      clearScanTimeout();
      bleDiagnostic.stopScan();
    };
  }, [clearScanTimeout]);

  const scanForDevices = useCallback(async (): Promise<void> => {
    clearScanTimeout();
    setDiscoveredDevices([]);
    setScanning(true);

    try {
      await bleDiagnostic.scanForPocketLab((device) => {
        setDiscoveredDevices((previousDevices) => {
          const existingIndex = previousDevices.findIndex(
            (existingDevice) => existingDevice.id === device.id
          );

          if (existingIndex >= 0) {
            const updatedDevices = [...previousDevices];
            updatedDevices[existingIndex] = device;
            return updatedDevices;
          }

          return [...previousDevices, device];
        });
      });

      scanTimeoutRef.current = setTimeout(() => {
        bleDiagnostic.stopScan();
        setScanning(false);
        scanTimeoutRef.current = null;
      }, SCAN_DURATION_MS);
    } catch (error) {
      bleDiagnostic.stopScan();
      setScanning(false);
      clearScanTimeout();
      throw error;
    }
  }, [clearScanTimeout]);

  const requestDmmState = useCallback(async (): Promise<DmmState> => {
    console.log("[DMM] Requesting state...");

    const response =
      await bleDiagnostic.request("DMM:GET_STATE");

    console.log("[DMM] State response:", response);

    const nextDmmState =
      parseDmmState(response);

    setDmmState(nextDmmState);

    console.log(
      "[DMM] State synchronized:",
      nextDmmState
    );

    return nextDmmState;
  }, []);

  const requestDmmReading = useCallback(async (): Promise<DmmReading> => {
    console.log("[DMM] Requesting reading...");

    const response =
      await bleDiagnostic.request("DMM:READ");

    console.log("[DMM] Reading response:", response);

    const prefix = "DMM:VALUE ";

    if (!response.startsWith(prefix)) {
      throw new Error(`Unexpected DMM reading response: "${response}"`);
    }

    const payload = response.slice(prefix.length);

    const fields = payload
      .split(";")
      .map((field) => field.trim())
      .filter(Boolean);

    const value = Number(fields[0]);

    if (!Number.isFinite(value)) {
      throw new Error(`Invalid DMM value in response: "${response}"`);
    }

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

    if (unit !== "OHM" && unit !== "V") {
      throw new Error(`Invalid DMM unit in response: "${response}"`);
    }

    const reading: DmmReading = {
      value,
      unit,
    };

    setDmmReading(reading);

    console.log("[DMM] Reading updated:", reading);

    return reading;
  }, []);

  const identifyDevice = useCallback(async (): Promise<PocketLabInfo> => {
    console.log("### POCKETLAB BASE HANDSHAKE ###");

    await pingPocketLab();

    const info = await getPocketLabInfo();
    const deviceCapabilities = await getPocketLabFeatures();

    setDeviceInfo(info);
    setCapabilities(deviceCapabilities);

    console.log(
      "[DEVICE PROVIDER] PocketLab identified:",
      info
    );

    console.log(
      "[DEVICE PROVIDER] PocketLab capabilities:",
      deviceCapabilities
    );

    if (deviceCapabilities.features.includes("DMM")) {
      await requestDmmState();
    } else {
      setDmmState(null);
    }

    return info;
  }, [requestDmmState]);

  const synchronizeGeneratorState = useCallback(async (): Promise<void> => {
    const deviceState = await getPocketLabState();

    setState((previousState) => ({
      ...previousState,
      ...toUiState(deviceState),
    }));

    console.log(
      "[DEVICE PROVIDER] Generator state synchronized:",
      deviceState
    );
  }, []);

  const connect = useCallback(
    async (device: Device): Promise<void> => {
      stopScan();
      setReconnecting(false);

      try {
        const connectedDevice = await bleDiagnostic.connect(
          device,

          (error) => {
            if (error) {
              console.error(
                "[DEVICE PROVIDER] Connection lost:",
                error
              );
            } else {
              console.log(
                "[DEVICE PROVIDER] Device disconnected"
              );
            }

            setReconnecting(true);

            setDeviceInfo(null);
            setCapabilities(null);
            setDmmState(null);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          () => {
            console.log(
              "[DEVICE PROVIDER] Attempting to reconnect"
            );

            setReconnecting(true);

            setDeviceInfo(null);
            setCapabilities(null);
            setDmmState(null);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          (reconnectedDevice) => {
            console.log(
              "[DEVICE PROVIDER] Reconnected successfully"
            );

            setReconnecting(false);

            setState((previousState) => ({
              ...previousState,
              connected: true,
              deviceName:
                reconnectedDevice.name ??
                reconnectedDevice.localName ??
                previousState.deviceName ??
                "PocketLab Device",
            }));

            void identifyDevice().catch((error) => {
              console.error(
                "[DEVICE PROVIDER] Reconnect identification failed:",
                error
              );
            });
          }
        );

        setReconnecting(false);

        setState((previousState) => ({
          ...previousState,
          connected: true,
          deviceName:
            connectedDevice.name ??
            connectedDevice.localName ??
            device.name ??
            device.localName ??
            "PocketLab Device",
        }));

        console.log(
          "[DEVICE PROVIDER] Connected to:",
          connectedDevice.name ??
            connectedDevice.localName ??
            connectedDevice.id
        );

        const info = await identifyDevice();

        console.log(
          "[DEVICE PROVIDER] Base device ready:",
          info
        );
      } catch (error) {
        setReconnecting(false);

        setDeviceInfo(null);
        setCapabilities(null);
        setDmmState(null);

        setState((previousState) => ({
          ...previousState,
          connected: false,
          outputEnabled: false,
        }));

        throw error;
      }
    },
    [stopScan, identifyDevice]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    stopScan();
    setReconnecting(false);
    setDmmReading(null);

    try {
      await bleDiagnostic.disconnect();
    } finally {
      setDeviceInfo(null);
      setCapabilities(null);
      setDmmState(null);

      setState((previousState) => ({
        ...previousState,
        connected: false,
        deviceName: null,
        outputEnabled: false,
      }));
    }
  }, [stopScan]);

  const testWrite = useCallback(async (): Promise<void> => {
    await pingPocketLab();

    const info = await getPocketLabInfo();

    setDeviceInfo(info);

    console.log(
      "[POCKETLAB] Device info:",
      info
    );
  }, []);

  const setGeneratorSettings = useCallback(
    async (
      settings: FunctionGeneratorSettings
    ): Promise<void> => {
      const normalizedSettings =
        normalizeGeneratorSettings(settings);

      await setPocketLabSettings(
        toProtocolSettings(normalizedSettings)
      );

      setState((previousState) => ({
        ...previousState,
        ...normalizedSettings,
      }));
    },
    []
  );

  const setOffset = useCallback(
    async (volts: number): Promise<void> => {
      const hardwareSettings =
        toProtocolSettings({
          frequencyHz: state.frequencyHz,
          amplitudeVpp: state.amplitudeVpp,
          offsetV: volts,
          waveform: state.waveform,
        });

      await setPocketLabOffset(
        hardwareSettings.offsetV
      );

      setState((previousState) => ({
        ...previousState,
        offsetV: volts,
      }));
    },
    [
      state.amplitudeVpp,
      state.frequencyHz,
      state.waveform,
    ]
  );

  const setFrequency = useCallback(
    async (hz: number): Promise<void> => {
      if (state.waveform === "dc") {
        setState((previousState) => ({
          ...previousState,
          frequencyHz: 0,
        }));

        return;
      }

      const frequencyHz =
        Math.max(
          1,
          Math.round(hz)
        );

      await setPocketLabFrequency(
        frequencyHz
      );

      setState((previousState) => ({
        ...previousState,
        frequencyHz,
      }));
    },
    [state.waveform]
  );

  const setAmplitude = useCallback(
    async (vpp: number): Promise<void> => {
      if (state.waveform === "dc") {
        setState((previousState) => ({
          ...previousState,
          amplitudeVpp: 0,
        }));

        return;
      }

      const amplitudeVpp = vpp;

      const hardwareSettings =
        toProtocolSettings({
          frequencyHz: state.frequencyHz,
          amplitudeVpp,
          offsetV: state.offsetV,
          waveform: state.waveform,
        });

      await setPocketLabAmplitude(
        hardwareSettings.amplitudeVpp
      );

      setState((previousState) => ({
        ...previousState,
        amplitudeVpp,
      }));
    },
    [
      state.frequencyHz,
      state.offsetV,
      state.waveform,
    ]
  );

  const setWaveform = useCallback(
    async (
      waveform: Waveform
    ): Promise<void> => {
      const normalizedSettings =
        normalizeGeneratorSettings({
          frequencyHz:
            waveform === "dc"
              ? 0
              : state.frequencyHz > 0
              ? state.frequencyHz
              : 1000,

          amplitudeVpp:
            waveform === "dc"
              ? 0
              : state.amplitudeVpp,

          offsetV:
            state.offsetV,

          waveform,
        });

      await setPocketLabSettings(
        toProtocolSettings(normalizedSettings)
      );

      setState((previousState) => ({
        ...previousState,
        ...normalizedSettings,
      }));
    },
    [
      state.amplitudeVpp,
      state.frequencyHz,
      state.offsetV,
    ]
  );

  const setOutputEnabled = useCallback(
    async (
      enabled: boolean
    ): Promise<void> => {
      if (enabled) {
        toProtocolSettings({
          frequencyHz: state.frequencyHz,
          amplitudeVpp: state.amplitudeVpp,
          offsetV: state.offsetV,
          waveform: state.waveform,
        });
      }

      await setPocketLabOutput(
        enabled
      );

      setState((previousState) => ({
        ...previousState,
        outputEnabled: enabled,
      }));
    },
    [
      state.amplitudeVpp,
      state.frequencyHz,
      state.offsetV,
      state.waveform,
    ]
  );

  const value = useMemo<DeviceContextValue>(
    () => ({
      state,

      deviceInfo,
      capabilities,
      dmmState,

      dmmReading,
      requestDmmReading,

      scanning,
      reconnecting,
      discoveredDevices,

      scanForDevices,
      stopScan,
      connect,
      disconnect,
      testWrite,

      requestDmmState,

      setGeneratorSettings,
      setOffset,
      setFrequency,
      setAmplitude,
      setWaveform,
      setOutputEnabled,
    }),
    [
      state,

      deviceInfo,
      capabilities,
      dmmState,

      dmmReading,
      requestDmmReading,

      scanning,
      reconnecting,
      discoveredDevices,

      scanForDevices,
      stopScan,
      connect,
      disconnect,
      testWrite,

      requestDmmState,

      setGeneratorSettings,
      setOffset,
      setFrequency,
      setAmplitude,
      setWaveform,
      setOutputEnabled,
    ]
  );

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function usePocketLabDevice(): DeviceContextValue {
  const context =
    useContext(DeviceContext);

  if (!context) {
    throw new Error(
      "usePocketLabDevice must be used inside DeviceProvider"
    );
  }

  return context;
}