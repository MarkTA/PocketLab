/* src/features/device/DeviceProvider.tsx */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ACTIVE_CALIBRATION_PROFILE } from "../../calibration/activeCalibration";
import { toHardwareGeneratorSettings } from "../../calibration/calibrationTransforms";
import type { FunctionGeneratorState, Waveform } from "../../types/pocketLab";

import { bleDiagnostic } from "./bleClient";
import type {
  DeviceContextValue,
  DmmMode,
  DmmReading,
  DmmState,
  FunctionGeneratorSettings,
} from "./deviceTypes";
import { parseDmmReading, parseDmmState } from "./dmm/dmmProtocol";
import { useBleConnection } from "./hooks/useBleConnection";
import { useBleScanner } from "./hooks/useBleScanner";

import {
  setPocketLabAmplitude,
  setPocketLabFrequency,
  setPocketLabOffset,
  setPocketLabOutput,
  setPocketLabSettings,
  type PocketLabSettings,
  type PocketLabWaveform,
} from "./pocketLabProtocol";

// Preserve existing type imports from DeviceProvider.tsx.
export type {
  DmmMode,
  DmmReading,
  DmmState,
  FunctionGeneratorSettings,
} from "./deviceTypes";

const initialState: FunctionGeneratorState = {
  connected: false,
  deviceName: null,
  offsetV: 0,
  frequencyHz: 1000,
  amplitudeVpp: 0.65,
  waveform: "sine",
  outputEnabled: false,
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

const UI_TO_PROTOCOL_WAVEFORM: Record<Waveform, PocketLabWaveform> = {
  sine: "SINE",
  square: "SQUARE",
  triangle: "TRIANGLE",
  rampUp: "RAMP_UP",
  rampDown: "RAMP_DOWN",
  dc: "DC",
};

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

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FunctionGeneratorState>(initialState);

  const [dmmReading, setDmmReading] = useState<DmmReading | null>(null);

  const [dmmState, setDmmState] = useState<DmmState | null>(null);
  const [continuityActive, setContinuityActive] = useState(false);

  useEffect(() => bleDiagnostic.onContinuityChanged(setContinuityActive), []);

  const { scanning, discoveredDevices, scanForDevices, stopScan } = useBleScanner();

  const requestDmmState = useCallback(async (): Promise<DmmState> => {
    //console.log("[DMM] Requesting state...");

    const response = await bleDiagnostic.request("DMM:GET_STATE");

    //console.log("[DMM] State response:", response);

    const nextDmmState = parseDmmState(response);

    setDmmState(nextDmmState);

    //console.log("[DMM] State synchronized:", nextDmmState);

    return nextDmmState;
  }, []);

  const setDmmMode = useCallback(async (mode: DmmMode): Promise<DmmState> => {
    console.log(`[DMM] Setting mode: ${mode}`);
    setContinuityActive(false);

    const response = await bleDiagnostic.request(`DMM:SET_MODE ${mode}`);

    //console.log("[DMM] Mode response:", response);

    const nextDmmState = parseDmmState(response);

    setDmmState(nextDmmState);

    /*
     * Clear the previous reading so the UI does not briefly show a
     * measurement from the old mode after switching.
     */
    setDmmReading(null);

    //console.log("[DMM] Mode updated:", nextDmmState);

    return nextDmmState;
  }, []);

  const requestDmmReading = useCallback(async (): Promise<DmmReading> => {
    //console.log("[DMM] Requesting reading...");

    const response = await bleDiagnostic.request("DMM:READ");

    //console.log("[DMM] Reading response:", response);

    const { reading, inferredState } = parseDmmReading(response);

    if (inferredState) {
      setDmmState(inferredState);
    }

    setDmmReading(reading);

    //console.log("[DMM] Reading updated:", reading);

    return reading;
  }, []);

  const { deviceInfo, capabilities, reconnecting, connect, disconnect, testWrite } =
    useBleConnection({
      stopScan,
      scanForDevices,
      requestDmmState,
      setDmmState,
      setDmmReading,
      setGeneratorState: setState,
    });

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

  const setOffset = useCallback(
    async (volts: number): Promise<void> => {
      const hardwareSettings = toProtocolSettings({
        frequencyHz: state.frequencyHz,
        amplitudeVpp: state.amplitudeVpp,
        offsetV: volts,
        waveform: state.waveform,
      });

      await setPocketLabOffset(hardwareSettings.offsetV);

      setState((previousState) => ({
        ...previousState,
        offsetV: volts,
      }));
    },
    [state.amplitudeVpp, state.frequencyHz, state.waveform]
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

      const frequencyHz = Math.max(1, Math.round(hz));

      await setPocketLabFrequency(frequencyHz);

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

      const hardwareSettings = toProtocolSettings({
        frequencyHz: state.frequencyHz,
        amplitudeVpp,
        offsetV: state.offsetV,
        waveform: state.waveform,
      });

      await setPocketLabAmplitude(hardwareSettings.amplitudeVpp);

      setState((previousState) => ({
        ...previousState,
        amplitudeVpp,
      }));
    },
    [state.frequencyHz, state.offsetV, state.waveform]
  );

  const setWaveform = useCallback(
    async (waveform: Waveform): Promise<void> => {
      const normalizedSettings = normalizeGeneratorSettings({
        frequencyHz:
          waveform === "dc" ? 0 : state.frequencyHz > 0 ? state.frequencyHz : 1000,

        amplitudeVpp: waveform === "dc" ? 0 : state.amplitudeVpp,

        offsetV: state.offsetV,

        waveform,
      });

      await setPocketLabSettings(toProtocolSettings(normalizedSettings));

      setState((previousState) => ({
        ...previousState,
        ...normalizedSettings,
      }));
    },
    [state.amplitudeVpp, state.frequencyHz, state.offsetV]
  );

  const setOutputEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (enabled) {
        toProtocolSettings({
          frequencyHz: state.frequencyHz,
          amplitudeVpp: state.amplitudeVpp,
          offsetV: state.offsetV,
          waveform: state.waveform,
        });
      }

      await setPocketLabOutput(enabled);

      setState((previousState) => ({
        ...previousState,
        outputEnabled: enabled,
      }));
    },
    [state.amplitudeVpp, state.frequencyHz, state.offsetV, state.waveform]
  );

  const value = useMemo<DeviceContextValue>(
    () => ({
      state,

      deviceInfo,
      capabilities,
      dmmState,

      continuityActive: state.connected && dmmState?.mode === "CONTINUITY" && continuityActive,
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
      setDmmMode,

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

      continuityActive,
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
      setDmmMode,

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
