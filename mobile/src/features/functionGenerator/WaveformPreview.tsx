/* src/features/functionGenerator/WaveformPreview.tsx */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

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

type RightSignalTickProps = {
  y: number;
  voltage: number;
  label: "max" | "center" | "min";
  color: string;
  plotRight: number;
};

const DEFAULT_CHART_HEIGHT = 240;
const LEFT_MARGIN = 58;
const RIGHT_MARGIN = 64;
const TOP_MARGIN = 18;
const BOTTOM_MARGIN = 42;
const SAMPLE_COUNT = 480;
const DECADE_ANIMATION_MS = 220;
const MAX_INTERIOR_X_TICKS = 3;
const MAX_INTERIOR_Y_TICKS = 3;
const X_TICK_EDGE_INSET = 2;
const Y_TICK_EDGE_INSET = 2;
// One quarter of a 1 MHz period: 0.25 us = 250 ns.
const MIN_TIME_SPAN_SEC = 0.00000025;
const MIN_VOLTAGE_SPAN = 0.05;
const MIN_VOLTAGE_LIMIT = -5;
const MAX_VOLTAGE_LIMIT = 5;
const DOUBLE_TAP_DELAY_MS = 300;
const TAP_MOVEMENT_TOLERANCE_PX = 10;

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

  const chartWidth = Math.max(0, windowWidth);
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

  const maximumTimeSpan = 10 / safeFrequencyHz;
  const minimumTimeSpan = Math.min(MIN_TIME_SPAN_SEC, maximumTimeSpan);
  const [manualTimeSpan, setManualTimeSpan] = useState<number | null>(null);
  const [startTimeSec, setStartTimeSec] = useState(0);
  const timeSpanRef = useRef(automaticTimeSpan);
  const pinchStartRef = useRef<{ distance: number; timeSpan: number } | null>(null);

  const resolvedTimeSpan = clamp(
    manualTimeSpan ?? automaticTimeSpan,
    minimumTimeSpan,
    maximumTimeSpan
  );
  timeSpanRef.current = resolvedTimeSpan;

  useEffect(() => {
    setManualTimeSpan((current) =>
      current === null ? null : clamp(current, minimumTimeSpan, maximumTimeSpan)
    );
  }, [maximumTimeSpan, minimumTimeSpan]);

  const xAxisPinchResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onPanResponderGrant: (event) => {
          beginHorizontalPinch(event, timeSpanRef.current, pinchStartRef);
        },
        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches;
          const start = pinchStartRef.current;

          if (touches.length !== 2 || start === null) {
            return;
          }

          const distance = horizontalTouchDistance(event);
          if (distance < 1) {
            return;
          }

          setManualTimeSpan(
            clamp(
              start.timeSpan * (start.distance / distance),
              minimumTimeSpan,
              maximumTimeSpan
            )
          );
        },
        onPanResponderRelease: () => {
          pinchStartRef.current = null;
        },
        onPanResponderTerminate: () => {
          pinchStartRef.current = null;
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [maximumTimeSpan, minimumTimeSpan]
  );

  const halfAmplitude = safeAmplitudeVpp / 2;
  const paddingV = Math.max(safeAmplitudeVpp * 0.18, 0.1);
  const baseMinVoltage = safeOffsetV - halfAmplitude - paddingV;
  const baseMaxVoltage = safeOffsetV + halfAmplitude + paddingV;

  const automaticVoltageSpan = clamp(
    baseMaxVoltage - baseMinVoltage,
    MIN_VOLTAGE_SPAN,
    MAX_VOLTAGE_LIMIT - MIN_VOLTAGE_LIMIT
  );
  const [manualVoltageSpan, setManualVoltageSpan] = useState<number | null>(null);
  const [manualVoltageCenter, setManualVoltageCenter] = useState<number | null>(null);
  const voltageSpanRef = useRef(automaticVoltageSpan);
  const verticalPinchStartRef = useRef<{
    distance: number;
    voltageSpan: number;
  } | null>(null);

  const resolvedVoltageSpan = clamp(
    manualVoltageSpan ?? automaticVoltageSpan,
    MIN_VOLTAGE_SPAN,
    MAX_VOLTAGE_LIMIT - MIN_VOLTAGE_LIMIT
  );
  voltageSpanRef.current = resolvedVoltageSpan;

  const yAxisPinchResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 2,
        onPanResponderGrant: (event) => {
          beginVerticalPinch(event, voltageSpanRef.current, verticalPinchStartRef);
        },
        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches;
          const start = verticalPinchStartRef.current;

          if (touches.length !== 2 || start === null) {
            return;
          }

          const distance = verticalTouchDistance(event);
          if (distance < 1) {
            return;
          }

          setManualVoltageSpan(
            clamp(
              start.voltageSpan * (start.distance / distance),
              MIN_VOLTAGE_SPAN,
              MAX_VOLTAGE_LIMIT - MIN_VOLTAGE_LIMIT
            )
          );
        },
        onPanResponderRelease: () => {
          verticalPinchStartRef.current = null;
        },
        onPanResponderTerminate: () => {
          verticalPinchStartRef.current = null;
        },
        onShouldBlockNativeResponder: () => true,
      }),
    []
  );

  // Both side bands operate the same voltage viewport. Keeping a single
  // responder prevents the left and right controls from drifting apart.
  const rightYAxisPinchResponder = yAxisPinchResponder;

  const totalTimeSec = resolvedTimeSpan;
  const voltageCenter = manualVoltageCenter ?? safeOffsetV;
  const startTimeRef = useRef(startTimeSec);
  const voltageCenterRef = useRef(voltageCenter);
  startTimeRef.current = startTimeSec;
  voltageCenterRef.current = voltageCenter;

  const voltageDomain = getBoundedVoltageDomain(
    voltageCenter,
    resolvedVoltageSpan,
    MIN_VOLTAGE_LIMIT,
    MAX_VOLTAGE_LIMIT
  );
  const minVoltage = voltageDomain.minimum;
  const maxVoltage = voltageDomain.maximum;

  const panStartRef = useRef<{
    startTimeSec: number;
    voltageCenter: number;
  } | null>(null);
  const lastTapTimeRef = useRef(0);

  const resetViewport = () => {
    panStartRef.current = null;
    lastTapTimeRef.current = 0;
    setManualTimeSpan(null);
    setStartTimeSec(0);
    setManualVoltageSpan(null);
    setManualVoltageCenter(null);
  };

  const plotPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length === 1,
        onMoveShouldSetPanResponder: (event, gestureState) =>
          event.nativeEvent.touches.length === 1 &&
          (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: () => {
          panStartRef.current = {
            startTimeSec: startTimeRef.current,
            voltageCenter: voltageCenterRef.current,
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const start = panStartRef.current;
          if (event.nativeEvent.touches.length !== 1 || start === null) {
            return;
          }

          setStartTimeSec(
            start.startTimeSec - (gestureState.dx / plotWidth) * resolvedTimeSpan
          );

          const halfSpan = resolvedVoltageSpan / 2;
          setManualVoltageCenter(
            clamp(
              start.voltageCenter + (gestureState.dy / plotHeight) * resolvedVoltageSpan,
              MIN_VOLTAGE_LIMIT + halfSpan,
              MAX_VOLTAGE_LIMIT - halfSpan
            )
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          panStartRef.current = null;

          const moved =
            Math.hypot(gestureState.dx, gestureState.dy) > TAP_MOVEMENT_TOLERANCE_PX;
          if (moved) {
            lastTapTimeRef.current = 0;
            return;
          }

          const now = Date.now();
          if (now - lastTapTimeRef.current <= DOUBLE_TAP_DELAY_MS) {
            resetViewport();
          } else {
            lastTapTimeRef.current = now;
          }
        },
        onPanResponderTerminate: () => {
          panStartRef.current = null;
          lastTapTimeRef.current = 0;
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [plotHeight, plotWidth, resolvedTimeSpan, resolvedVoltageSpan]
  );

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
      buildWaveLandmarkTicks(
        startTimeSec,
        startTimeSec + totalTimeSec,
        safeFrequencyHz,
        plotWidth
      ),
    [plotWidth, safeFrequencyHz, startTimeSec, totalTimeSec]
  );

  const yTicks = useMemo(
    () => buildVoltageTicks(minVoltage, maxVoltage, plotHeight),
    [maxVoltage, minVoltage, plotHeight]
  );

  const signalMinimum = safeOffsetV - halfAmplitude;
  const signalMaximum = safeOffsetV + halfAmplitude;
  const signalCenterY = yForVoltage(safeOffsetV);
  const signalMinimumY = yForVoltage(signalMinimum);
  const signalMaximumY = yForVoltage(signalMaximum);

  const signalColor = matchesDeviceSettings
    ? pocketLabColors.orange
    : pocketLabColors.darkTeal;
  const zeroLineVisible = minVoltage <= 0 && maxVoltage >= 0;
  const zeroLineY = yForVoltage(0);

  return (
    <View accessible accessibilityLabel="Waveform preview" style={styles.container}>
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

        {yTicks.interior.map((tick) => (
          <React.Fragment key={tick.key}>
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

        {yTicks.edges.map((tick) => (
          <React.Fragment key={tick.key}>
            <Line
              x1={LEFT_MARGIN - 5}
              y1={tick.y}
              x2={LEFT_MARGIN}
              y2={tick.y}
              stroke={pocketLabColors.mutedText}
              strokeWidth={1.25}
            />
            <SvgText
              x={LEFT_MARGIN - 8}
              y={tick.labelY}
              textAnchor="end"
              fontSize={11}
              fill={pocketLabColors.mutedText}
            >
              {tick.label}
            </SvgText>
          </React.Fragment>
        ))}

        {xTicks.map((tick) => (
          <React.Fragment key={tick.key}>
            <Line
              x1={tick.x}
              y1={TOP_MARGIN}
              x2={tick.x}
              y2={TOP_MARGIN + plotHeight}
              stroke={pocketLabColors.grid}
              strokeWidth={1}
              strokeDasharray="4 6"
            />
            <Line
              x1={tick.x}
              y1={TOP_MARGIN + plotHeight}
              x2={tick.x}
              y2={TOP_MARGIN + plotHeight + 5}
              stroke={pocketLabColors.mutedText}
              strokeWidth={1.25}
            />
            <SvgText
              x={tick.x}
              y={TOP_MARGIN + plotHeight + 22}
              textAnchor={tick.anchor}
              fontSize={11}
              fill={pocketLabColors.mutedText}
            >
              {tick.label}
            </SvgText>
          </React.Fragment>
        ))}

        {[
          { key: "maximum", y: signalMaximumY, color: pocketLabColors.green },
          { key: "center", y: signalCenterY, color: signalColor },
          { key: "minimum", y: signalMinimumY, color: pocketLabColors.orange },
        ].map((guide) => (
          <Line
            key={guide.key}
            x1={LEFT_MARGIN}
            y1={guide.y}
            x2={LEFT_MARGIN + plotWidth}
            y2={guide.y}
            stroke={guide.color}
            strokeWidth={1}
            strokeDasharray="2 5"
            opacity={0.75}
            clipPath={`url(#${clipId})`}
          />
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
          x1={LEFT_MARGIN + plotWidth}
          y1={TOP_MARGIN}
          x2={LEFT_MARGIN + plotWidth}
          y2={TOP_MARGIN + plotHeight}
          stroke={pocketLabColors.mutedText}
          strokeWidth={2}
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

        <RightSignalTick
          y={signalMaximumY}
          voltage={signalMaximum}
          label="max"
          color={pocketLabColors.green}
          plotRight={LEFT_MARGIN + plotWidth}
        />
        {Math.abs(signalMaximum - signalMinimum) >= 1e-9 ? (
          <>
            <RightSignalTick
              y={signalCenterY}
              voltage={safeOffsetV}
              label="center"
              color={signalColor}
              plotRight={LEFT_MARGIN + plotWidth}
            />
            <RightSignalTick
              y={signalMinimumY}
              voltage={signalMinimum}
              label="min"
              color={pocketLabColors.orange}
              plotRight={LEFT_MARGIN + plotWidth}
            />
          </>
        ) : null}

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
      <View
        accessibilityLabel="Drag to move the waveform. Double tap to reset the view."
        accessibilityRole="adjustable"
        style={[
          styles.plotTouchSurface,
          {
            left: LEFT_MARGIN,
            top: TOP_MARGIN,
            width: plotWidth,
            height: plotHeight,
          },
        ]}
        {...plotPanResponder.panHandlers}
      />
      <View
        accessibilityLabel="Pinch to change the time range"
        accessibilityRole="adjustable"
        style={[styles.xAxisTouchStrip, { left: LEFT_MARGIN, right: RIGHT_MARGIN }]}
        {...xAxisPinchResponder.panHandlers}
      />
      <View
        accessibilityLabel="Pinch to change the voltage range"
        accessibilityRole="adjustable"
        style={styles.yAxisTouchStrip}
        {...yAxisPinchResponder.panHandlers}
      />
      <View
        accessibilityLabel="Pinch to change the voltage range"
        accessibilityRole="adjustable"
        style={styles.rightYAxisTouchStrip}
        {...rightYAxisPinchResponder.panHandlers}
      />
    </View>
  );
}

function beginVerticalPinch(
  event: GestureResponderEvent,
  voltageSpan: number,
  pinchStartRef: React.MutableRefObject<{
    distance: number;
    voltageSpan: number;
  } | null>
) {
  if (event.nativeEvent.touches.length !== 2) {
    return;
  }

  const distance = verticalTouchDistance(event);
  if (distance >= 1) {
    pinchStartRef.current = { distance, voltageSpan };
  }
}

function verticalTouchDistance(event: GestureResponderEvent): number {
  const [first, second] = event.nativeEvent.touches;
  return first && second ? Math.abs(second.pageY - first.pageY) : 0;
}

function getBoundedVoltageDomain(
  preferredCenter: number,
  span: number,
  minimumLimit: number,
  maximumLimit: number
): { minimum: number; maximum: number } {
  const boundedSpan = clamp(span, MIN_VOLTAGE_SPAN, maximumLimit - minimumLimit);
  const halfSpan = boundedSpan / 2;
  const center = clamp(preferredCenter, minimumLimit + halfSpan, maximumLimit - halfSpan);

  return {
    minimum: center - halfSpan,
    maximum: center + halfSpan,
  };
}

function beginHorizontalPinch(
  event: GestureResponderEvent,
  timeSpan: number,
  pinchStartRef: React.MutableRefObject<{
    distance: number;
    timeSpan: number;
  } | null>
) {
  if (event.nativeEvent.touches.length !== 2) {
    return;
  }

  const distance = horizontalTouchDistance(event);
  if (distance >= 1) {
    pinchStartRef.current = { distance, timeSpan };
  }
}

function horizontalTouchDistance(event: GestureResponderEvent): number {
  const [first, second] = event.nativeEvent.touches;
  return first && second ? Math.abs(second.pageX - first.pageX) : 0;
}

function RightSignalTick({ y, voltage, label, color, plotRight }: RightSignalTickProps) {
  return (
    <React.Fragment>
      <Line
        x1={plotRight}
        y1={y}
        x2={plotRight + 7}
        y2={y}
        stroke={color}
        strokeWidth={2}
      />
      <Circle cx={plotRight} cy={y} r={3} fill={color} />
      <SvgText
        x={plotRight + 10}
        y={y + 4}
        textAnchor="start"
        fontSize={10}
        fontWeight="700"
        fill={color}
      >
        {`${label} ${formatVoltageExact(voltage)} V`}
      </SvgText>
    </React.Fragment>
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

type YAxisTick = {
  key: string;
  y: number;
  label: string;
};

type YAxisEdgeTick = YAxisTick & {
  labelY: number;
};

function buildVoltageTicks(
  minimum: number,
  maximum: number,
  plotHeight: number
): { edges: YAxisEdgeTick[]; interior: YAxisTick[] } {
  const span = Math.max(Number.EPSILON, maximum - minimum);
  const step = chooseVoltageTickStep(minimum, maximum);
  const allInteriorValues = getStrictInteriorVoltageMultiples(minimum, maximum, step);
  const interiorValues = selectCenteredValues(
    allInteriorValues,
    (minimum + maximum) / 2,
    MAX_INTERIOR_Y_TICKS
  );
  const yForValue = (value: number) =>
    TOP_MARGIN + ((maximum - value) / span) * plotHeight;

  return {
    edges: [
      {
        key: "voltage-maximum",
        y: TOP_MARGIN + Y_TICK_EDGE_INSET,
        labelY: TOP_MARGIN + 11,
        label: formatVoltage(maximum),
      },
      {
        key: "voltage-minimum",
        y: TOP_MARGIN + plotHeight - Y_TICK_EDGE_INSET,
        labelY: TOP_MARGIN + plotHeight - 4,
        label: formatVoltage(minimum),
      },
    ],
    interior: interiorValues.map((voltage) => ({
      key: `voltage-${voltage.toPrecision(12)}`,
      y: yForValue(voltage),
      label: formatVoltage(voltage),
    })),
  };
}

function chooseVoltageTickStep(minimum: number, maximum: number): number {
  const span = Math.max(Number.EPSILON, maximum - minimum);
  const exponent = Math.floor(Math.log10(span));
  const candidates: number[] = [];

  for (let power = exponent - 3; power <= exponent + 1; power += 1) {
    const scale = 10 ** power;
    for (const base of [0.25, 0.5, 1, 1.25, 2.5, 5]) {
      candidates.push(base * scale);
    }
  }

  return candidates
    .filter((step) => step > 0)
    .sort((a, b) => {
      const aCount = getStrictInteriorVoltageMultiples(minimum, maximum, a).length;
      const bCount = getStrictInteriorVoltageMultiples(minimum, maximum, b).length;
      const aScore = voltageTickCountScore(aCount);
      const bScore = voltageTickCountScore(bCount);

      return aScore - bScore || Math.abs(aCount - 3) - Math.abs(bCount - 3) || a - b;
    })[0];
}

function voltageTickCountScore(count: number): number {
  if (count === 3) return 0;
  if (count === 2) return 1;
  if (count > 3) return 2 + (count - 3);
  return 20 + (2 - count);
}

function getStrictInteriorVoltageMultiples(
  minimum: number,
  maximum: number,
  step: number
): number[] {
  const epsilon = step * 1e-7;
  const firstIndex = Math.floor((minimum + epsilon) / step) + 1;
  const lastIndex = Math.ceil((maximum - epsilon) / step) - 1;
  const values: number[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const value = index * step;
    values.push(Math.abs(value) < epsilon ? 0 : value);
  }

  return values;
}

function selectCenteredValues(
  values: number[],
  center: number,
  maximumCount: number
): number[] {
  if (values.length <= maximumCount) {
    return values;
  }

  return [...values]
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
    .slice(0, maximumCount)
    .sort((a, b) => a - b);
}

type XAxisTick = {
  key: string;
  x: number;
  label: string;
  anchor: "start" | "middle" | "end";
};

function buildWaveLandmarkTicks(
  startTimeSec: number,
  endTimeSec: number,
  frequencyHz: number,
  plotWidth: number
): XAxisTick[] {
  const spanSec = Math.max(Number.EPSILON, endTimeSec - startTimeSec);
  const periodSec = 1 / frequencyHz;
  const visibleCycles = spanSec / periodSec;
  let interiorTimes: number[] = [];

  if (visibleCycles <= 1 + 1e-9) {
    // Quarter-cycle landmarks are peak, center crossing, and valley.
    interiorTimes = getStrictInteriorMultiples(
      startTimeSec,
      endTimeSec,
      periodSec / 4
    ).slice(0, MAX_INTERIOR_X_TICKS);
  } else {
    // Prefer wave centers. If those are too dense, progressively use cycle
    // starts, then every 2, 4, 8... cycles.
    const waveCenters = getStrictInteriorSequence(
      startTimeSec,
      endTimeSec,
      periodSec,
      periodSec / 2
    );
    if (waveCenters.length > 0 && waveCenters.length <= MAX_INTERIOR_X_TICKS) {
      interiorTimes = waveCenters;
    }

    const spacings = [periodSec];
    for (let cycleStride = 2; cycleStride <= 2 ** 20; cycleStride *= 2) {
      spacings.push(periodSec * cycleStride);
    }

    for (const spacing of interiorTimes.length === 0 ? spacings : []) {
      const candidates = getStrictInteriorMultiples(startTimeSec, endTimeSec, spacing);
      if (candidates.length > 0 && candidates.length <= MAX_INTERIOR_X_TICKS) {
        interiorTimes = candidates;
        break;
      }
    }
  }

  const interiorTicks: XAxisTick[] = interiorTimes.map((timeSec) => ({
    key: `landmark-${timeSec.toPrecision(12)}`,
    x: LEFT_MARGIN + ((timeSec - startTimeSec) / spanSec) * plotWidth,
    label: formatTime(timeSec),
    anchor: "middle",
  }));

  return [
    {
      key: "viewport-start",
      x: LEFT_MARGIN + X_TICK_EDGE_INSET,
      label: formatTime(startTimeSec),
      anchor: "start",
    },
    ...interiorTicks,
    {
      key: "viewport-end",
      x: LEFT_MARGIN + plotWidth - X_TICK_EDGE_INSET,
      label: formatTime(endTimeSec),
      anchor: "end",
    },
  ];
}

function getStrictInteriorSequence(
  minimum: number,
  maximum: number,
  spacing: number,
  offset: number
): number[] {
  return getStrictInteriorMultiples(minimum - offset, maximum - offset, spacing).map(
    (value) => value + offset
  );
}

function getStrictInteriorMultiples(
  minimum: number,
  maximum: number,
  spacing: number
): number[] {
  const epsilon = spacing * 1e-7;
  const firstIndex = Math.floor((minimum + epsilon) / spacing) + 1;
  const lastIndex = Math.ceil((maximum - epsilon) / spacing) - 1;
  const values: number[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    values.push(index * spacing);
  }

  return values;
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

function formatVoltageExact(voltage: number): string {
  const normalized = Math.abs(voltage) < 0.0005 ? 0 : voltage;
  return trimZeros(normalized.toFixed(3));
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
    backgroundColor: pocketLabColors.surface,
  },
  xAxisTouchStrip: {
    position: "absolute",
    bottom: 0,
    height: BOTTOM_MARGIN,
    backgroundColor: "transparent",
  },
  plotTouchSurface: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  yAxisTouchStrip: {
    position: "absolute",
    left: 0,
    top: TOP_MARGIN,
    width: LEFT_MARGIN,
    bottom: BOTTOM_MARGIN,
    backgroundColor: "transparent",
  },
  rightYAxisTouchStrip: {
    position: "absolute",
    right: 0,
    top: TOP_MARGIN,
    width: RIGHT_MARGIN,
    bottom: BOTTOM_MARGIN,
    backgroundColor: "transparent",
  },
});
