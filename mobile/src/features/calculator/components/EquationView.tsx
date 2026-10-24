import { useMemo } from "react";
import { KaTeXAutoHeightWebView, createKaTeXHTML } from "@adheil_gupta/react-native-latex-renderer";
import { pocketLabColors } from "@/themes/theme";

type Props = { latex: string };

/** All KaTeX resources are bundled in the package; no network request required. */
export function EquationView({ latex }: Props) {
  const html = useMemo(() => createKaTeXHTML(
    `$$${latex}$$`,
    { "font-size": "16px", color: pocketLabColors.text, "background-color": "transparent" },
    { color: pocketLabColors.darkTeal },
  ), [latex]);
  return (
    <KaTeXAutoHeightWebView
      source={html}
      minHeight={58}
      scrollEnabled={false}
      containerStyle={{ width: "100%", backgroundColor: pocketLabColors.surface }}
    />
  );
}
