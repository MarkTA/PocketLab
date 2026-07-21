/* src/features/functionGenerator/WaveformPreview.tsx */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { ClipPath, Defs, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { pocketLabColors } from "@/themes/theme";
import type { Waveform } from "../../types/pocketLab";

type Props = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  matchesDeviceSettings: boolean;
  chartHeight?: number;
};

type Point = {
  x: number;
  y: number;
};

type Viewport = {
  horizontalZoom: number;
  verticalZoom: number;
  horizontalPan: number;
  verticalPan: number;
};

type TouchGesture =
  | {
      kind: "pan";
      x: number;
      y: number;
      viewport: Viewport;
    }
  | {
      kind: "pinch";
      axis: "horizontal" | "vertical";
      distance: number;
      viewport: Viewport;
    };

const DEFAULT_VIEWPORT: Viewport = {
  horizontalZoom: 1,
  verticalZoom: 1,
  horizontalPan: 0,
  verticalPan: 0,
};

const SCREEN_HORIZONTAL_PADDING = 16;
const CARD_HORIZONTAL_PADDING = 16;
const DEFAULT_CHART_HEIGHT = 240;
const LEFT_MARGIN = 58;
const RIGHT_MARGIN = 16;
const TOP_MARGIN = 18;
const BOTTOM_MARGIN = 42;
const X_TICK_COUNT = 5;
const Y_TICK_COUNT = 5;
const SAMPLE_COUNT = 480;
const DECADE_ANIMATION_MS = 220;

