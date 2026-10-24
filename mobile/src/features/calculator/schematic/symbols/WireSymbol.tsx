import { Circle, G, Line } from "react-native-svg";

export type WireOrientation = "horizontal" | "vertical";
export type Port = "north" | "east" | "south" | "west";
export type WireShape = "straight" | "corner" | "tee" | "cross";

type Props = {
  cellSize: number;
  /** Explicit connected sides of this grid cell. */
  ports: readonly Port[];
  color?: string;
};

const endpoints: Record<Port, { x: number; y: number }> = {
  north: { x: 50, y: 0 },
  east: { x: 100, y: 50 },
  south: { x: 50, y: 100 },
  west: { x: 0, y: 50 },
};

/** All segments meet at cell center. Three-/four-way junctions get an explicit dot.
 *  The electrical model will ultimately determine connectivity, not the SVG drawing.
 */
export function WireSymbol({ cellSize, ports, color = "#008577" }: Props) {
  const valid = [...new Set(ports)].filter(port => port in endpoints);
  return (
    <G transform={`scale(${cellSize / 100})`}>
      {valid.map(port => (
        <Line
          key={port}
          x1={50} y1={50}
          x2={endpoints[port].x} y2={endpoints[port].y}
          stroke={color} strokeWidth={2.5} strokeLinecap="butt"
        />
      ))}
      {valid.length >= 3 && (
        <Circle cx={50} cy={50} r={4.5} fill={color} />
      )}
    </G>
  );
}

/** Convenient presets; arbitrary port combinations remain supported. */
export const WIRE_PORTS = {
  horizontal: ["west", "east"],
  vertical: ["north", "south"],
  cornerNE: ["north", "east"],
  cornerES: ["east", "south"],
  cornerSW: ["south", "west"],
  cornerWN: ["west", "north"],
  teeNES: ["north", "east", "south"],
  teeESW: ["east", "south", "west"],
  teeNSW: ["north", "south", "west"],
  teeNEW: ["north", "east", "west"],
  cross: ["north", "east", "south", "west"],
} as const satisfies Record<string, readonly Port[]>;
