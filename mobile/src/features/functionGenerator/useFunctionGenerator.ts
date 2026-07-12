/* src/features/functionGenerator/useFunctionGenerator.ts */

import { useCallback, useMemo } from "react";

import type { FunctionGeneratorState, Waveform } from "../../types/pocketLab";
import { frequencyToPeriodSec } from "../../lib/hardwareLimits";
import { usePocketLabDevice } from "../device/DeviceProvider";

export type FunctionGeneratorController = {
  state: FunctionGeneratorState;
  connected: boolean;
  reconnecting: boolean;
  periodMs: number;
  offsetV: number;

  previewProps: {
    waveform: Waveform;
    frequencyHz: number;
    amplitudeVpp: number;
    offsetV: number;
    outputEnabled: boolean;
  };

  setFrequency: (frequencyHz: number) => void | Promise<void>;
  setAmplitude: (amplitudeVpp: number) => void | Promise<void>;
  setOffset: (offsetV: number) => void | Promise<void>;
  setWaveform: (waveform: Waveform) => void | Promise<void>;
  setOutputEnabled: (enabled: boolean) => void | Promise<void>;
  toggleOutput: () => void | Promise<void>;
};

export function useFunctionGenerator(): FunctionGeneratorController {
  const {
    state,
    reconnecting,
    setFrequency,
    setAmplitude,
    setOffset,
    setWaveform,
    setOutputEnabled,
  } = usePocketLabDevice();

  const offsetV = state.offsetV ?? 0;
  const periodMs = frequencyToPeriodSec(state.frequencyHz) * 1000;

  const toggleOutput = useCallback(() => {
    return setOutputEnabled(!state.outputEnabled);
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
    previewProps,
    setFrequency,
    setAmplitude,
    setOffset,
    setWaveform,
    setOutputEnabled,
    toggleOutput,
  };
}
