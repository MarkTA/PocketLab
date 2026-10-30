import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { View } from "react-native";
import { pocketLabColors as c } from "@/themes/theme";
import type { CollectionKind } from "../registry/types";

/** Generates a connected schematic directly from a repeated-component collection. */
export function CollectionSchematic({ kind, connection, count, onSelect }: {
  kind: CollectionKind; connection: "series" | "parallel"; count: number; onSelect: (index: number) => void;
}) {
  const teal = c.darkTeal;
  const stroke = 2.5;
  const parallel = connection === "parallel";
  const width = 340;
  const height = parallel ? 165 : 96;
  const spacing = parallel ? 275 / (count + 1) : 280 / count;
  const component = (x: number, y: number, vertical: boolean) => <G>
    {kind === "resistance" ? (vertical
      ? <Path d={`M ${x} ${y-16} l -7 5 14 7 -14 7 14 7 -7 5`} fill="none" stroke={teal} strokeWidth={stroke} strokeLinejoin="round" />
      : <Path d={`M ${x-16} ${y} l 5 -7 7 14 7 -14 7 14 5 -7`} fill="none" stroke={teal} strokeWidth={stroke} strokeLinejoin="round" />)
    : kind === "capacitance" ? (vertical
      ? <G><Line x1={x-13} y1={y-5} x2={x+13} y2={y-5} stroke={teal} strokeWidth={stroke} /><Line x1={x-13} y1={y+5} x2={x+13} y2={y+5} stroke={teal} strokeWidth={stroke} /></G>
      : <G><Line x1={x-5} y1={y-13} x2={x-5} y2={y+13} stroke={teal} strokeWidth={stroke} /><Line x1={x+5} y1={y-13} x2={x+5} y2={y+13} stroke={teal} strokeWidth={stroke} /></G>)
    : <Path d={vertical ? `M ${x} ${y-18} c -16 0 -16 9 0 9 c -16 0 -16 9 0 9 c -16 0 -16 9 0 9 c -16 0 -16 9 0 9` : `M ${x-18} ${y} c 0 -16 9 -16 9 0 c 0 -16 9 -16 9 0 c 0 -16 9 -16 9 0 c 0 -16 9 -16 9 0`} fill="none" stroke={teal} strokeWidth={stroke} />}
  </G>;
  return <View accessibilityLabel={`${count} ${kind} elements in ${connection}`}>
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {parallel ? <>
        <Line x1="24" y1="28" x2="316" y2="28" stroke={teal} strokeWidth={stroke} />
        <Line x1="24" y1="136" x2="316" y2="136" stroke={teal} strokeWidth={stroke} />
        <Line x1="10" y1="28" x2="24" y2="28" stroke={teal} strokeWidth={stroke} />
        <Line x1="10" y1="136" x2="24" y2="136" stroke={teal} strokeWidth={stroke} />
        {Array.from({ length: count }, (_, i) => {
          const x = 24 + (i + 1) * spacing;
          return <G key={i} onPress={() => onSelect(i)}>
            <Line x1={x} y1="28" x2={x} y2="67" stroke={teal} strokeWidth={stroke} />
            <Line x1={x} y1="97" x2={x} y2="136" stroke={teal} strokeWidth={stroke} />
            <Circle cx={x} cy="28" r="3.5" fill={teal} /><Circle cx={x} cy="136" r="3.5" fill={teal} />
            {component(x, 82, true)}
            <SvgText x={x} y="112" textAnchor="middle" fontSize="11" fill={teal}>{`${kind === "resistance" ? "R" : kind === "capacitance" ? "C" : "L"}${i+1}`}</SvgText>
          </G>;
        })}
      </> : <>
        {Array.from({ length: count }, (_, i) => {
          const x = 30 + (i + .5) * spacing;
          return <G key={i} onPress={() => onSelect(i)}>
            <Line x1={30 + i*spacing} y1="45" x2={x-19} y2="45" stroke={teal} strokeWidth={stroke}/>
            <Line x1={x+19} y1="45" x2={30 +(i+1)*spacing} y2="45" stroke={teal} strokeWidth={stroke}/>
            {component(x, 45, false)}
            <SvgText x={x} y="75" fontSize="13" textAnchor="middle" fill={teal}>{`${kind === "resistance" ? "R" : kind === "capacitance" ? "C" : "L"}${i+1}`}</SvgText>
          </G>;
        })}
        <Line x1="13" y1="45" x2="30" y2="45" stroke={teal} strokeWidth={stroke}/>
        <Line x1="310" y1="45" x2="327" y2="45" stroke={teal} strokeWidth={stroke}/>
      </>}
    </Svg>
  </View>;
}
