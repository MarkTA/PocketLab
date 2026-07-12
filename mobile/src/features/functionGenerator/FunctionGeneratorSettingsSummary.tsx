/* src/features/functionGenerator/FunctionGeneratorSettingsSummary.tsx */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";

import type { Waveform } from "../../types/pocketLab";
import { WaveformIcon } from "./WaveformIcon";
import { pocketLabColors } from "@/themes/theme";

type FunctionGeneratorSettingsSummaryProps = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  disabled?: boolean;
  onPress: () => void;
};

export function FunctionGeneratorSettingsSummary({
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  disabled = false,
  onPress,
}: FunctionGeneratorSettingsSummaryProps) {
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit function generator settings"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.headingRow}>
          <View style={styles.titleGroup}>
            <WaveformIcon type={waveform} size={28} color={pocketLabColors.darkTeal} />

            <View>
              <Text variant="titleMedium">Signal settings</Text>
              <Text variant="bodySmall" style={styles.hint}>
                Tap to edit
              </Text>
            </View>
          </View>

          <Text style={styles.chevron}>›</Text>
        </View>

        <Text variant="headlineSmall" style={styles.waveform}>
          {formatWaveform(waveform)}
        </Text>

        <Text variant="bodyLarge" style={styles.values}>
          {formatFrequency(frequencyHz)}
          {"  ·  "}
          {amplitudeVpp.toFixed(2)} Vpp
          {"  ·  "}
          {offsetV.toFixed(2)} V offset
        </Text>
      </Pressable>
    </Card>
  );
}

function formatWaveform(waveform: Waveform): string {
  const labels: Record<Waveform, string> = {
    sine: "Sine",
    square: "Square",
    triangle: "Triangle",
    dc: "DC",
    rampUp: "Ramp Up",
    rampDown: "Ramp Down",
  };

  return labels[waveform];
}

function formatFrequency(frequencyHz: number): string {
  if (frequencyHz >= 1_000_000) {
    return `${formatCompact(frequencyHz / 1_000_000)} MHz`;
  }

  if (frequencyHz >= 1_000) {
    return `${formatCompact(frequencyHz / 1_000)} kHz`;
  }

  return `${formatCompact(frequencyHz)} Hz`;
}

function formatCompact(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const styles = StyleSheet.create({
  pressable: {
    padding: 16,
    gap: 12,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hint: {
    opacity: 0.6,
  },
  waveform: {
    color: pocketLabColors.darkTeal,
  },
  values: {
    opacity: 0.78,
  },
  chevron: {
    fontSize: 34,
    lineHeight: 26,
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.68,
  },
  disabled: {
    opacity: 0.45,
  },
});
