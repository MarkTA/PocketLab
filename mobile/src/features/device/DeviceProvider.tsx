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

import { bleDiagnostic } from "./bleClient";
import {
  getPocketLabInfo,
  getPocketLabState,
  pingPocketLab,
  setPocketLabAmplitude,
  setPocketLabFrequency,
  setPocketLabOffset,
  setPocketLabOutput,
  setPocketLabSettings,
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

type DeviceContextValue = {
  state: FunctionGeneratorState;

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
  return {
    frequencyHz: deviceState.frequencyHz,
    amplitudeVpp: deviceState.amplitudeVpp,
    offsetV: deviceState.offsetV,
    waveform: PROTOCOL_TO_UI_WAVEFORM[deviceState.waveform],
    outputEnabled: deviceState.outputEnabled,
  };
}

function toProtocolSettings(settings: FunctionGeneratorSettings): PocketLabSettings {
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

  return {
    frequencyHz: normalizedSettings.frequencyHz,
    amplitudeVpp: normalizedSettings.amplitudeVpp,
    offsetV: normalizedSettings.offsetV,
    waveform: UI_TO_PROTOCOL_WAVEFORM[normalizedSettings.waveform],
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

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FunctionGeneratorState>(initialState);

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

  const synchronizeDeviceState = useCallback(async (): Promise<void> => {
    const deviceState = await getPocketLabState();

    setState((previousState) => ({
      ...previousState,
      ...toUiState(deviceState),
    }));

    console.log("[DEVICE PROVIDER] State synchronized:", deviceState);
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
              console.error("[DEVICE PROVIDER] Connection lost:", error);
            } else {
              console.log("[DEVICE PROVIDER] Device disconnected");
            }

            setReconnecting(true);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          () => {
            console.log("[DEVICE PROVIDER] Attempting to reconnect");

            setReconnecting(true);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          (reconnectedDevice) => {
            console.log("[DEVICE PROVIDER] Reconnected successfully");

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

            void synchronizeDeviceState().catch((error) => {
              console.error("[DEVICE PROVIDER] Reconnect state sync failed:", error);
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
          connectedDevice.name ?? connectedDevice.localName ?? connectedDevice.id
        );

        await synchronizeDeviceState();
      } catch (error) {
        setReconnecting(false);

        setState((previousState) => ({
          ...previousState,
          connected: false,
          outputEnabled: false,
        }));

        throw error;
      }
    },
    [stopScan, synchronizeDeviceState]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    stopScan();
    setReconnecting(false);

    try {
      await bleDiagnostic.disconnect();
    } finally {
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
    console.log("[POCKETLAB] Device info:", info);

    const deviceState = await getPocketLabState();
    console.log("[POCKETLAB] Device state:", deviceState);
  }, []);

  const setGeneratorSettings = useCallback(
    async (settings: FunctionGeneratorSettings): Promise<void> => {
      const normalizedSettings = normalizeGeneratorSettings(settings);

      await setPocketLabSettings(toProtocolSettings(normalizedSettings));

      setState((previousState) => ({
        ...previousState,
        ...normalizedSettings,
      }));
    },
    []
  );

  const setOffset = useCallback(async (volts: number): Promise<void> => {
    await setPocketLabOffset(volts);

    setState((previousState) => ({
      ...previousState,
      offsetV: volts,
    }));
  }, []);

  const setFrequency = useCallback(async (hz: number): Promise<void> => {
    if (state.waveform === "dc") {
      setState((previousState) => ({
        ...previousState,
        frequencyHz: 0,
      }));
      return;
    }

    const frequencyHz = Math.max(1, Math.round(hz));

    await setPocketLabFrequency(frequencyHz);

    setState((previousState) => ({
      ...previousState,
      frequencyHz,
    }));
  }, [state.waveform]);

  const setAmplitude = useCallback(async (vpp: number): Promise<void> => {
    if (state.waveform === "dc") {
      setState((previousState) => ({
        ...previousState,
        amplitudeVpp: 0,
      }));
      return;
    }

    const amplitudeVpp = vpp;

    await setPocketLabAmplitude(amplitudeVpp);

    setState((previousState) => ({
      ...previousState,
      amplitudeVpp,
    }));
  }, [state.waveform]);

  const setWaveform = useCallback(async (waveform: Waveform): Promise<void> => {
    const normalizedSettings = normalizeGeneratorSettings({
      frequencyHz:
        waveform === "dc"
          ? 0
          : state.frequencyHz > 0
            ? state.frequencyHz
            : 1000,
      amplitudeVpp: waveform === "dc" ? 0 : state.amplitudeVpp,
      offsetV: state.offsetV,
      waveform,
    });

    await setPocketLabSettings(toProtocolSettings(normalizedSettings));

    setState((previousState) => ({
      ...previousState,
      ...normalizedSettings,
    }));
  }, [state.amplitudeVpp, state.frequencyHz, state.offsetV]);

  const setOutputEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    await setPocketLabOutput(enabled);

    setState((previousState) => ({
      ...previousState,
      outputEnabled: enabled,
    }));
  }, []);

  const value = useMemo<DeviceContextValue>(
    () => ({
      state,
      scanning,
      reconnecting,
      discoveredDevices,
      scanForDevices,
      stopScan,
      connect,
      disconnect,
      testWrite,
      setGeneratorSettings,
      setOffset,
      setFrequency,
      setAmplitude,
      setWaveform,
      setOutputEnabled,
    }),
    [
      state,
      scanning,
      reconnecting,
      discoveredDevices,
      scanForDevices,
      stopScan,
      connect,
      disconnect,
      testWrite,
      setGeneratorSettings,
      setOffset,
      setFrequency,
      setAmplitude,
      setWaveform,
      setOutputEnabled,
    ]
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function usePocketLabDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);

  if (!context) {
    throw new Error("usePocketLabDevice must be used inside DeviceProvider");
  }

  return context;
}