export function WaveformPreview({
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  matchesDeviceSettings,
  chartHeight = DEFAULT_CHART_HEIGHT,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const clipId = `waveform-clip-${useId().replace(/:/g, "")}`;
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const viewportRef = useRef(DEFAULT_VIEWPORT);
  const touchGesture = useRef<TouchGesture | null>(null);
  const lastTapTime = useRef(0);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const chartWidth = Math.max(
    0,
    windowWidth - SCREEN_HORIZONTAL_PADDING * 2 - CARD_HORIZONTAL_PADDING * 2
  );
  const plotWidth = Math.max(1, chartWidth - LEFT_MARGIN - RIGHT_MARGIN);
  const plotHeight = Math.max(1, chartHeight - TOP_MARGIN - BOTTOM_MARGIN);

  const safeFrequencyHz =
    Number.isFinite(frequencyHz) && frequencyHz > 0 ? frequencyHz : 1;
  const safeAmplitudeVpp =
    Number.isFinite(amplitudeVpp) && amplitudeVpp >= 0 ? amplitudeVpp : 0;
  const safeOffsetV = Number.isFinite(offsetV) ? offsetV : 0;

  // Each decade uses a fixed automatic time window. This displays one cycle at
  // 10/100/1k/etc. and progressively adds cycles until the next decade.
  const automaticTimeSpan = useAnimatedNumber(
    getDecadeTimeSpan(safeFrequencyHz),
    DECADE_ANIMATION_MS
  );

  const halfAmplitude = safeAmplitudeVpp / 2;
  const paddingV = Math.max(safeAmplitudeVpp * 0.18, 0.1);
  const baseMinVoltage = safeOffsetV - halfAmplitude - paddingV;
  const baseMaxVoltage = safeOffsetV + halfAmplitude + paddingV;

  const totalTimeSec = automaticTimeSpan / viewport.horizontalZoom;
  const startTimeSec =
    (automaticTimeSpan - totalTimeSec) / 2 + viewport.horizontalPan * totalTimeSec;

  const baseVoltageSpan = baseMaxVoltage - baseMinVoltage;
  const voltageSpan = baseVoltageSpan / viewport.verticalZoom;
  const voltageCenter = safeOffsetV + viewport.verticalPan * voltageSpan;
  const minVoltage = voltageCenter - voltageSpan / 2;
  const maxVoltage = voltageCenter + voltageSpan / 2;

  const yForVoltage = (voltage: number) =>
    TOP_MARGIN + ((maxVoltage - voltage) / (maxVoltage - minVoltage)) * plotHeight;

  const waveformPath = useMemo(() => {
    const points: Point[] = Array.from({ length: SAMPLE_COUNT + 1 }, (_, index) => {
      const progress = index / SAMPLE_COUNT;
      const timeSec = startTimeSec + progress * totalTimeSec;
      const cycles = timeSec * safeFrequencyHz;
      const phase = ((cycles % 1) + 1) % 1;
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

      return {
        x: LEFT_MARGIN + progress * plotWidth,
        y: yForVoltage(safeOffsetV + halfAmplitude * normalized),
      };
    });

    return waveform === "square" ? buildStepPath(points) : buildLinearPath(points);
  }, [
    halfAmplitude,
    maxVoltage,
    minVoltage,
    plotHeight,
    plotWidth,
    safeFrequencyHz,
    safeOffsetV,
    startTimeSec,
    totalTimeSec,
    waveform,
  ]);

  const xTicks = useMemo(
    () =>
      Array.from({ length: X_TICK_COUNT }, (_, index) => {
        const progress = index / (X_TICK_COUNT - 1);
        const timeSec = startTimeSec + progress * totalTimeSec;

        return {
          x: LEFT_MARGIN + progress * plotWidth,
          label: formatTime(timeSec),
        };
      }),
    [plotWidth, startTimeSec, totalTimeSec]
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
    [maxVoltage, minVoltage, plotHeight]
  );

  const beginTouch = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;

    if (touches.length >= 2) {
      const first = touches[0];
      const second = touches[1];
      const dx = second.pageX - first.pageX;
      const dy = second.pageY - first.pageY;
      const axis = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";

      touchGesture.current = {
        kind: "pinch",
        axis,
        distance: Math.max(1, axis === "horizontal" ? Math.abs(dx) : Math.abs(dy)),
        viewport: viewportRef.current,
      };
      return;
    }

    if (touches.length === 1) {
      const now = Date.now();

      if (now - lastTapTime.current < 280) {
        setViewport(DEFAULT_VIEWPORT);
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
      }

      touchGesture.current = {
        kind: "pan",
        x: touches[0].pageX,
        y: touches[0].pageY,
        viewport: viewportRef.current,
      };
    }
  };

  const moveTouch = (event: GestureResponderEvent) => {
    const gesture = touchGesture.current;
    const touches = event.nativeEvent.touches;

    if (!gesture) {
      return;
    }

    if (gesture.kind === "pinch" && touches.length >= 2) {
      const first = touches[0];
      const second = touches[1];
      const distance =
        gesture.axis === "horizontal"
          ? Math.abs(second.pageX - first.pageX)
          : Math.abs(second.pageY - first.pageY);
      const scale = Math.max(0.01, distance) / gesture.distance;

      setViewport({
        ...gesture.viewport,
        horizontalZoom:
          gesture.axis === "horizontal"
            ? clamp(gesture.viewport.horizontalZoom * scale, 1, 50)
            : gesture.viewport.horizontalZoom,
        verticalZoom:
          gesture.axis === "vertical"
            ? clamp(gesture.viewport.verticalZoom * scale, 1, 50)
            : gesture.viewport.verticalZoom,
      });
      return;
    }

    if (gesture.kind === "pan" && touches.length === 1) {
      setViewport({
        ...gesture.viewport,
        horizontalPan: clamp(
          gesture.viewport.horizontalPan - (touches[0].pageX - gesture.x) / plotWidth,
          -10,
          10
        ),
        verticalPan: clamp(
          gesture.viewport.verticalPan + (touches[0].pageY - gesture.y) / plotHeight,
          -10,
          10
        ),
      });
    }
  };

  const signalColor = matchesDeviceSettings
    ? pocketLabColors.orange
    : pocketLabColors.darkTeal;
  const zeroLineVisible = minVoltage <= 0 && maxVoltage >= 0;
  const zeroLineY = yForVoltage(0);

  return (
    <View
      accessible
      accessibilityLabel="Interactive waveform plot"
      accessibilityHint="Pinch horizontally for time, pinch vertically for voltage, drag to pan, or double tap to reset"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={beginTouch}
      onResponderMove={moveTouch}
      onResponderRelease={() => {
        touchGesture.current = null;
      }}
      onResponderTerminate={() => {
        touchGesture.current = null;
      }}
      style={styles.container}
    >
      <Svg width={chartWidth} height={chartHeight} pointerEvents="none">
        <Defs>
          <ClipPath id={clipId}>
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
          clipPath={`url(#${clipId})`}
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
          y={chartHeight - 6}
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

function useAnimatedNumber(target: number, durationMs: number): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    const startValue = valueRef.current;

    if (startValue === target) {
      return;
    }

    const startTime = Date.now();
    let frame = 0;

    const animate = () => {
      const progress = clamp((Date.now() - startTime) / durationMs, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      const nextValue = startValue + (target - startValue) * eased;

      valueRef.current = nextValue;
      setValue(nextValue);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [durationMs, target]);

  return value;
}

function getDecadeTimeSpan(frequencyHz: number): number {
  const decade = 10 ** Math.floor(Math.log10(Math.max(1, frequencyHz)));
  return 1 / decade;
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
  return voltage.toFixed(Math.abs(voltage) >= 10 ? 1 : 2);
}

function formatTime(seconds: number): string {
  if (Math.abs(seconds) < 1e-12) {
    return "0";
  }

  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);

  if (absolute < 1e-6) {
    return `${sign}${trimZeros((absolute * 1e9).toFixed(1))} ns`;
  }
  if (absolute < 1e-3) {
    return `${sign}${trimZeros((absolute * 1e6).toFixed(1))} µs`;
  }
  if (absolute < 1) {
    return `${sign}${trimZeros((absolute * 1e3).toFixed(1))} ms`;
  }

  return `${sign}${trimZeros(absolute.toFixed(2))} s`;
}

function trimZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: pocketLabColors.surface,
  },
});
