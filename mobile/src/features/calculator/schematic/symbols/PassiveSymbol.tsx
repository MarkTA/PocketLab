import { G, Line, Path, Text as SvgText } from "react-native-svg";

/** Reusable grid-cell passive symbols; the canvas determines geometry and hit regions. */
export function PassiveSymbol({ type, cellSize, name, orientation = "vertical", value, color = "#174c55" }: {
  type: "capacitor" | "inductor";
  cellSize: number;
  name: string;
  orientation?: "vertical" | "horizontal";
  value?: string;
  color?: string;
}) {
  const horizontal = orientation === "horizontal";
  return <G transform={`scale(${cellSize / 100})`}>
    <G transform={horizontal ? "rotate(90, 50, 50)" : undefined}>
      <Line x1={50} y1={0} x2={50} y2={32} stroke={color} strokeWidth={2.5} />
      {type === "capacitor" ? <>
        <Line x1={35} y1={44} x2={65} y2={44} stroke={color} strokeWidth={3} />
        <Line x1={35} y1={56} x2={65} y2={56} stroke={color} strokeWidth={3} />
        <Line x1={50} y1={32} x2={50} y2={44} stroke={color} strokeWidth={2.5} />
        <Line x1={50} y1={56} x2={50} y2={68} stroke={color} strokeWidth={2.5} />
      </> : <Path d="M50 32 C29 32 29 41 50 41 C29 41 29 50 50 50 C29 50 29 59 50 59 C29 59 29 68 50 68" fill="none" stroke={color} strokeWidth={2.5} />}
      <Line x1={50} y1={68} x2={50} y2={100} stroke={color} strokeWidth={2.5} />
    </G>
    <SvgText x={horizontal ? 50 : 35} y={horizontal ? 25 : 54} textAnchor={horizontal ? "middle" : "end"} fontSize={17} fontWeight="bold" fill={color}>{name}</SvgText>
    {!!value && <SvgText x={horizontal ? 50 : 65} y={horizontal ? 88 : 54} textAnchor={horizontal ? "middle" : "start"} fontSize={13} fill="#3E4953">{value}</SvgText>}
  </G>;
}
