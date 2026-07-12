/* src/features/functionGenerator/WaveformPreview.tsx */

import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { ClipPath, Defs, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import type { Waveform } from "../../types/pocketLab";
import { pocketLabColors } from "@/themes/theme";

type Props = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  outputEnabled: boolean;
};

type Point = {
  x: number;
  y: number;
};

const SCREEN_HORIZONTAL_PADDING = 16;
const CARD_HORIZONTAL_PADDING = 16;

const CHART_HEIGHT = 240;
const LEFT_MARGIN = 58;
const RIGHT_MARGIN = 16;
const TOP_MARGIN = 18;
const BOTTOM_MARGIN = 42;

const X_TICK_COUNT = 5;
const Y_TICK_COUNT = 5;
const SAMPLE_COUNT = 160;
const CYCLE_COUNT = 2;

export function WaveformPreview({
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  outputEnabled,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();

  const chartWidth = Math.max(
    0,
    windowWidth - SCREEN_HORIZONTAL_PADDING * 2 - CARD_HORIZONTAL_PADDING * 2
  );

  const plotWidth = chartWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const plotHeight = CHART_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;

  const safeFrequencyHz =
    Number.isFinite(frequencyHz) && frequencyHz > 0 ? frequencyHz : 1;

  const safeAmplitudeVpp =
    Number.isFinite(amplitudeVpp) && amplitudeVpp >= 0 ? amplitudeVpp : 0;

  const safeOffsetV = Number.isFinite(offsetV) ? offsetV : 0;

  const halfAmplitude = safeAmplitudeVpp / 2;
  const paddingV = Math.max(safeAmplitudeVpp * 0.18, 0.1);

  const minVoltage = safeOffsetV - halfAmplitude - paddingV;
  const maxVoltage = safeOffsetV + halfAmplitude + paddingV;

  const totalTimeSec = CYCLE_COUNT / safeFrequencyHz;

  const xForTime = (timeSec: number) =>
    LEFT_MARGIN + (timeSec / totalTimeSec) * plotWidth;

  const yForVoltage = (voltage: number) =>
    TOP_MARGIN + ((maxVoltage - voltage) / (maxVoltage - minVoltage)) * plotHeight;

  const waveformPath = useMemo(() => {
    const points: Point[] = Array.from({ length: SAMPLE_COUNT + 1 }, (_, index) => {
      const progress = index / SAMPLE_COUNT;
      const cycles = progress * CYCLE_COUNT;
      const phase = cycles % 1;

      let normalized = 0;

      switch (waveform) {
        case "sine":
          normalized = Math.sin(2 * Math.PI * cycles);
          break;

        case "square":
          normalized = phase < 0.5 ? 1 : -1;
          break;

        case "triangle":
          normalized = 1 - 4 * Math.abs(phase - 0.5);
          break;

        case "rampUp":
          normalized = 2 * phase - 1;
          break;

        case "rampDown":
          normalized = 1 - 2 * phase;
          break;

        case "dc":
          normalized = 0;
          break;
      }

      const voltage = safeOffsetV + halfAmplitude * normalized;

      return {
        x: LEFT_MARGIN + progress * plotWidth,
        y: yForVoltage(voltage),
      };
    });

    if (waveform === "square") {
      return buildStepPath(points);
    }

    return buildLinearPath(points);
  }, [waveform, safeOffsetV, halfAmplitude, plotWidth, minVoltage, maxVoltage]);

  const xTicks = useMemo(
    () =>
      Array.from({ length: X_TICK_COUNT }, (_, index) => {
        const progress = index / (X_TICK_COUNT - 1);
        const timeSec = progress * totalTimeSec;

        return {
          x: LEFT_MARGIN + progress * plotWidth,
          label: formatTime(timeSec),
        };
      }),
    [plotWidth, totalTimeSec]
  );

  const yTicks = useMemo(
    () =>
      Array.from({ length: Y_TICK_COUNT }, (_, index) => {
        const progress = index / (Y_TICK_COUNT - 1);

        const voltage = maxVoltage - progress * (maxVoltage - minVoltage);

        return {
          y: TOP_MARGIN + progress * plotHeight,
          label: formatVoltage(voltage),
        };
      }),
    [minVoltage, maxVoltage, plotHeight]
  );

  const signalColor = outputEnabled ? pocketLabColors.orange : pocketLabColors.darkTeal;

  const zeroLineVisible = minVoltage <= 0 && maxVoltage >= 0;

  const zeroLineY = yForVoltage(0);

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        <Defs>
          <ClipPath id="waveform-clip">
            <Rect x={LEFT_MARGIN} y={TOP_MARGIN} width={plotWidth} height={plotHeight} />
          </ClipPath>
        </Defs>

        <Rect
          x={LEFT_MARGIN}
          y={TOP_MARGIN}
          width={plotWidth}
          height={plotHeight}
          fill={pocketLabColors.surface}
        />

        {yTicks.map((tick, index) => (
          <React.Fragment key={`y-${index}`}>
            <Line
              x1={LEFT_MARGIN}
              y1={tick.y}
              x2={LEFT_MARGIN + plotWidth}
              y2={tick.y}
              stroke={pocketLabColors.grid}
              strokeWidth={1}
              strokeDasharray="4 6"
            />

            <SvgText
              x={LEFT_MARGIN - 8}
              y={tick.y + 4}
              textAnchor="end"
              fontSize={11}
              fill={pocketLabColors.mutedText}
            >
              {tick.label}
            </SvgText>
          </React.Fragment>
        ))}

        {xTicks.map((tick, index) => (
          <React.Fragment key={`x-${index}`}>
            <Line
              x1={tick.x}
              y1={TOP_MARGIN}
              x2={tick.x}
              y2={TOP_MARGIN + plotHeight}
              stroke={pocketLabColors.grid}
              strokeWidth={1}
              strokeDasharray="4 6"
            />

            <SvgText
              x={tick.x}
              y={TOP_MARGIN + plotHeight + 22}
              textAnchor={
                index === 0 ? "start" : index === X_TICK_COUNT - 1 ? "end" : "middle"
              }
              fontSize={11}
              fill={pocketLabColors.mutedText}
            >
              {tick.label}
            </SvgText>
          </React.Fragment>
        ))}

        {zeroLineVisible ? (
          <Line
            x1={LEFT_MARGIN}
            y1={zeroLineY}
            x2={LEFT_MARGIN + plotWidth}
            y2={zeroLineY}
            stroke={pocketLabColors.mutedText}
            strokeWidth={1.25}
          />
        ) : null}

        <Line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN}
          x2={LEFT_MARGIN}
          y2={TOP_MARGIN + plotHeight}
          stroke={pocketLabColors.mutedText}
          strokeWidth={1.25}
        />

        <Line
          x1={LEFT_MARGIN}
          y1={TOP_MARGIN + plotHeight}
          x2={LEFT_MARGIN + plotWidth}
          y2={TOP_MARGIN + plotHeight}
          stroke={pocketLabColors.mutedText}
          strokeWidth={1.25}
        />

        <Path
          d={waveformPath}
          fill="none"
          stroke={signalColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#waveform-clip)"
        />

        <SvgText
          x={14}
          y={TOP_MARGIN + 4}
          fontSize={12}
          fontWeight="700"
          fill={pocketLabColors.mutedText}
        >
          V
        </SvgText>

        <SvgText
          x={LEFT_MARGIN + plotWidth}
          y={CHART_HEIGHT - 6}
          textAnchor="end"
          fontSize={12}
          fontWeight="700"
          fill={pocketLabColors.mutedText}
        >
          Time
        </SvgText>
      </Svg>
    </View>
  );
}

function buildLinearPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
}

function buildStepPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    commands.push(`L ${current.x.toFixed(2)} ${previous.y.toFixed(2)}`);

    if (current.y !== previous.y) {
      commands.push(`L ${current.x.toFixed(2)} ${current.y.toFixed(2)}`);
    }
  }

  return commands.join(" ");
}

function formatVoltage(voltage: number): string {
  const absolute = Math.abs(voltage);

  if (absolute >= 10) {
    return voltage.toFixed(1);
  }

  if (absolute >= 1) {
    return voltage.toFixed(2);
  }

  return voltage.toFixed(2);
}

function formatTime(seconds: number): string {
  if (seconds === 0) {
    return "0";
  }

  if (seconds < 1e-6) {
    return `${trimZeros((seconds * 1e9).toFixed(1))} ns`;
  }

  if (seconds < 1e-3) {
    return `${trimZeros((seconds * 1e6).toFixed(1))} µs`;
  }

  if (seconds < 1) {
    return `${trimZeros((seconds * 1e3).toFixed(1))} ms`;
  }

  return `${trimZeros(seconds.toFixed(2))} s`;
}

function trimZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: pocketLabColors.surface,
  },
});
