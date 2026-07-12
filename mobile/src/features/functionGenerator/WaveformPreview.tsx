import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { Text } from "react-native-paper";
import type { Waveform } from "../../types/pocketLab";
import { pocketLabColors } from "@/themes/theme";

type Props = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  outputEnabled: boolean;
};

const CHART_HEIGHT = 110;
const CHART_WIDTH = 290;

export function WaveformPreview({
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  outputEnabled,
}: Props) {
  const data = useMemo(() => {
    const points = 81;
    const halfAmp = amplitudeVpp / 2;

    return Array.from({ length: points }, (_, i) => {
      const t = i / (points - 1);
      const cycles = t * 2;
      const phase = cycles % 1;

      let norm = 0;

      switch (waveform) {
        case "sine":
          norm = Math.sin(2 * Math.PI * cycles);
          break;
        case "square":
          norm = phase < 0.5 ? 1 : -1;
          break;
        case "triangle":
          norm = 1 - 4 * Math.abs(phase - 0.5);
          break;
        case "dc":
          norm = 0;
          break;
        case "rampUp":
          norm = 2 * phase - 1;
          break;
        case "rampDown":
          norm = 1 - 2 * phase;
          break;
      }

      const voltage = halfAmp * norm;

      return {
        value: voltage,
        showVerticalLine: [0, 20, 40, 60, 80].includes(i),
        verticalLineColor: "rgba(0,0,0,0.12)",
        verticalLineThickness: 1,
        verticalLineStrokeDashArray: [4, 6],
      };
    });
  }, [waveform, frequencyHz, amplitudeVpp, offsetV, outputEnabled]);

  const yLimit = (amplitudeVpp * 2) / 3;
  const yStep = yLimit / 4;

  const yAxisLabelTexts = Array.from({ length: 9 }, (_, i) => {
    const graphVoltage = yLimit - i * yStep;
    const displayedVoltage = offsetV + graphVoltage;
    return displayedVoltage.toFixed(2);
  });

  const periodSec = 1 / frequencyHz;
  const xLabels = [0, 0.5, 1, 1.5, 2].map((k) => k * periodSec);

  return (
    <View style={styles.chartBox}>
      <Text style={styles.yAxisTitle}>v(t)</Text>
      <LineChart
        data={data}
        height={CHART_HEIGHT}
        width={CHART_WIDTH}
        areaChart={false}
        noOfSections={4}
        noOfSectionsBelowXAxis={4}
        curved={waveform == "sine"}
        stepChart={waveform == "square"} // Enables the square/step wave effect
        yAxisLabelTexts={yAxisLabelTexts}
        hideDataPoints
        thickness={3}
        maxValue={yLimit}
        mostNegativeValue={-yLimit}
        color={pocketLabColors.orange}
        initialSpacing={8}
        endSpacing={8}
        rulesType="dashed"
        rulesColor={pocketLabColors.grid}
        spacing={CHART_WIDTH / (data.length + 2)}
        curvature={0.3}
      />
      <Text style={styles.xAxisTitle}>t</Text>
      <View style={styles.xLabels}>
        {xLabels.map((seconds) => (
          <Text key={seconds} style={styles.axisLabel}>
            {formatTime(seconds)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function formatTime(seconds: number) {
  if (seconds === 0) return "0";
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(0)} ns`;
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(0)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(2)} ms`;
  return `${seconds.toFixed(3)} s`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: pocketLabColors.surface,
    gap: 10,
    shadowColor: pocketLabColors.text,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  subtle: {
    opacity: 0.6,
  },
  chartBox: {
    position: "relative",
    backgroundColor: pocketLabColors.surface,
    borderRadius: 10,
    paddingTop: 40,
    paddingRight: 8,
    paddingLeft: 18,
    paddingBottom: 28,
  },

  yAxisTitle: {
    position: "absolute",
    top: 4,
    left: 34,
    color: pocketLabColors.darkTeal,
    fontSize: 20,
    fontStyle: "italic",
    fontWeight: "700",
    zIndex: 10,
  },

  xAxisTitle: {
    position: "absolute",
    right: 8,
    bottom: 165,
    fontStyle: "italic",
    color: pocketLabColors.darkTeal,
    fontSize: 20,
    fontWeight: "700",
  },
  yAxisLabel: {
    color: pocketLabColors.darkTeal,
    fontWeight: "700",
    marginLeft: 10,
  },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginLeft: 42,
    marginRight: 10,
    marginTop: -4,
  },

  axisLabel: {
    fontSize: 12,
    color: pocketLabColors.mutedText,
    minWidth: 30,
  },
  axisText: {
    color: pocketLabColors.darkTeal,
    fontSize: 10,
  },
  captionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  caption: {
    fontSize: 13,
    color: pocketLabColors.darkTeal,
  },
  dot: {
    color: pocketLabColors.darkTeal,
    fontWeight: "700",
  },
  onText: {
    color: pocketLabColors.darkGreen,
    fontWeight: "700",
  },
  offText: {
    color: pocketLabColors.mutedText,
    fontWeight: "700",
  },
});
