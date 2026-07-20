import Slider from "@react-native-community/slider";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";

type ParameterSliderProps = {
  label: string;
  value: number;
  unit: string;
  minimumValue: number;
  maximumValue: number;
  sliderValue?: number;
  minimumSliderValue?: number;
  maximumSliderValue?: number;
  step?: number;
  disabled?: boolean;
  formatValue: (value: number) => string;
  fromSliderValue?: (value: number) => number;
  toSliderValue?: (value: number) => number;
  tickLabels?: readonly string[];
  onValueChange: (value: number) => void;
  onValueCommit: (value: number) => void;
  onSlidingStateChange?: (sliding: boolean) => void;
};

export function ParameterSlider({
  label,
  value,
  unit,
  minimumValue,
  maximumValue,
  sliderValue = value,
  minimumSliderValue = minimumValue,
  maximumSliderValue = maximumValue,
  step,
  disabled = false,
  formatValue,
  fromSliderValue = identity,
  toSliderValue = identity,
  tickLabels,
  onValueChange,
  onValueCommit,
  onSlidingStateChange,
}: ParameterSliderProps) {
  const theme = useTheme();
  const [textValue, setTextValue] = useState(formatValue(value));

  useEffect(() => {
    setTextValue(formatValue(value));
  }, [formatValue, value]);

  const commitTextValue = () => {
    const parsed = Number(textValue.replace(",", "."));

    if (!Number.isFinite(parsed)) {
      setTextValue(formatValue(value));
      return;
    }

    const nextValue = clamp(parsed, minimumValue, maximumValue);
    onValueChange(nextValue);
    onValueCommit(nextValue);
    setTextValue(formatValue(nextValue));
  };

  return (
    <View style={styles.container}>
      <View style={styles.valueRow}>
        <Text variant="titleMedium">{label}</Text>

        <View style={styles.inputGroup}>
          <TextInput
            mode="flat"
            dense
            selectTextOnFocus
            keyboardType="decimal-pad"
            value={textValue}
            disabled={disabled}
            onChangeText={setTextValue}
            onBlur={commitTextValue}
            onSubmitEditing={commitTextValue}
            style={styles.input}
            contentStyle={styles.inputContent}
          />
          <Text variant="titleMedium" style={styles.unit}>
            {unit}
          </Text>
        </View>
      </View>

      <Slider
        accessibilityLabel={`${label} slider`}
        minimumValue={minimumSliderValue}
        maximumValue={maximumSliderValue}
        value={clamp(toSliderValue(sliderValue), minimumSliderValue, maximumSliderValue)}
        step={step}
        disabled={disabled}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.surfaceVariant}
        thumbTintColor={theme.colors.primary}
        onSlidingStart={() => {
          onSlidingStateChange?.(true);
        }}
        onValueChange={(nextSliderValue) => {
          onValueChange(
            clamp(fromSliderValue(nextSliderValue), minimumValue, maximumValue)
          );
        }}
        onSlidingComplete={(nextSliderValue) => {
          const nextValue = clamp(
            fromSliderValue(nextSliderValue),
            minimumValue,
            maximumValue
          );

          onSlidingStateChange?.(false);
          onValueCommit(nextValue);
        }}
        style={styles.slider}
      />

      {tickLabels ? (
        <View style={styles.ticks}>
          {tickLabels.map((tick) => (
            <Text key={tick} variant="labelSmall" style={styles.tick}>
              {tick}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.rangeRow}>
          <Text variant="labelSmall">{formatValue(minimumValue)}</Text>
          <Text variant="labelSmall">{formatValue(maximumValue)}</Text>
        </View>
      )}
    </View>
  );
}

function identity(value: number): number {
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    width: 126,
    backgroundColor: "transparent",
  },
  inputContent: {
    textAlign: "right",
    fontSize: 22,
  },
  unit: {
    minWidth: 42,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    opacity: 0.7,
  },
  ticks: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tick: {
    opacity: 0.7,
  },
});