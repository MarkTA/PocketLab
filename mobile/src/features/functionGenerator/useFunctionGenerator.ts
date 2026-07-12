/* src/features/functionGenerator/useFunctionGenerator.ts */

import { useCallback, useMemo, useState } from "react";

import type { FunctionGeneratorState, Waveform } from "../../types/pocketLab";

import { frequencyToPeriodSec } from "../../lib/hardwareLimits";
import {
  usePocketLabDevice,
  type FunctionGeneratorSettings,
} from "../device/DeviceProvider";

export type FunctionGeneratorController = {
  state: FunctionGeneratorState;
  connected: boolean;
  reconnecting: boolean;

  periodMs: number;
  offsetV: number;

  settingsPending: boolean;
  settingsError: string | null;

  outputPending: boolean;
  outputError: string | null;

  previewProps: {
    waveform: Waveform;
    frequencyHz: number;
    amplitudeVpp: number;
    offsetV: number;
    outputEnabled: boolean;
  };

  applySettings: (settings: FunctionGeneratorSettings) => Promise<void>;

  setOutputEnabled: (enabled: boolean) => Promise<void>;
  toggleOutput: () => Promise<void>;
};

export function useFunctionGenerator(): FunctionGeneratorController {
  const {
    state,
    reconnecting,
    setGeneratorSettings,
    setOutputEnabled: setDeviceOutputEnabled,
  } = usePocketLabDevice();

  const [settingsPending, setSettingsPending] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [outputPending, setOutputPending] = useState(false);
  const [outputError, setOutputError] = useState<string | null>(null);

  const offsetV = state.offsetV ?? 0;
  const periodMs = frequencyToPeriodSec(state.frequencyHz) * 1000;

  const applySettings = useCallback(
    async (settings: FunctionGeneratorSettings): Promise<void> => {
      if (!state.connected) {
        throw new Error("PocketLab is not connected.");
      }

      if (settingsPending) {
        return;
      }

      setSettingsPending(true);
      setSettingsError(null);

      try {
        await setGeneratorSettings(settings);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not apply function-generator settings.";

        setSettingsError(message);
        throw error;
      } finally {
        setSettingsPending(false);
      }
    },
    [setGeneratorSettings, settingsPending, state.connected]
  );

  const setOutputEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!state.connected) {
        throw new Error("PocketLab is not connected.");
      }

      if (outputPending) {
        return;
      }

      setOutputPending(true);
      setOutputError(null);

      try {
        await setDeviceOutputEnabled(enabled);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not change the output state.";

        setOutputError(message);
        throw error;
      } finally {
        setOutputPending(false);
      }
    },
    [outputPending, setDeviceOutputEnabled, state.connected]
  );

  const toggleOutput = useCallback(async (): Promise<void> => {
    await setOutputEnabled(!state.outputEnabled);
  }, [setOutputEnabled, state.outputEnabled]);

  const previewProps = useMemo(
    () => ({
      waveform: state.waveform,
      frequencyHz: state.frequencyHz,
      amplitudeVpp: state.amplitudeVpp,
      offsetV,
      outputEnabled: state.outputEnabled,
    }),
    [state.waveform, state.frequencyHz, state.amplitudeVpp, state.outputEnabled, offsetV]
  );

  return {
    state,
    connected: state.connected,
    reconnecting,
    periodMs,
    offsetV,
    settingsPending,
    settingsError,
    outputPending,
    outputError,
    previewProps,
    applySettings,
    setOutputEnabled,
    toggleOutput,
  };
}
