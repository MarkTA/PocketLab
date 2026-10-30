import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import type { ElementState, GridElement, GridSize } from "./grid";
import { BatterySymbol } from "./symbols/BatterySymbol";
import { CurrentArrowSymbol } from "./symbols/CurrentArrowSymbol";
import { GroundSymbol } from "./symbols/GroundSymbol";
import { ResistorSymbol } from "./symbols/ResistorSymbol";
import { PassiveSymbol } from "./symbols/PassiveSymbol";
import { TerminalSymbol } from "./symbols/TerminalSymbol";
import { WireSymbol } from "./symbols/WireSymbol";

type Props = {
  grid?: GridSize;
  elements?: readonly GridElement[];
  values?: Readonly<Record<string, string>>;
  states?: Readonly<Record<string, ElementState>>;
  onElementPress?: (id: string) => void;
  onCellPress?: (cell: number) => void;
  showGrid?: boolean;
  rows?: number;
  columns?: number;
  showNumbers?: boolean;
};

/**
 * All elements occupy one square cell. SVG positioning belongs to the canvas;
 * touch targets belong to cells, never individual symbols.
 */
export function SchematicCanvas({
  grid,
  elements = [],
  values,
  states,
  onElementPress,
  onCellPress,
  showGrid = false,
  rows,
  columns,
  showNumbers = false,
}: Props) {
  const [width, setWidth] = useState(0);
  const rowCount = grid?.rows ?? rows ?? 5;
  const columnCount = grid?.columns ?? columns ?? 5;
  const validGrid = Number.isInteger(rowCount) && rowCount > 0 && Number.isInteger(columnCount) && columnCount > 0;
  if (!validGrid) return <Text>Invalid schematic grid dimensions.</Text>;

  const count = rowCount * columnCount;
  const cellSize = width / columnCount;
  const height = cellSize * rowCount;
  const cellElements = new Map<number, GridElement>();
  for (const element of elements) {
    if (Number.isInteger(element.cell) && element.cell >= 0 && element.cell < count) {
      cellElements.set(element.cell, element);
    }
  }

  const handleCellPress = (cell: number) => {
    onCellPress?.(cell);
    const element = cellElements.get(cell);
    if (element && "id" in element && element.id && states?.[element.id] !== "inactive") onElementPress?.(element.id);
  };

  return (
    <View style={{ width: "100%" }} onLayout={event => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth > 0) setWidth(previous => previous === nextWidth ? previous : nextWidth);
    }}>
      {width > 0 && <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect width={width} height={height} fill="white" />
        {showGrid && <G>
          <Rect width={width} height={height} fill="none" stroke="#999" strokeWidth={0.5} />
          {Array.from({ length: columnCount - 1 }, (_, i) => <Line key={`v-${i}`}
            x1={(i + 1) * cellSize} y1={0} x2={(i + 1) * cellSize} y2={height}
            stroke="#999" strokeWidth={0.5} />)}
          {Array.from({ length: rowCount - 1 }, (_, i) => <Line key={`h-${i}`}
            x1={0} y1={(i + 1) * cellSize} x2={width} y2={(i + 1) * cellSize}
            stroke="#999" strokeWidth={0.5} />)}
        </G>}
        {showGrid && showNumbers && Array.from({ length: count }, (_, cell) => {
          if (cellElements.has(cell)) return null;
          return <SvgText key={`number-${cell}`}
            x={((cell % columnCount) + 0.5) * cellSize}
            y={(Math.floor(cell / columnCount) + 0.5) * cellSize + 4}
            textAnchor="middle" fontSize={12} fill="#888">{cell}</SvgText>;
        })}
        {elements.map((element, index) => {
          if (element.cell < 0 || element.cell >= count) return null;
          const col = element.cell % columnCount;
          const row = Math.floor(element.cell / columnCount);
          const key = "id" in element && element.id ? element.id : `${element.type}-${element.cell}-${index}`;
          const value = "id" in element && element.id ? values?.[element.id] : undefined;
          const state = "id" in element && element.id ? states?.[element.id] : undefined;
          const color = state === "inactive" ? "#a4adb4" : state === "calculated" ? "#d65924" : state === "measured" ? "#2865AD" : "#174c55";
          return (
            <G key={key} transform={`translate(${col * cellSize}, ${row * cellSize})`}>
              {(element.type === "capacitor" || element.type === "inductor") && <PassiveSymbol type={element.type} cellSize={cellSize} name={element.label} orientation={element.orientation} value={value} color={color} />}
              {element.type === "resistor" && <ResistorSymbol cellSize={cellSize}
                name={element.label} orientation={element.orientation} value={value} color={color} />}
              {element.type === "terminal" && <TerminalSymbol cellSize={cellSize}
                name={element.label} side={element.side} value={value} color={color} />}
              {element.type === "battery" && <BatterySymbol cellSize={cellSize}
                name={element.label} orientation={element.orientation} positive={element.positive} value={value} color={color} />}
              {element.type === "currentArrow" && <CurrentArrowSymbol cellSize={cellSize}
                name={element.label} direction={element.direction} radius={element.radius} length={element.length} value={value} color={color} />}
              {element.type === "ground" && <GroundSymbol cellSize={cellSize} />}
              {(element.type === "wire" || element.type === "node") && (
                <WireSymbol cellSize={cellSize} ports={element.sides} />
              )}
              {element.type === "node" && element.label && <SvgText
                x={cellSize * 0.59} y={cellSize * 0.37}
                fontSize={Math.max(10, cellSize * 0.115)} fill={color}>{element.label}</SvgText>}
            </G>
          );
        })}
        {/* Full-cell hit regions are drawn last to capture taps on any symbol. */}
        {Array.from({ length: count }, (_, cell) => <Rect key={`hit-${cell}`}
          x={(cell % columnCount) * cellSize}
          y={Math.floor(cell / columnCount) * cellSize}
          width={cellSize} height={cellSize} fill="transparent"
          onPress={() => handleCellPress(cell)} />)}
      </Svg>}
    </View>
  );
}
