import { Circle, G, Line, Text as SvgText } from "react-native-svg";
import type { Side } from "../grid";

type Props = {
  cellSize: number;
  side: Side;
  name: string;
  value?: string;
  color?: string;
};

const endpoints: Record<Side, [number, number]> = {
  north: [50, 0],
  east: [100, 50],
  south: [50, 100],
  west: [0, 50],
};

/** An open-circle terminal with leads ending at its assigned cell-edge port. */
export function TerminalSymbol({ cellSize, side, name, value, color = "#008577" }: Props) {
  const [x, y] = endpoints[side];
  const horizontal = side === "east" || side === "west";

  return (
    <G transform={`scale(${cellSize / 100})`}>
      <Line x1={50} y1={50} x2={x} y2={y} stroke={color} strokeWidth={2.5} />
      <Circle cx={50} cy={50} r={6} stroke={color} strokeWidth={2.5} fill="white" />
      <SvgText
        x={horizontal ? 50 : 36}
        y={horizontal ? 27 : 54}
        textAnchor={horizontal ? "middle" : "end"}
        fontSize={17}
        fontWeight="bold"
        fill={color}
      >
        {name}
      </SvgText>
      {value ? (
        <SvgText
          x={horizontal ? 50 : 64}
          y={horizontal ? 86 : 54}
          textAnchor={horizontal ? "middle" : "start"}
          fontSize={14}
          fill="#3E4953"
        >
          {value}
        </SvgText>
      ) : null}
    </G>
  );
}
