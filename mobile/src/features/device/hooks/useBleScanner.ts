/* src/features/device/hooks/useBleScanner.ts */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "react-native-ble-plx";

import { bleDiagnostic } from "../bleClient";

const SCAN_DURATION_MS = 10_000;

/** Manages BLE discovery without exposing scanner state to the rest of the provider. */
export function useBleScanner() {
  const [scanning, setScanning] = useState(false);
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

  return { scanning, discoveredDevices, scanForDevices, stopScan };
}
