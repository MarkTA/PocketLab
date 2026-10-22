import { Button, Dialog, Portal, RadioButton, Text } from "react-native-paper";
import { View, StyleSheet } from "react-native";

export type AveragingPreset = "FAST" | "NORMAL" | "STABLE" | "PRECISION";
export type SensitivityPreset = "AUTO" | "HIGH" | "LOW";

export const AVERAGING_WINDOW_MS: Record<AveragingPreset, number> = {
  FAST: 200,
  NORMAL: 500,
  STABLE: 2_000,
  PRECISION: 5_000,
};

type Props = {
  visible: boolean;
  onDismiss: () => void;
  averaging: AveragingPreset;
  onAveragingChange: (value: AveragingPreset) => void;
  sensitivity: SensitivityPreset;
  onSensitivityChange: (value: SensitivityPreset) => void;
};

export function DcVoltageSettings({ visible, onDismiss, averaging, onAveragingChange, sensitivity, onSensitivityChange }: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>DC Voltage Settings</Dialog.Title>
        <Dialog.ScrollArea>
          <View style={styles.body}>
            <Text variant="titleSmall">Averaging</Text>
            <RadioButton.Group value={averaging} onValueChange={value => onAveragingChange(value as AveragingPreset)}>
              <RadioButton.Item label="Fast · 200 ms" value="FAST" />
              <RadioButton.Item label="Normal · 500 ms" value="NORMAL" />
              <RadioButton.Item label="Stable · 2 s" value="STABLE" />
              <RadioButton.Item label="Precision · 5 s" value="PRECISION" />
            </RadioButton.Group>
            <Text variant="titleSmall">Display sensitivity</Text>
            <RadioButton.Group value={sensitivity} onValueChange={value => onSensitivityChange(value as SensitivityPreset)}>
              <RadioButton.Item label="Auto · 1 mV steps" value="AUTO" />
              <RadioButton.Item label="High · 1 µV steps" value="HIGH" />
              <RadioButton.Item label="Low · 10 mV steps" value="LOW" />
            </RadioButton.Group>
            <Text variant="bodySmall">Sensitivity changes display rounding only. Raw samples and graph are unchanged. Small voltages are not forcibly zeroed.</Text>
          </View>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={() => { onAveragingChange("NORMAL"); onSensitivityChange("AUTO"); }}>Reset</Button>
          <Button onPress={onDismiss}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({ body: { paddingVertical: 12, gap: 8 } });
