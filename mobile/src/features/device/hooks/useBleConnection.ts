/* src/features/device/hooks/useBleConnection.ts */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { Device } from "react-native-ble-plx";

import type { FunctionGeneratorState } from "../../../types/pocketLab";
import { bleDiagnostic } from "../bleClient";
import type { DmmReading, DmmState } from "../deviceTypes";
import {
  getPocketLabFeatures,
  getPocketLabInfo,
  pingPocketLab,
  type PocketLabCapabilities,
  type PocketLabInfo,
} from "../pocketLabProtocol";

type UseBleConnectionOptions = {
  stopScan: () => void;
  scanForDevices: () => Promise<void>;
  requestDmmState: () => Promise<DmmState>;
  setDmmState: Dispatch<SetStateAction<DmmState | null>>;
  setDmmReading: Dispatch<SetStateAction<DmmReading | null>>;
  setGeneratorState: Dispatch<SetStateAction<FunctionGeneratorState>>;
};

/**
 * Owns device identification, the BLE connection lifecycle, and reconnect status.
 * Instrument state stays in DeviceProvider so the context API remains unchanged.
 */
export function useBleConnection({
  stopScan,
  scanForDevices,
  requestDmmState,
  setDmmState,
  setDmmReading,
  setGeneratorState,
}: UseBleConnectionOptions) {
  const [deviceInfo, setDeviceInfo] = useState<PocketLabInfo | null>(null);
  const [capabilities, setCapabilities] = useState<PocketLabCapabilities | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const clearDeviceInfo = useCallback(() => {
    setDeviceInfo(null);
    setCapabilities(null);
    setDmmState(null);
  }, [setDmmState]);

  const markDisconnected = useCallback(() => {
    clearDeviceInfo();
    setGeneratorState((previousState) => ({
      ...previousState,
      connected: false,
      outputEnabled: false,
    }));
  }, [clearDeviceInfo, setGeneratorState]);

  const identifyDevice = useCallback(async (): Promise<PocketLabInfo> => {
    console.log("### POCKETLAB BASE HANDSHAKE ###");

    await pingPocketLab();

    const info = await getPocketLabInfo();
    const deviceCapabilities = await getPocketLabFeatures();

    setDeviceInfo(info);
    setCapabilities(deviceCapabilities);

    console.log("[DEVICE PROVIDER] PocketLab identified:", info);
    console.log("[DEVICE PROVIDER] PocketLab capabilities:", deviceCapabilities);

    if (deviceCapabilities.features.includes("DMM")) {
      await requestDmmState();
    } else {
      setDmmState(null);
    }

    return info;
  }, [requestDmmState, setDmmState]);

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
            markDisconnected();
          },

          () => {
            console.log("[DEVICE PROVIDER] Attempting to reconnect");
            setReconnecting(true);
            markDisconnected();
          },

          (reconnectedDevice) => {
            console.log("[DEVICE PROVIDER] Reconnected successfully");
            setReconnecting(false);

            setGeneratorState((previousState) => ({
              ...previousState,
              connected: true,
              deviceName:
                reconnectedDevice.name ??
                reconnectedDevice.localName ??
                previousState.deviceName ??
                "PocketLab Device",
            }));

            void identifyDevice().catch((error) => {
              console.error("[DEVICE PROVIDER] Reconnect identification failed:", error);
            });
          }
        );

        setReconnecting(false);

        setGeneratorState((previousState) => ({
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

        const info = await identifyDevice();

        console.log("[DEVICE PROVIDER] Base device ready:", info);
      } catch (error) {
        setReconnecting(false);
        markDisconnected();
        throw error;
      }
    },
    [stopScan, markDisconnected, setGeneratorState, identifyDevice]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    stopScan();
    setReconnecting(false);
    setDmmReading(null);

    // Shutdown may cut the BLE link before the response arrives.
    // Always disconnect locally and refresh scan results afterward.
    try {
      await bleDiagnostic.request("POWER:SHUTDOWN");
    } catch (error) {
      console.warn("[DEVICE PROVIDER] Shutdown request did not complete:", error);
    }

    try {
      await bleDiagnostic.disconnect();
    } finally {
      clearDeviceInfo();

      setGeneratorState((previousState) => ({
        ...previousState,
        connected: false,
        deviceName: null,
        outputEnabled: false,
      }));

      // A fresh scan clears the previous discovery list, so a powered-off
      // EVT1 won't remain listed just because it was discovered earlier.
      void scanForDevices().catch((error) => {
        console.error("[DEVICE PROVIDER] Scan after disconnect failed:", error);
      });
    }
  }, [stopScan, scanForDevices, clearDeviceInfo, setDmmReading, setGeneratorState]);

  const testWrite = useCallback(async (): Promise<void> => {
    await pingPocketLab();

    const info = await getPocketLabInfo();
    setDeviceInfo(info);

    console.log("[POCKETLAB] Device info:", info);
  }, []);

  return { deviceInfo, capabilities, reconnecting, connect, disconnect, testWrite };
}
