/* src/features/dmm/components/VoltageTimeGraph.tsx */

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { pocketLabColors } from "../../../themes/theme";
import type { DmmSample } from "../hooks/useContinuousDmm";
import { prepareVoltageSeries } from "../graph/voltageGraphUtils";

const WINDOW_MS = 30_000;
const WIDTH = 360;
const HEIGHT = 218;
const LEFT = 60;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 35;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

const TIME_TICKS_SECONDS = [-30, -20, -10, 0] as const;
const Y_DIVISIONS = 4;

type Props = {
  samples: readonly DmmSample[];
  paused: boolean;
};

function formatReading(volts: number): string {
  return `${volts.toFixed(5)} V`;
}

function formatPeakToPeak(volts: number): string {
  if (volts < 0.001) return `${(volts * 1_000_000).toFixed(1)} µV`;
  if (volts < 1) return `${(volts * 1_000).toFixed(3)} mV`;
  return `${volts.toFixed(5)} V`;
}

function formatAxisVoltage(volts: number, span: number): string {
  if (span < 0.02) return volts.toFixed(4);
  if (span < 0.2) return volts.toFixed(3);
  if (span < 2) return volts.toFixed(2);
  if (span < 20) return volts.toFixed(1);
  return volts.toFixed(0);
}

/** Simple SVG line plot. No new charting or native dependencies are needed. */
export function VoltageTimeGraph({ samples, paused }: Props) {
  // Anchor the scrolling window to the most recent measurement timestamp.
  // This avoids advancing time during render and freezes naturally on pause.
  const windowEndMs = samples.length > 0 ? samples[samples.length - 1].timestamp : 0;

  const { points, yMin, yMax, statistics } = useMemo(
    () => prepareVoltageSeries(samples, windowEndMs, WINDOW_MS),
    [samples, windowEndMs]
  );

  const ySpan = yMax - yMin;
  const xOf = (timestamp: number) =>
    LEFT + ((timestamp - (windowEndMs - WINDOW_MS)) / WINDOW_MS) * PLOT_WIDTH;
  const yOf = (value: number) => TOP + ((yMax - value) / ySpan) * PLOT_HEIGHT;
  // Start a new segment after long BLE gaps rather than drawing a misleading
  // straight line across a period when no measurements were available.
  const path = points
    .map((point, index) => {
      const gap = index > 0 ? point.timestamp - points[index - 1].timestamp : 0;
      const command = index === 0 || gap > 2_000 ? "M" : "L";
      return `${command}${xOf(point.timestamp).toFixed(2)},${yOf(point.value).toFixed(2)}`;
    })
    .join(" ");
  const last = points.length ? points[points.length - 1] : null;

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleSmall" style={styles.headingText}>
          Voltage vs. time
        </Text>
        <Text variant="bodySmall" style={styles.caption}>
          {paused ? "Paused" : "Live"} · Last 30 s · {points.length} samples
        </Text>
      </View>

      <Svg
        width="100%"
        height={218}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessibilityLabel="Voltage versus time graph, most recent 30 seconds"
      >
        {Array.from({ length: Y_DIVISIONS + 1 }, (_, index) => {
          const fraction = index / Y_DIVISIONS;
          const y = TOP + fraction * PLOT_HEIGHT;
          const value = yMax - fraction * ySpan;
          return (
            <ViewGridRow
              key={`y-${index}`}
              y={y}
              label={formatAxisVoltage(value, ySpan)}
            />
          );
        })}

        {TIME_TICKS_SECONDS.map((seconds) => {
          const x = LEFT + ((seconds + 30) / 30) * PLOT_WIDTH;
          return (
            <LineAndLabel key={seconds} x={x} label={`${seconds}s`} />
          );
        })}

        {points.length >= 2 ? (
          <Path d={path} fill="none" stroke={pocketLabColors.darkTeal} strokeWidth={2.5} />
        ) : null}
        {last ? (
          <Circle cx={xOf(last.timestamp)} cy={yOf(last.value)} r={3.5} fill={pocketLabColors.darkTeal} />
        ) : null}
      </Svg>

      {points.length === 0 ? (
        <Text variant="bodySmall" style={styles.emptyText}>
          Waiting for voltage measurements…
        </Text>
      ) : null}
      <Text variant="bodySmall" style={styles.axisCaption}>
        Voltage (V) · Time (seconds)
      </Text>

      {statistics ? (
        <View style={styles.statistics}>
          <Statistic label="Min" value={formatReading(statistics.minimum)} />
          <Statistic label="Max" value={formatReading(statistics.maximum)} />
          <Statistic label="Avg" value={formatReading(statistics.average)} />
          <Statistic
            label="Peak-to-peak"
            value={statistics.count >= 2 ? formatPeakToPeak(statistics.peakToPeak) : "—"}
          />
        </View>
      ) : null}
    </View>
  );
}

function Statistic({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text variant="labelSmall" style={styles.statLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

function ViewGridRow({ y, label }: { y: number; label: string }) {
  return (
    <>
      <Line
        x1={LEFT}
        x2={WIDTH - RIGHT}
        y1={y}
        y2={y}
        stroke={pocketLabColors.grid}
        strokeWidth={1}
      />
      <SvgText
        x={LEFT - 8}
        y={y + 4}
        fontSize={11}
        fill={pocketLabColors.mutedText}
        textAnchor="end"
      >
        {label}
      </SvgText>
    </>
  );
}

function LineAndLabel({ x, label }: { x: number; label: string }) {
  return (
    <>
      <Line
        x1={x}
        x2={x}
        y1={TOP}
        y2={TOP + PLOT_HEIGHT}
        stroke={pocketLabColors.grid}
        strokeWidth={1}
      />
      <SvgText
        x={x}
        y={HEIGHT - 12}
        fontSize={11}
        fill={pocketLabColors.mutedText}
        textAnchor="middle"
      >
        {label}
      </SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pocketLabColors.grid,
    backgroundColor: pocketLabColors.surface,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
  },
  headingText: { color: pocketLabColors.text },
  caption: { color: pocketLabColors.mutedText },
  axisCaption: { color: pocketLabColors.mutedText, textAlign: "center", marginTop: -2 },
  emptyText: { textAlign: "center", color: pocketLabColors.mutedText, marginVertical: 6 },
  statistics: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: pocketLabColors.grid,
    marginTop: 12,
    paddingTop: 10,
  },
  statCell: {
    width: "50%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  statLabel: { color: pocketLabColors.mutedText },
  statValue: { color: pocketLabColors.text, fontWeight: "600" },
});
