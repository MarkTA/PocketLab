const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: [".expo/**", "android/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["src/features/functionGenerator/WaveformPreview.tsx"],
    rules: {
      // React's compiler-oriented rules cannot see that PanResponder callbacks
      // execute after render, so they incorrectly flag event-time ref access
      // and Date.now() calls in this file.
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["src/hooks/use-color-scheme.web.ts"],
    rules: {
      // This hydration flag intentionally changes after the first client render.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];