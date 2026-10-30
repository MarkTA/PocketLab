import { G, Line, Path, Text as SvgText } from "react-native-svg";

export type CurrentArrowDirection = "cw" | "ccw" | "ns" | "sn" | "ew" | "we";
type Props = { cellSize: number; direction?: CurrentArrowDirection; name: string; value?: string; color?: string; radius?: number; length?: number };

/** Arrow direction is a fixed positive-current reference; it does not follow the result sign. */
export function CurrentArrowSymbol({ cellSize, direction = "cw", name, value, color = "#008577", radius = 29, length = 52 }: Props) {
  const r = Math.min(39, Math.max(12, radius));
  const half = Math.min(42, Math.max(10, length / 2));
  const circular = direction === "cw" || direction === "ccw";

  // A 300-degree arc leaves only a small opening at the top right.
  // Screen-space positive angles travel clockwise (y increases downward).
  const startDeg = direction === "cw" ? 120 : 60;
  const endDeg = direction === "cw" ? 60 : 120;
  const point = (angle: number) => ({
    x: 50 + r * Math.cos((angle * Math.PI) / 180),
    y: 50 + r * Math.sin((angle * Math.PI) / 180),
  });
  const start = point(startDeg);
  const tip = point(endDeg);
  const sweep = direction === "cw" ? 1 : 0;
  const arc = `M ${start.x} ${start.y} A ${r} ${r} 0 1 ${sweep} ${tip.x} ${tip.y}`;

  // Position the arrowhead along the tangent at the end of the arc.
  const endRad = (endDeg * Math.PI) / 180;
  const sign = direction === "cw" ? 1 : -1;
  const tangentX = -Math.sin(endRad) * sign;
  const tangentY = Math.cos(endRad) * sign;
  const backX = tip.x - tangentX * 10;
  const backY = tip.y - tangentY * 10;
  const normalX = -tangentY;
  const normalY = tangentX;
  const head = `M ${backX + normalX * 6} ${backY + normalY * 6} L ${tip.x} ${tip.y} L ${backX - normalX * 6} ${backY - normalY * 6}`;

  const straight: Record<Exclude<CurrentArrowDirection, "cw" | "ccw">, [number, number, number, number]> = {
    ns: [50, 50 - half, 50, 50 + half], sn: [50, 50 + half, 50, 50 - half],
    ew: [50 - half, 50, 50 + half, 50], we: [50 + half, 50, 50 - half, 50],
  };
  const line = !circular ? straight[direction] : null;
  const tipAngle = direction === "ns" ? 90 : direction === "sn" ? -90 : direction === "ew" ? 0 : 180;

  return <G transform={`scale(${cellSize / 100})`}>
    {circular ? <>
      <Path d={arc} stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Path d={head} stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </> : line ? <>
      <Line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke={color} strokeWidth={2.5} />
      <Path d="M -10 -6 L 0 0 L -10 6" transform={`translate(${line[2]}, ${line[3]}) rotate(${tipAngle})`} stroke={color} strokeWidth={2.5} fill="none" />
    </> : null}
    <SvgText x={50} y={55} fontSize={19} fontWeight="bold" textAnchor="middle" fill={color}>{name}</SvgText>
    {value ? <SvgText x={50} y={circular ? 96 : 88} fontSize={13} textAnchor="middle" fill="#3E4953">{value}</SvgText> : null}
  </G>;
}
