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

import { getPocketLabInfo, getPocketLabState, pingPocketLab } from "./pocketLabProtocol";

// -----------------------------------------------------------------------------
// Context types
// -----------------------------------------------------------------------------

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

  setOffset: (volts: number) => void;
  setFrequency: (hz: number) => void;
  setAmplitude: (vpp: number) => void;
  setWaveform: (waveform: Waveform) => void;
  setOutputEnabled: (enabled: boolean) => void;
};

// -----------------------------------------------------------------------------
// Initial state
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const DeviceContext = createContext<DeviceContextValue | null>(null);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FunctionGeneratorState>(initialState);

  const [scanning, setScanning] = useState(false);

  const [reconnecting, setReconnecting] = useState(false);

  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Scan timer helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Scanning
  // ---------------------------------------------------------------------------

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

          /*
           * Android may report the same device many
           * times during one scan. Replace the existing
           * entry so its RSSI and advertisement data stay
           * current.
           */
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

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  const connect = useCallback(
    async (device: Device): Promise<void> => {
      stopScan();
      setReconnecting(false);

      try {
        const connectedDevice = await bleDiagnostic.connect(
          device,

          // Unexpected disconnection
          (error) => {
            if (error) {
              console.error("[DEVICE PROVIDER] Connection lost:", error);
            } else {
              console.log("[DEVICE PROVIDER] Device disconnected");
            }

            /*
             * Keep deviceName so the UI can continue showing
             * which device it is trying to reconnect to.
             *
             * Setting reconnecting immediately also prevents
             * the UI from briefly switching to its scan view.
             */
            setReconnecting(true);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          // Reconnection process started
          () => {
            console.log("[DEVICE PROVIDER] Attempting to reconnect");

            setReconnecting(true);

            setState((previousState) => ({
              ...previousState,
              connected: false,
              outputEnabled: false,
            }));
          },

          // Reconnection succeeded
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
    [stopScan]
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

  // ---------------------------------------------------------------------------
  // Protocol diagnostic
  // ---------------------------------------------------------------------------

  const testWrite = useCallback(async (): Promise<void> => {
    await pingPocketLab();

    const info = await getPocketLabInfo();
    console.log("[POCKETLAB] Device info:", info);

    const deviceState = await getPocketLabState();
    console.log("[POCKETLAB] Device state:", deviceState);
  }, []);

  // ---------------------------------------------------------------------------
  // Function-generator local state
  //
  // These currently update only app state. Later they will call the
  // FunctionGenerator instrument API and send protocol commands.
  // ---------------------------------------------------------------------------

  const setOffset = useCallback((volts: number): void => {
    const safeValue = Number.isFinite(volts) ? volts : 0;

    setState((previousState) => ({
      ...previousState,
      offsetV: Math.min(2.5, Math.max(-2.5, safeValue)),
    }));
  }, []);

  const setFrequency = useCallback((hz: number): void => {
    const safeFrequency = Number.isFinite(hz) ? hz : 1;

    setState((previousState) => ({
      ...previousState,
      frequencyHz: Math.max(1, Math.round(safeFrequency)),
    }));
  }, []);

  const setAmplitude = useCallback((vpp: number): void => {
    const safeAmplitude = Number.isFinite(vpp) ? vpp : 0;

    setState((previousState) => ({
      ...previousState,
      amplitudeVpp: Math.max(0, Number(safeAmplitude.toFixed(2))),
    }));
  }, []);

  const setWaveform = useCallback((waveform: Waveform): void => {
    setState((previousState) => ({
      ...previousState,
      waveform,
    }));
  }, []);

  const setOutputEnabled = useCallback((enabled: boolean): void => {
    setState((previousState) => ({
      ...previousState,
      outputEnabled: enabled,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

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
      setOffset,
      setFrequency,
      setAmplitude,
      setWaveform,
      setOutputEnabled,
    ]
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function usePocketLabDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);

  if (!context) {
    throw new Error("usePocketLabDevice must be used inside DeviceProvider");
  }

  return context;
}
