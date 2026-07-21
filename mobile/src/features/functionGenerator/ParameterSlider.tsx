import Slider from "@react-native-community/slider";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  markers?: readonly SliderMarker[];
  onValueChange: (value: number) => void;
  onValueCommit: (value: number) => void;
  onSlidingStateChange?: (sliding: boolean) => void;
};

export type SliderMarker = {
  label: string;
  value: number;
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
  markers,
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

      {markers ? (
        <View style={styles.markers}>
          {markers.map((marker) => {
            const markerSliderValue = toSliderValue(marker.value);
            const position =
              (markerSliderValue - minimumSliderValue) /
              (maximumSliderValue - minimumSliderValue);

            return (
              <Pressable
                key={`${marker.label}-${marker.value}`}
                accessibilityRole="button"
                accessibilityLabel={`Set ${label} to ${marker.label} ${unit}`}
                disabled={
                  disabled || marker.value < minimumValue || marker.value > maximumValue
                }
                onPress={() => {
                  const nextValue = clamp(marker.value, minimumValue, maximumValue);
                  onValueChange(nextValue);
                  onValueCommit(nextValue);
                }}
                style={[styles.marker, { left: `${clamp(position, 0, 1) * 100}%` }]}
              >
                <View
                  style={[styles.markerDot, { backgroundColor: theme.colors.primary }]}
                />
                <Text variant="labelSmall" style={styles.markerLabel}>
                  {marker.label}
                </Text>
              </Pressable>
            );
          })}
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
  markers: {
    position: "relative",
    height: 40,
  },
  marker: {
    position: "absolute",
    width: 48,
    minHeight: 40,
    marginLeft: -24,
    alignItems: "center",
  },
  markerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginBottom: 3,
  },
  markerLabel: {
    opacity: 0.72,
  },
});
