/* src/features/functionGenerator/useFunctionGeneratorEditor.ts */

import { useCallback, useMemo, useState } from "react";

import {
  FUNCTION_GENERATOR_LIMITS,
  clamp,
  periodSecToFrequency,
} from "../../lib/hardwareLimits";
import type { Waveform } from "../../types/pocketLab";
import type { FunctionGeneratorController } from "./useFunctionGenerator";

export type NumericEditingSetting = "frequency" | "period" | "amplitude" | "offset";

export type EditingSetting = "waveform" | NumericEditingSetting | null;

export type FunctionGeneratorEditor = {
  editingSetting: EditingSetting;
  editText: string;
  applying: boolean;
  errorMessage: string | null;

  waveformDialogVisible: boolean;
  numberDialogVisible: boolean;
  editorTitle: string;
  limitText: string;

  setEditText: (text: string) => void;
  openWaveformEditor: () => void;
  openNumberEditor: (setting: NumericEditingSetting, value: number) => void;
  closeEditor: () => void;
  applyNumberEdit: () => Promise<void>;
  selectWaveform: (waveform: Waveform) => Promise<void>;
};

export function useFunctionGeneratorEditor(
  generator: FunctionGeneratorController
): FunctionGeneratorEditor {
  const [editingSetting, setEditingSetting] = useState<EditingSetting>(null);

  const [editText, setEditTextState] = useState("");
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setEditText = useCallback((text: string) => {
    setEditTextState(text);
    setErrorMessage(null);
  }, []);

  const openWaveformEditor = useCallback(() => {
    setErrorMessage(null);
    setEditingSetting("waveform");
  }, []);

  const openNumberEditor = useCallback(
    (setting: NumericEditingSetting, value: number) => {
      setErrorMessage(null);
      setEditingSetting(setting);
      setEditTextState(String(value));
    },
    []
  );

  const closeEditor = useCallback(() => {
    if (applying) return;

    setEditingSetting(null);
    setEditTextState("");
    setErrorMessage(null);
  }, [applying]);

  const applyNumberEdit = useCallback(async () => {
    const value = Number(editText);

    if (!Number.isFinite(value)) {
      setErrorMessage("Enter a valid number.");
      return;
    }

    setApplying(true);
    setErrorMessage(null);

    try {
      switch (editingSetting) {
        case "frequency":
          await generator.setFrequency(
            clamp(
              value,
              FUNCTION_GENERATOR_LIMITS.minFrequencyHz,
              FUNCTION_GENERATOR_LIMITS.maxFrequencyHz
            )
          );
          break;

        case "period": {
          const periodSec = clamp(
            value / 1000,
            1 / FUNCTION_GENERATOR_LIMITS.maxFrequencyHz,
            1 / FUNCTION_GENERATOR_LIMITS.minFrequencyHz
          );

          await generator.setFrequency(periodSecToFrequency(periodSec));
          break;
        }

        case "amplitude":
          await generator.setAmplitude(
            clamp(
              value,
              FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp,
              FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp
            )
          );
          break;

        case "offset":
          await generator.setOffset(
            clamp(
              value,
              FUNCTION_GENERATOR_LIMITS.minOffsetV,
              FUNCTION_GENERATOR_LIMITS.maxOffsetV
            )
          );
          break;

        default:
          throw new Error("No numeric setting is being edited.");
      }

      setEditingSetting(null);
      setEditTextState("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update the function generator."
      );
    } finally {
      setApplying(false);
    }
  }, [editText, editingSetting, generator]);

  const selectWaveform = useCallback(
    async (waveform: Waveform) => {
      setApplying(true);
      setErrorMessage(null);

      try {
        await generator.setWaveform(waveform);
        setEditingSetting(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not update the waveform."
        );
      } finally {
        setApplying(false);
      }
    },
    [generator]
  );

  const editorTitle = useMemo(() => getEditorTitle(editingSetting), [editingSetting]);

  const limitText = useMemo(() => getLimitText(editingSetting), [editingSetting]);

  return {
    editingSetting,
    editText,
    applying,
    errorMessage,
    waveformDialogVisible: editingSetting === "waveform",
    numberDialogVisible:
      editingSetting === "frequency" ||
      editingSetting === "period" ||
      editingSetting === "amplitude" ||
      editingSetting === "offset",
    editorTitle,
    limitText,
    setEditText,
    openWaveformEditor,
    openNumberEditor,
    closeEditor,
    applyNumberEdit,
    selectWaveform,
  };
}

function getEditorTitle(setting: EditingSetting): string {
  switch (setting) {
    case "frequency":
      return "Edit Frequency (Hz)";
    case "period":
      return "Edit Period (ms)";
    case "amplitude":
      return "Edit Amplitude (Vpp)";
    case "offset":
      return "Edit Offset (V)";
    default:
      return "";
  }
}

function getLimitText(setting: EditingSetting): string {
  switch (setting) {
    case "frequency":
      return `${FUNCTION_GENERATOR_LIMITS.minFrequencyHz} Hz to ${FUNCTION_GENERATOR_LIMITS.maxFrequencyHz} Hz`;
    case "period":
      return "Derived from frequency limits";
    case "amplitude":
      return `${FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp} Vpp to ${FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp} Vpp`;
    case "offset":
      return `${FUNCTION_GENERATOR_LIMITS.minOffsetV} V to ${FUNCTION_GENERATOR_LIMITS.maxOffsetV} V`;
    default:
      return "";
  }
}
