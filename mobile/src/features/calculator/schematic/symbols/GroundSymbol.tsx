import { G, Line } from "react-native-svg";

/** Single north-facing terminal: lead to cell center, then three ground bars. */
export function GroundSymbol({ cellSize, color = "#008577" }: {
  cellSize: number;
  color?: string;
}) {
  return (
    <G transform={`scale(${cellSize / 100})`}>
      <Line x1={50} y1={0} x2={50} y2={49} stroke={color} strokeWidth={2.5} />
      <Line x1={32} y1={49} x2={68} y2={49} stroke={color} strokeWidth={2.5} />
      <Line x1={38} y1={57} x2={62} y2={57} stroke={color} strokeWidth={2.5} />
      <Line x1={44} y1={65} x2={56} y2={65} stroke={color} strokeWidth={2.5} />
    </G>
  );
}
