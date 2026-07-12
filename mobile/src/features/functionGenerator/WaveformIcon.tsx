import Svg, { Path, Line } from "react-native-svg";
import type { Waveform } from "../../types/pocketLab";
import { pocketLabColors } from "@/themes/theme";

type Props = {
  type: Waveform;
  size?: number;
  color?: string;
};

export function WaveformIcon({
  type,
  size = 32,
  color = pocketLabColors.darkTeal,
}: Props) {
  const common = {
    stroke: color,
    strokeWidth: 6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {type === "sine" && <Path d="M4 32 C12 8, 20 8, 28 32 S44 56, 60 32" {...common} />}

      {type === "square" && <Path d="M4 44 H16 V20 H32 V44 H48 V20 H60" {...common} />}

      {type === "triangle" && <Path d="M4 44 L18 20 L32 44 L46 20 L60 44" {...common} />}

      {type === "dc" && (
        <>
          <Line x1="8" y1="32" x2="56" y2="32" {...common} />
          <Line x1="48" y1="24" x2="56" y2="32" {...common} />
          <Line x1="48" y1="40" x2="56" y2="32" {...common} />
        </>
      )}

      {type === "rampUp" && <Path d="M6 48 L30 16 V48 L56 16" {...common} />}

      {type === "rampDown" && <Path d="M6 16 L30 48 V16 L56 48" {...common} />}
    </Svg>
  );
}
