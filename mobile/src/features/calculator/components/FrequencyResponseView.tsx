import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { pocketLabColors as c } from "@/themes/theme";
import type { FrequencySample } from "../registry/types";

const WIDTH = 320;
const HEIGHT = 158;
const LEFT = 43;
const RIGHT = 10;
const TOP = 14;
const BOTTOM = 27;

function frequencyLabel(frequency: number): string {
  if (frequency >= 1e6) return `${Number((frequency / 1e6).toPrecision(3))} MHz`;
  if (frequency >= 1e3) return `${Number((frequency / 1e3).toPrecision(3))} kHz`;
  return `${Number(frequency.toPrecision(3))} Hz`;
}

function Plot({ samples, cursor, property, min, max, title, unit }: {
  samples: FrequencySample[];
  cursor: number;
  property: "magnitudeDb" | "phaseDeg";
  min: number;
  max: number;
  title: string;
  unit: string;
}) {
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number) => LEFT + index / (samples.length - 1) * plotWidth;
  const y = (value: number) => TOP + (max - value) / (max - min) * plotHeight;
  const path = samples.map((sample, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(sample[property]).toFixed(2)}`).join(" ");
  const current = samples[cursor];
  return (
    <View>
      <Text style={styles.plotTitle}>{title}</Text>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} accessibilityLabel={`${title} plotted against logarithmic frequency`}>
        {[0, 1, 2, 3, 4].map((step) => {
          const value = max - (max - min) * step / 4;
          const yy = y(value);
          return <Line key={`h${step}`} x1={LEFT} y1={yy} x2={WIDTH - RIGHT} y2={yy} stroke="#DDE4E7" strokeWidth={1} />;
        })}
        {[0, 30, 60, 90, 120].map((index) => {
          const xx = x(index);
          return <Line key={`v${index}`} x1={xx} y1={TOP} x2={xx} y2={HEIGHT - BOTTOM} stroke="#EDF0F2" strokeWidth={1} />;
        })}
        {[0, 1, 2, 3, 4].map((step) => {
          const value = max - (max - min) * step / 4;
          return <SvgText key={`label${step}`} x={LEFT - 6} y={y(value) + 4} textAnchor="end" fill={c.mutedText} fontSize={10}>{Math.round(value)}{unit}</SvgText>;
        })}
        <Path d={path} stroke={c.darkTeal} strokeWidth={2.3} fill="none" />
        <Line x1={x(cursor)} x2={x(cursor)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={c.orange} strokeWidth={1.2} strokeDasharray="4 3" />
        <SvgText x={LEFT} y={HEIGHT - 7} textAnchor="start" fontSize={10} fill={c.mutedText}>0.01 × fc</SvgText>
        <SvgText x={WIDTH - RIGHT} y={HEIGHT - 7} textAnchor="end" fontSize={10} fill={c.mutedText}>100 × fc</SvgText>
      </Svg>
      <Text style={styles.cursorText}>{frequencyLabel(current.frequency)} · {current[property].toFixed(2)}{unit}</Text>
    </View>
  );
}

export function FrequencyResponseView({ title, samples }: { title?: string; samples: FrequencySample[] | null }) {
  const [cursor, setCursor] = useState(60);
  const [width, setWidth] = useState(320);
  const moveCursor = (locationX: number) => {
    const scaledX = locationX * WIDTH / Math.max(width, 1);
    const fraction = Math.max(0, Math.min(1, (scaledX - LEFT) / (WIDTH - LEFT - RIGHT)));
    setCursor(Math.round(fraction * ((samples?.length ?? 121) - 1)));
  };
  if (!samples || samples.length < 2) {
    return <Text style={styles.empty}>Enter two filter values to simulate its frequency response.</Text>;
  }
  const index = Math.min(cursor, samples.length - 1);
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>{title ?? "Frequency response"}</Text>
      <Text style={styles.description}>Ideal unloaded response · drag or tap to inspect</Text>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Frequency-response cursor"
        accessibilityValue={{ text: frequencyLabel(samples[index].frequency) }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onTouchStart={(event) => moveCursor(event.nativeEvent.locationX)}
        onTouchMove={(event) => moveCursor(event.nativeEvent.locationX)}
      >
        <Plot samples={samples} cursor={index} property="magnitudeDb" min={-42} max={3} title="Magnitude" unit=" dB" />
        <Plot samples={samples} cursor={index} property="phaseDeg" min={-90} max={90} title="Phase" unit="°" />
      </Pressable>
      <Text style={styles.description}>Orange marker indicates the inspected frequency. Frequency axis is logarithmic.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, gap: 8 },
  title: { color: c.darkTeal, textAlign: "center" },
  plotTitle: { color: c.darkTeal, fontWeight: "600", marginBottom: 2 },
  description: { color: c.mutedText, fontSize: 12, textAlign: "center" },
  cursorText: { color: c.orange, textAlign: "center", fontWeight: "600" },
  empty: { color: c.mutedText, textAlign: "center", padding: 14 },
});
