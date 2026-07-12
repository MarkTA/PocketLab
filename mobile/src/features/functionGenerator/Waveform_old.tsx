import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { Text } from "react-native-paper";
import type { Waveform } from "../../types/pocketLab";
import { pocketLabColors } from "../../themes/theme";

type Props = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  outputEnabled: boolean;
};

const CHART_HEIGHT = 220;
const CHART_WIDTH = 320;

export function WaveformPreview({
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  outputEnabled,
}: Props) {
  const periodMs = (1 / frequencyHz) * 1000;

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

      const voltage = outputEnabled ? offsetV + halfAmp * norm : 0;

      return {
        value: voltage,
        label:
          i === 0
            ? "0"
            : i === Math.floor((points - 1) / 2)
              ? "T"
              : i === points - 1
                ? "2T"
                : "",
      };
    });
  }, [waveform, frequencyHz, amplitudeVpp, offsetV, outputEnabled]);

  const halfAmp = amplitudeVpp / 2;
  const vHigh = offsetV + halfAmp;
  const vLow = offsetV - halfAmp;
  const absMax = Math.max(Math.abs(vHigh), Math.abs(vLow), 1);
  const yLimit = Math.ceil(absMax * 2) / 2;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text variant="titleLarge">Waveform Preview</Text>
        <Text variant="bodyMedium" style={styles.subtle}>
          v(t) vs time
        </Text>
      </View>

      <View style={styles.chartBox}>
        <Text style={styles.yAxisLabel}>V</Text>

        <LineChart
          data={data}
          height={CHART_HEIGHT}
          width={CHART_WIDTH}
          areaChart={false}
          curved={waveform === "sine"}
          color={outputEnabled ? pocketLabColors.darkTeal : "#999"}
          thickness={2}
          hideDataPoints
          noOfSections={4}
          noOfSectionsBelowXAxis={4}
          maxValue={yLimit}
          mostNegativeValue={-yLimit}
          yAxisLabelSuffix=" V"
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          xAxisColor="#222"
          yAxisColor="#222"
          rulesType="dashed"
          rulesColor="#d9d9d9"
          verticalLinesColor="#d9d9d9"
          showVerticalLines
          initialSpacing={8}
          endSpacing={8}
          spacing={CHART_WIDTH / (data.length - 1)}
          backgroundColor="#fff"
        />

        <Text style={styles.xAxisLabel}>Time · T = {formatPeriod(periodMs)}</Text>
      </View>

      <View style={styles.captionRow}>
        <Text style={styles.caption}>f = {formatFrequency(frequencyHz)}</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.caption}>T = {formatPeriod(periodMs)}</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.caption}>{amplitudeVpp.toFixed(2)} Vpp</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.caption}>offset {formatSigned(offsetV)} V</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.caption}>
          Output:{" "}
          <Text style={outputEnabled ? styles.onText : styles.offText}>
            {outputEnabled ? "ON" : "OFF"}
          </Text>
        </Text>
      </View>
    </View>
  );
}

function formatFrequency(hz: number) {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(3)} MHz`;
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(3)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

function formatPeriod(periodMs: number) {
  if (periodMs < 1) return `${(periodMs * 1000).toFixed(2)} µs`;
  if (periodMs >= 1000) return `${(periodMs / 1000).toFixed(3)} s`;
  return `${periodMs.toFixed(3)} ms`;
}

function formatSigned(v: number) {
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    gap: 10,
    shadowColor: "#000",
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
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingTop: 12,
    paddingRight: 8,
    paddingBottom: 6,
  },
  yAxisLabel: {
    color: "#0787d8",
    fontWeight: "700",
    marginLeft: 10,
  },
  xAxisLabel: {
    alignSelf: "flex-end",
    color: "#0787d8",
    fontWeight: "600",
    marginRight: 12,
  },
  axisText: {
    color: "#222",
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
    color: "#222",
  },
  dot: {
    color: "#0787d8",
    fontWeight: "700",
  },
  onText: {
    color: "#0a8f2a",
    fontWeight: "700",
  },
  offText: {
    color: "#777",
    fontWeight: "700",
  },
});
