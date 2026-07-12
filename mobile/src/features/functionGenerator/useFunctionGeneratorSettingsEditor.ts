/* src/features/functionGenerator/useFunctionGeneratorSettingsEditor.ts */

import { useCallback, useState } from "react";

import { FUNCTION_GENERATOR_LIMITS, clamp } from "../../lib/hardwareLimits";
import type { Waveform } from "../../types/pocketLab";
import type { FunctionGeneratorController } from "./useFunctionGenerator";

export type FunctionGeneratorSettingsDraft = {
  waveform: Waveform;
  frequencyHz: string;
  amplitudeVpp: string;
  offsetV: string;
};

const EMPTY_DRAFT: FunctionGeneratorSettingsDraft = {
  waveform: "sine",
  frequencyHz: "",
  amplitudeVpp: "",
  offsetV: "",
};

export function useFunctionGeneratorSettingsEditor(
  generator: FunctionGeneratorController
) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<FunctionGeneratorSettingsDraft>(EMPTY_DRAFT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = useCallback(() => {
    setDraft({
      waveform: generator.state.waveform,
      frequencyHz: String(generator.state.frequencyHz),
      amplitudeVpp: String(generator.state.amplitudeVpp),
      offsetV: String(generator.offsetV),
    });

    setErrorMessage(null);
    setVisible(true);
  }, [
    generator.offsetV,
    generator.state.amplitudeVpp,
    generator.state.frequencyHz,
    generator.state.waveform,
  ]);

  const close = useCallback(() => {
    if (generator.settingsPending) {
      return;
    }

    setVisible(false);
    setErrorMessage(null);
  }, [generator.settingsPending]);

  const updateField = useCallback(
    <Key extends keyof FunctionGeneratorSettingsDraft>(
      key: Key,
      value: FunctionGeneratorSettingsDraft[Key]
    ) => {
      setDraft((previousDraft) => ({
        ...previousDraft,
        [key]: value,
      }));

      setErrorMessage(null);
    },
    []
  );

  const apply = useCallback(async (): Promise<void> => {
    const frequencyValue = Number(draft.frequencyHz);
    const amplitudeValue = Number(draft.amplitudeVpp);
    const offsetValue = Number(draft.offsetV);

    if (
      !Number.isFinite(frequencyValue) ||
      !Number.isFinite(amplitudeValue) ||
      !Number.isFinite(offsetValue)
    ) {
      setErrorMessage("Frequency, amplitude, and offset must be valid numbers.");
      return;
    }

    const frequencyHz = Math.round(
      clamp(
        frequencyValue,
        FUNCTION_GENERATOR_LIMITS.minFrequencyHz,
        FUNCTION_GENERATOR_LIMITS.maxFrequencyHz
      )
    );

    const amplitudeVpp = clamp(
      amplitudeValue,
      FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp,
      FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp
    );

    const offsetV = clamp(
      offsetValue,
      FUNCTION_GENERATOR_LIMITS.minOffsetV,
      FUNCTION_GENERATOR_LIMITS.maxOffsetV
    );

    try {
      await generator.applySettings({
        waveform: draft.waveform,
        frequencyHz,
        amplitudeVpp,
        offsetV,
      });

      setVisible(false);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not apply function-generator settings."
      );
    }
  }, [draft, generator]);

  return {
    visible,
    draft,
    applying: generator.settingsPending,
    errorMessage: errorMessage ?? generator.settingsError,
    open,
    close,
    updateField,
    apply,
  };
}
