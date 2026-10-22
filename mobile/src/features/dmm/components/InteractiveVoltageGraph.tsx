/* src/features/dmm/components/InteractiveVoltageGraph.tsx */
import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { PanResponder, StyleSheet, TextInput, View } from "react-native";
import { Button, Text } from "react-native-paper";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { pocketLabColors as c } from "../../../themes/theme";
import type { DmmSample } from "../hooks/useContinuousDmm";

const LEFT = 57;
const RIGHT = 30;
const TOP = 12;
const BOTTOM = 42;
const DEFAULT_WINDOW = 30_000;
const MIN_WINDOW = 1_000;
const MAX_WINDOW = 10 * 60_000;
const CURSOR_HIT_PX = 16;
const TIME_DIVISIONS = 3;
const VOLTAGE_DIVISIONS = 4;
const MIN_VOLTAGE_SPAN = 0.00001;
const MAX_VOLTAGE_SPAN = 1e6;

type Point = { timestamp: number; value: number };
type Viewport = { start: number; end: number; low: number; high: number };
type Size = { width: number; height: number };
type Touch = { pageX: number; pageY: number };
type Gesture = {
  kind: "cursor" | "pan" | "pinch";
  start: Viewport;
  x: number;
  y: number;
  touches: Touch[];
  originX: number;
  originY: number;
};

