import { G, Line, Text as SvgText } from "react-native-svg";
import type { Orientation } from "../grid";

type Props = { cellSize: number; name: string; value?: string; color?: string; orientation?: Orientation; positive?: "north" | "south" | "east" | "west" };

/** DC battery symbol: long plate is positive. Leads reach the cell's opposite ports. */
export function BatterySymbol({ cellSize, name, value, color = "#008577", orientation = "vertical", positive = "north" }: Props) {
  const horizontal = orientation === "horizontal";
  const flip = positive === "south" || positive === "east";
  return <G transform={`scale(${cellSize / 100})`}>
    <G transform={`${horizontal ? "rotate(90, 50, 50) " : ""}${flip ? "rotate(180, 50, 50)" : ""}`}>
      <Line x1={50} y1={0} x2={50} y2={43} stroke={color} strokeWidth={2.5} />
      <Line x1={29} y1={43} x2={71} y2={43} stroke={color} strokeWidth={3} />
      <Line x1={39} y1={57} x2={61} y2={57} stroke={color} strokeWidth={3} />
      <Line x1={50} y1={57} x2={50} y2={100} stroke={color} strokeWidth={2.5} />
      <SvgText x={79} y={39} textAnchor="middle" fontSize={16} fontWeight="bold" fill={color}>+</SvgText>
      <SvgText x={79} y={69} textAnchor="middle" fontSize={16} fontWeight="bold" fill={color}>−</SvgText>
    </G>
    <SvgText x={20} y={38} textAnchor="end" fontSize={17} fontWeight="bold" fill={color}>{name}</SvgText>
    {value ? <SvgText x={77} y={55} fontSize={14} fill="#3E4953">{value}</SvgText> : null}
  </G>;
}
