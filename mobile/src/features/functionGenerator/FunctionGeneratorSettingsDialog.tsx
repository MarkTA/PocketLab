import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Dialog, Text, TextInput } from "react-native-paper";

import {
  Dropdown,
  type DropdownOption,
} from "../../components/ui/Dropdown";
import type { Waveform } from "../../types/pocketLab";
import type { FunctionGeneratorSettingsDraft } from "./useFunctionGeneratorSettingsEditor";

const WAVEFORM_OPTIONS = [
  { label: "Sine", value: "sine" },
  { label: "Square", value: "square" },
  { label: "Triangle", value: "triangle" },
  { label: "Ramp Up", value: "rampUp" },
  { label: "Ramp Down", value: "rampDown" },
  { label: "DC", value: "dc" },
] as const satisfies readonly DropdownOption<Waveform>[];

type FunctionGeneratorSettingsDialogProps = {
  visible: boolean;
  draft: FunctionGeneratorSettingsDraft;
  applying: boolean;
  errorMessage: string | null;

  onChange: <Key extends keyof FunctionGeneratorSettingsDraft>(
    key: Key,
    value: FunctionGeneratorSettingsDraft[Key]
  ) => void;

  onApply: () => void;
  onDismiss: () => void;
};

export function FunctionGeneratorSettingsDialog({
  visible,
  draft,
  applying,
  errorMessage,
  onChange,
  onApply,
  onDismiss,
}: FunctionGeneratorSettingsDialogProps) {
  return (
    <Dialog
      visible={visible}
      onDismiss={onDismiss}
      dismissable={!applying}
    >
      <Dialog.Title>Signal settings</Dialog.Title>

      <Dialog.ScrollArea style={styles.scrollArea}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Dropdown
            label="Waveform"
            value={draft.waveform}
            options={WAVEFORM_OPTIONS}
            disabled={applying}
            onValueChange={(waveform) => {
              onChange("waveform", waveform);
            }}
          />

          <TextInput
            mode="outlined"
            label="Frequency (Hz)"
            keyboardType="numeric"
            value={draft.frequencyHz}
            disabled={applying}
            onChangeText={(value) => {
              onChange("frequencyHz", value);
            }}
          />

          <TextInput
            mode="outlined"
            label="Amplitude (Vpp)"
            keyboardType="decimal-pad"
            value={draft.amplitudeVpp}
            disabled={applying}
            onChangeText={(value) => {
              onChange("amplitudeVpp", value);
            }}
          />

          <TextInput
            mode="outlined"
            label="DC offset (V)"
            keyboardType="decimal-pad"
            value={draft.offsetV}
            disabled={applying}
            onChangeText={(value) => {
              onChange("offsetV", value);
            }}
          />

          <Text variant="bodySmall" style={styles.limits}>
            Frequency 1 Hz–1 MHz · Amplitude 0–5 Vpp · Offset −2.5–2.5 V
          </Text>

          {errorMessage ? (
            <Text variant="bodySmall" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}
        </ScrollView>
      </Dialog.ScrollArea>

      <Dialog.Actions>
        <Button disabled={applying} onPress={onDismiss}>
          Cancel
        </Button>

        <Button
          mode="contained"
          loading={applying}
          disabled={applying}
          onPress={onApply}
        >
          Apply
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 520,
    paddingHorizontal: 0,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 14,
  },
  limits: {
    opacity: 0.65,
  },
  error: {
    color: "#B3261E",
  },
});