type Props = {
  samples: readonly DmmSample[];
  onInspect: (point: Point | null) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function validVoltage(s: DmmSample): s is DmmSample & { value: number } {
  return s.mode === "VOLTAGE" && s.unit === "V" && !s.overload &&
    s.value !== null && Number.isFinite(s.value);
}

/** The graph viewport is independent of acquisition; interacting never stops BLE polling. */
export function InteractiveVoltageGraph({ samples, onInspect }: Props) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [manual, setManual] = useState<Viewport | null>(null);
  // Zoom belongs to the live view, not to the acquisition/follow mode.
  // Null spans mean "use the automatic scale".
  const [liveScale, setLiveScale] = useState<{
    timeSpan: number | null;
    voltageSpan: number | null;
    voltageCenter: number | null;
  }>({ timeSpan: null, voltageSpan: null, voltageCenter: null });
  const [selected, setSelected] = useState<Point | null>(null);
  // Keep draft inputs separate from the live, continuously changing viewport.
  const [editingScale, setEditingScale] = useState<"x" | "y" | null>(null);
  const [scaleDraft, setScaleDraft] = useState("");
  const gesture = useRef<Gesture | null>(null);
  const selectedRef = useRef<Point | null>(null);
  
  const axisGesture = useRef<{
    axis: "x" | "y";
    distance: number;
    startX: number;
    startY: number;
    viewport: Viewport;
    touchCount: number;
  } | null>(null);

  const points = useMemo(() => samples.filter(validVoltage), [samples]);
  const latest = points.length ? points[points.length - 1].timestamp : 0;
  const earliest = points.length ? points[0].timestamp : latest;
  const graphWidth = Math.max(1, size.width - LEFT - RIGHT);
  const graphHeight = Math.max(1, size.height - TOP - BOTTOM);

  const auto = useMemo((): Viewport => {
    const start = latest - DEFAULT_WINDOW;
    const visible = points.filter(p => p.timestamp >= start);
    let min = Infinity;
    let max = -Infinity;
    for (const p of visible) { min = Math.min(min, p.value); max = Math.max(max, p.value); }
    if (!visible.length) { min = -0.005; max = 0.005; }
    const pad = Math.max((max - min) * 0.12, Math.max(Math.abs(min), Math.abs(max)) * 0.002, 0.005);
    return { start, end: latest, low: min - pad, high: max + pad };
  }, [points, latest]);

  // Clamp saved views to retained data, without snapping back to the live edge.
  const liveTimeSpan = liveScale.timeSpan ?? DEFAULT_WINDOW;
  const liveVoltageSpan = liveScale.voltageSpan ?? (auto.high - auto.low);
  const liveVoltageCenter = liveScale.voltageCenter ?? ((auto.low + auto.high) / 2);
  const liveViewport: Viewport = {
    start: latest - liveTimeSpan,
    end: latest,
    low: liveVoltageCenter - liveVoltageSpan / 2,
    high: liveVoltageCenter + liveVoltageSpan / 2,
  };
  const viewport = manual ?? liveViewport;
  const spanX = viewport.end - viewport.start;
  const spanY = viewport.high - viewport.low;
  const xPerDiv = spanX / 1000 / TIME_DIVISIONS;
  const yPerDiv = spanY / VOLTAGE_DIVISIONS;
  const toX = (t: number) => LEFT + (t - viewport.start) / spanX * graphWidth;
  const toY = (v: number) => TOP + (viewport.high - v) / spanY * graphHeight;
  // Use latest measured plot dimensions; the PanResponder was created at mount.
  const fromX = (x: number, v: Viewport, width: number) => v.start + (x - LEFT) / Math.max(1, width) * (v.end - v.start);

  const visible = useMemo(() => points.filter(p => p.timestamp >= viewport.start && p.timestamp <= viewport.end),
    [points, viewport.start, viewport.end]);
  // Preserve spikes when zoomed out: render min/max per pixel bucket, in acquisition order.
  const plotted = useMemo(() => {
    if (visible.length < graphWidth * 2) return visible;
    const result: Point[] = [];
    const bucketSize = Math.max(1, Math.floor(visible.length / graphWidth));
    for (let i = 0; i < visible.length; i += bucketSize) {
      const bucket = visible.slice(i, i + bucketSize);
      const a = bucket.reduce((best, p) => p.value < best.value ? p : best);
      const b = bucket.reduce((best, p) => p.value > best.value ? p : best);
      result.push(...(a.timestamp <= b.timestamp ? [a, b] : [b, a]));
    }
    return result;
  }, [visible, graphWidth]);
  const path = plotted.map((p, i) => `${i === 0 || p.timestamp - plotted[i - 1].timestamp > 2000 ? "M" : "L"}${toX(p.timestamp).toFixed(2)},${toY(p.value).toFixed(2)}`).join(" ");

  const dataRef = useRef({ points, viewport, graphWidth, graphHeight, size, onInspect, latest, earliest, following: manual === null });
  
  useLayoutEffect(() => {
    selectedRef.current = selected;
    dataRef.current = {
      points,
      viewport,
      graphWidth,
      graphHeight,
      size,
      onInspect,
      latest,
      earliest,
      following: manual === null,
    };
  }, [
    selected,
    points,
    viewport,
    graphWidth,
    graphHeight,
    size,
    onInspect,
    latest,
    earliest,
    manual,
  ]);

  // Panning/inspection explicitly enters history mode. Scaling does not.
  function commit(v: Viewport) {
    const d = dataRef.current;
    const duration = clamp(v.end - v.start, MIN_WINDOW, MAX_WINDOW);
    const minEnd = d.earliest + duration;
    const end = clamp(v.end, Math.min(minEnd, d.latest), d.latest);
    // At startup the history can be shorter than the visible window.
    setManual({ start: end - duration, end, low: v.low, high: Math.max(v.low + 1e-8, v.high) });
  }

  function applyScale(axis: "x" | "y", raw: string) {
    const value = Number(raw.trim());
    if (!Number.isFinite(value) || value <= 0) return;
    if (axis === "x") {
      const span = clamp(value * 1000 * TIME_DIVISIONS, MIN_WINDOW, MAX_WINDOW);
      if (dataRef.current.following) {
        setLiveScale(prev => ({ ...prev, timeSpan: span }));
      } else {
        const v = dataRef.current.viewport;
        const center = (v.start + v.end) / 2;
        commit({ ...v, start: center - span / 2, end: center + span / 2 });
      }
    } else {
      const span = clamp(value * VOLTAGE_DIVISIONS, MIN_VOLTAGE_SPAN, MAX_VOLTAGE_SPAN);
      const v = dataRef.current.viewport;
      const center = (v.low + v.high) / 2;
      if (dataRef.current.following) {
        setLiveScale(prev => ({ ...prev, voltageSpan: span, voltageCenter: center }));
      } else {
        commit({ ...v, low: center - span / 2, high: center + span / 2 });
      }
    }
  }

  function finishScaleEdit(axis: "x" | "y", text: string) {
    applyScale(axis, text);
    setEditingScale(null);
    setScaleDraft("");
  }

  function formatDivision(value: number) {
    return Number(value.toPrecision(5)).toString();
  }

  // Coordinates are local to the plot overlay. Avoid asynchronous measureInWindow:
  // it can report a stale position after the gesture has ended on Android.
  function localSvgX(locationX: number) {
    const d = dataRef.current;
    return clamp(LEFT + locationX, LEFT, d.size.width - RIGHT);
  }

  // The crosshair follows the finger's X position. Its readout uses the
  // nearest sample, or linearly interpolates only across short data gaps.
  // Unlike snapping the marker to a sample timestamp, this never jumps to
  // the right-hand edge when a 30 s viewport has only a few seconds of data.
  // Diagnostic version: bounded logs for cursor start/selection.
  
  function inspect(x: number) {
    const d = dataRef.current;
    
    if (d.size.width <= LEFT + RIGHT || d.graphWidth <= 1) {
      // console.warn("[GRAPH INSPECT EXIT] invalid graph dimensions", d.size);
      return;
    }
    const clampedX = clamp(x, LEFT, d.size.width - RIGHT);
    const time = fromX(clampedX, d.viewport, d.graphWidth);
    // if (verbose) console.log("[GRAPH CURSOR TIME]", {
    //   touchX: x, clampedX, calculatedTime: time,
    //   viewportStart: d.viewport.start, viewportEnd: d.viewport.end,
    //   firstSample: d.points[0]?.timestamp,
    //   lastSample: d.points[d.points.length - 1]?.timestamp,
    // });
    const visible = d.points.filter(p => p.timestamp >= d.viewport.start && p.timestamp <= d.viewport.end);
    if (visible.length === 0) {
      // console.warn("[GRAPH INSPECT EXIT] no samples inside viewport", {
      //   pointCount: d.points.length, viewport: d.viewport,
      // });
      return;
    }
    let lo = 0, hi = visible.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (visible[mid].timestamp < time) lo = mid + 1;
      else hi = mid;
    }
    const right = visible[lo];
    const left = visible[lo - 1];
    let value: number;
    if (left && right && right.timestamp - left.timestamp > 0 && right.timestamp - left.timestamp <= 2_000) {
      const factor = (time - left.timestamp) / (right.timestamp - left.timestamp);
      value = left.value + factor * (right.value - left.value);
    } else {
      const nearest = !left ? right : !right ? left :
        time - left.timestamp <= right.timestamp - time ? left : right;
      if (!nearest) {
        // console.warn("[GRAPH INSPECT EXIT] no nearest sample", { time, lo });
        return;
      }
      value = nearest.value;
    }
    const point = { timestamp: time, value };
    // if (verbose) console.log("[GRAPH CURSOR SELECTED]", { point, left, right, visibleCount: visible.length });
    setSelected(point);
    setManual(previous => previous ?? { ...d.viewport });
    d.onInspect(point);
  }

  function nearTrace(x: number, y: number) {
    const d = dataRef.current;
    if (x < LEFT || x > d.size.width - RIGHT || y < TOP || y > d.size.height - BOTTOM) return false;
    const visible = d.points.filter(p => p.timestamp >= d.viewport.start && p.timestamp <= d.viewport.end);
    const mapX = (p: Point) => LEFT + (p.timestamp - d.viewport.start) / (d.viewport.end - d.viewport.start) * d.graphWidth;
    const mapY = (p: Point) => TOP + (d.viewport.high - p.value) / (d.viewport.high - d.viewport.low) * d.graphHeight;
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i];
      if (Math.hypot(mapX(p) - x, mapY(p) - y) <= CURSOR_HIT_PX) return true;
      if (i === 0 || p.timestamp - visible[i - 1].timestamp > 2000) continue;
      const a = visible[i - 1];
      const ax = mapX(a), ay = mapY(a), bx = mapX(p), by = mapY(p);
      const denom = (bx - ax) ** 2 + (by - ay) ** 2;
      const fraction = denom > 0 ? clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / denom, 0, 1) : 0;
      if (Math.hypot(x - (ax + fraction * (bx - ax)), y - (ay + fraction * (by - ay))) <= CURSOR_HIT_PX) return true;
    }
    return false;
  }

  // One finger pans the selected axis; two fingers pinch to zoom it.
  // Touch-count transitions rebase the gesture to avoid jumps.
  function axisResponder(axis: "x" | "y") {
    const begin = (touches: readonly Touch[]) => {
      if (touches.length !== 1 && touches.length !== 2) return;
      const distance = touches.length === 2
        ? axis === "x"
          ? Math.abs(touches[1].pageX - touches[0].pageX)
          : Math.abs(touches[1].pageY - touches[0].pageY)
        : 0;
      axisGesture.current = {
        axis, distance,
        startX: touches[0].pageX,
        startY: touches[0].pageY,
        touchCount: touches.length,
        viewport: { ...dataRef.current.viewport },
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: e => e.nativeEvent.touches.length >= 1,
      onMoveShouldSetPanResponder: e => e.nativeEvent.touches.length >= 1,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => begin(e.nativeEvent.touches),
      onPanResponderMove: e => {
        const touches = e.nativeEvent.touches;
        if (touches.length !== 1 && touches.length !== 2) return;
        const g = axisGesture.current;
        if (!g || g.axis !== axis || g.touchCount !== touches.length) {
          begin(touches);
          return;
        }
        if (touches.length === 1) {
          // Pan only the axis being touched; do not change its scale.
          if (axis === "x") {
            const dx = touches[0].pageX - g.startX;
            const offset = (dx / Math.max(1, dataRef.current.graphWidth)) *
              (g.viewport.end - g.viewport.start);
            commit({ ...g.viewport,
              start: g.viewport.start - offset,
              end: g.viewport.end - offset });
          } else {
            const dy = touches[0].pageY - g.startY;
            const offset = (dy / Math.max(1, dataRef.current.graphHeight)) *
              (g.viewport.high - g.viewport.low);
            commit({ ...g.viewport,
              low: g.viewport.low + offset,
              high: g.viewport.high + offset });
          }
          return;
        }
        const distance = axis === "x"
          ? Math.abs(touches[1].pageX - touches[0].pageX)
          : Math.abs(touches[1].pageY - touches[0].pageY);
        if (g.distance < 8 || distance < 8) return;
        const factor = clamp(g.distance / distance, 0.1, 10);
        if (axis === "x") {
          const span = clamp((g.viewport.end - g.viewport.start) * factor, MIN_WINDOW, MAX_WINDOW);
          if (dataRef.current.following) {
            // Continue following the newest sample at the new time scale.
            setLiveScale(prev => ({ ...prev, timeSpan: span }));
          } else {
            const center = (g.viewport.start + g.viewport.end) / 2;
            commit({ ...g.viewport, start: center - span / 2, end: center + span / 2 });
          }
        } else {
          const span = clamp((g.viewport.high - g.viewport.low) * factor, MIN_VOLTAGE_SPAN, MAX_VOLTAGE_SPAN);
          const center = (g.viewport.low + g.viewport.high) / 2;
          if (dataRef.current.following) {
            // Retain user-selected voltage range while readings stream in.
            setLiveScale(prev => ({ ...prev, voltageSpan: span, voltageCenter: center }));
          } else {
            commit({ ...g.viewport, low: center - span / 2, high: center + span / 2 });
          }
        }
      },
      onPanResponderRelease: () => { axisGesture.current = null; },
      onPanResponderTerminate: () => { axisGesture.current = null; },
      onShouldBlockNativeResponder: () => true,
    });
  }

  // PanResponder callbacks access refs only during gesture events,
  // never during React rendering.
  // eslint-disable-next-line react-hooks/refs
  const [xAxisResponder] = useState(() => axisResponder("x"));

  // eslint-disable-next-line react-hooks/refs
  const [yAxisResponder] = useState(() => axisResponder("y"));

  // The touch layer uses local coordinates: X/Y originate at the plot interior,
  // not at the SVG origin. Taps always snap to the nearest visible sample,
  // while an initial drag away from the trace pans the viewport.
// eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: e => e.nativeEvent.touches.length === 1,
    onMoveShouldSetPanResponder: e => e.nativeEvent.touches.length === 1,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => {
      
      const x = localSvgX(e.nativeEvent.locationX);
      // The overlay's locationX/Y is relative to the graph interior.
      const y = TOP + e.nativeEvent.locationY;
      const d = dataRef.current;
      const p = selectedRef.current;
      const onCursor = p !== null && Math.hypot(
        LEFT + (p.timestamp - d.viewport.start) / (d.viewport.end - d.viewport.start) * d.graphWidth - x,
        TOP + (d.viewport.high - p.value) / (d.viewport.high - d.viewport.low) * d.graphHeight - y
      ) <= 34;
      const kind = onCursor || nearTrace(x, y) ? "cursor" : "pan";
      gesture.current = { kind, start: { ...d.viewport }, x, y, touches: [],
        originX: e.nativeEvent.pageX, originY: e.nativeEvent.pageY };
      if (kind === "cursor") inspect(x);
    },
    onPanResponderMove: (event, state) => {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === "cursor") {
        inspect(localSvgX(event.nativeEvent.locationX));
      } else if (Math.hypot(state.dx, state.dy) > 10) {
        const d = dataRef.current;
        const dx = state.dx / d.graphWidth * (g.start.end - g.start.start);
        const dy = state.dy / d.graphHeight * (g.start.high - g.start.low);
        commit({ start: g.start.start - dx, end: g.start.end - dx,
          low: g.start.low + dy, high: g.start.high + dy });
      }
    },
    onPanResponderRelease: (event, state) => {
      // Always select on a tap. Use synchronous overlay-local coordinates.
      if (Math.hypot(state.dx, state.dy) < 10) {
        inspect(localSvgX(event.nativeEvent.locationX));
      }
      gesture.current = null;
    },
    onPanResponderTerminate: () => { gesture.current = null; },
    onShouldBlockNativeResponder: () => true,
  }));

  function backToLive() {
    // Return to the live edge without throwing away the chosen zoom.
    // If a user zoomed in history mode, carry that viewport scale forward.
    if (manual) {
      setLiveScale({
        timeSpan: manual.end - manual.start,
        voltageSpan: manual.high - manual.low,
        voltageCenter: (manual.high + manual.low) / 2,
      });
    }
    setManual(null);
    setSelected(null);
    onInspect(null);
  }

  return <View style={styles.container}>
    <View style={styles.plot} onLayout={e => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) setSize(old => old.width === width && old.height === height ? old : { width, height });
    }} accessibilityLabel="Voltage history graph; drag to pan, pinch to zoom, or touch the line to inspect a sample">
      {size.width > 0 && size.height > 0 && <Svg width={size.width} height={size.height} pointerEvents="none">
        {Array.from({ length: 5 }, (_, i) => {
          const y = TOP + i * graphHeight / 4;
          return <Line key={`h${i}`} x1={LEFT} x2={size.width - RIGHT} y1={y} y2={y} stroke={c.grid} />;
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const y = TOP + i * graphHeight / 4;
          const value = viewport.high - i * spanY / 4;
          const label = spanY < 0.02 ? value.toFixed(4) : spanY < 2 ? value.toFixed(2) : value.toFixed(1);
          return <SvgText key={`v${i}`} x={LEFT - 7} y={y + 4} fontSize={10} textAnchor="end" fill={c.mutedText}>{label}</SvgText>;
        })}
        {Array.from({ length: 4 }, (_, i) => {
          const x = LEFT + i * graphWidth / 3;
          const seconds = (viewport.start + i * spanX / 3 - latest) / 1000;
          return <SvgText key={`x${i}`} x={x} y={size.height - 8} fontSize={10} textAnchor="middle" fill={c.mutedText}>{seconds.toFixed(spanX < 10000 ? 1 : 0)}s</SvgText>;
        })}
        {plotted.length > 1 && <Path d={path} stroke={c.darkTeal} strokeWidth={2.5} fill="none" />}
        {selected && selected.timestamp >= viewport.start && selected.timestamp <= viewport.end && <>
          <Line x1={toX(selected.timestamp)} x2={toX(selected.timestamp)} y1={TOP} y2={size.height - BOTTOM} stroke={c.darkTeal} strokeDasharray="4 4" />
          <Circle cx={toX(selected.timestamp)} cy={toY(selected.value)} r={5} fill={c.darkTeal} stroke={c.surface} strokeWidth={2} />
        </>}
      </Svg>}
      <View style={[styles.plotTouchSurface, { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM }]}
        {...responder.panHandlers} accessibilityLabel="Tap to select a voltage sample; drag the trace cursor to inspect, or drag empty space to pan" />
      <View style={[styles.xAxisTouchStrip, { left: LEFT, right: RIGHT, height: BOTTOM }]}
        {...xAxisResponder.panHandlers} accessibilityLabel="Drag the time axis to pan; pinch to zoom horizontally" />
      <View style={[styles.yAxisTouchStrip, { width: LEFT, top: TOP, bottom: BOTTOM }]}
        {...yAxisResponder.panHandlers} accessibilityLabel="Drag the voltage axis to pan; pinch to zoom vertically" />
      <View style={[styles.rightAxisTouchStrip, { width: RIGHT, top: TOP, bottom: BOTTOM }]}
        {...yAxisResponder.panHandlers} accessibilityLabel="Drag the voltage axis to pan; pinch to zoom vertically" />
    </View>
    {points.length === 0 && <Text style={styles.empty}>Waiting for voltage samples…</Text>}
    {(manual || selected) && <Button compact mode="contained-tonal" icon="arrow-right-circle-outline" onPress={backToLive} style={styles.live}>Live</Button>}
    <View style={styles.scaleRow}>
      <View style={styles.scaleGroup}>
        <Text style={styles.scaleLabel}>V/div</Text>
        <TextInput
          accessibilityLabel="Volts per division"
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={styles.scaleInput}
          value={editingScale === "y" ? scaleDraft : formatDivision(yPerDiv)}
          onFocus={() => { setEditingScale("y"); setScaleDraft(formatDivision(yPerDiv)); }}
          onChangeText={setScaleDraft}
          onEndEditing={event => finishScaleEdit("y", event.nativeEvent.text)}
          returnKeyType="done"
        />
      </View>
      <View style={styles.scaleGroup}>
        <Text style={styles.scaleLabel}>s/div</Text>
        <TextInput
          accessibilityLabel="Seconds per division"
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={styles.scaleInput}
          value={editingScale === "x" ? scaleDraft : formatDivision(xPerDiv)}
          onFocus={() => { setEditingScale("x"); setScaleDraft(formatDivision(xPerDiv)); }}
          onChangeText={setScaleDraft}
          onEndEditing={event => finishScaleEdit("x", event.nativeEvent.text)}
          returnKeyType="done"
        />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, borderRadius: 12, borderWidth: 1, borderColor: c.grid, backgroundColor: c.surface, overflow: "hidden" },
  plot: { flex: 1, minHeight: 0 },
  empty: { position: "absolute", top: "48%", alignSelf: "center", color: c.mutedText },
  live: { position: "absolute", top: 6, right: 6 },
  plotTouchSurface: { position: "absolute", backgroundColor: "transparent" },
  xAxisTouchStrip: { position: "absolute", bottom: 0, backgroundColor: "transparent" },
  yAxisTouchStrip: { position: "absolute", left: 0, backgroundColor: "transparent" },
  rightAxisTouchStrip: { position: "absolute", right: 0, backgroundColor: "transparent" },
  scaleRow: { height: 48, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, borderTopWidth: 1, borderColor: c.grid, paddingHorizontal: 8 },
  scaleGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  scaleLabel: { color: c.mutedText, fontSize: 12 },
  scaleInput: { minWidth: 62, height: 34, paddingVertical: 2, paddingHorizontal: 8, color: c.text, borderWidth: 1, borderRadius: 7, borderColor: c.grid, textAlign: "center", fontSize: 14 },
});
