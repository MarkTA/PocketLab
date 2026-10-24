import { G, Line, Path, Text as SvgText } from "react-native-svg";

type Props = {
  cellSize: number;
  orientation?: "vertical" | "horizontal";
  name: string;
  value?: string;
  color?: string;
};

/** Geometry is local to a 100×100 cell; canvas owns cell placement. */
export function ResistorSymbol({
  cellSize,
  orientation = "vertical",
  name,
  value,
  color = "#008577",
}: Props) {
  const horizontal = orientation === "horizontal";

  return (
    <G transform={`scale(${cellSize / 100})`}>
      {/* Rotate only the electrical symbol; keep text horizontal. */}
      <G transform={horizontal ? "rotate(90, 50, 50)" : undefined}>
        <Line x1={50} y1={0} x2={50} y2={25} stroke={color} strokeWidth={2.5} />
        <Path
          d="M50 25 L42 31 L58 39 L42 47 L58 55 L42 63 L58 71 L50 75"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
        />
        <Line x1={50} y1={75} x2={50} y2={100} stroke={color} strokeWidth={2.5} />
      </G>

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
