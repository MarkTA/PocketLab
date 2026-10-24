import type { SettingsDefinition } from "./settingsTypes";

// JSON-compatible UI declarations. Current values are owned by feature providers,
// not by this configuration. No tool-specific settings until they are needed.
export const settingsConfig = {
  dmm: {
    id: "dmm",
    title: "Multimeter settings",
    fields: [
      {
        id: "averaging", label: "Averaging", type: "select",
        options: [
          { label: "Fast · 200 ms", value: "FAST" },
          { label: "Normal · 500 ms", value: "NORMAL" },
          { label: "Stable · 2 s", value: "STABLE" },
          { label: "Precision · 5 s", value: "PRECISION" },
        ],
      },
      {
        id: "displayRefreshMs", label: "Display refresh", type: "select",
        description: "How often the numerical reading updates. Graph data remains live.",
        options: [
          { label: "100 ms", value: 100 },
          { label: "250 ms", value: 250 },
          { label: "500 ms", value: 500 },
          { label: "1 second", value: 1000 },
          { label: "2 seconds", value: 2000 },
        ],
      },
      {
        id: "sensitivity", label: "Display sensitivity", type: "select",
        description: "Display rounding only; raw readings and graphs are unchanged.",
        options: [
          { label: "Auto · 1 mV", value: "AUTO" },
          { label: "High · 1 µV", value: "HIGH" },
          { label: "Low · 10 mV", value: "LOW" },
        ],
      },
    ],
  },
  calculator: {
    id: "calculator",
    title: "Calculator settings",
    fields: [
      {
        id: "significantFigures", label: "Significant figures", type: "select",
        options: [
          { label: "2", value: 2 }, { label: "3", value: 3 },
          { label: "4", value: 4 }, { label: "5", value: 5 },
          { label: "6", value: 6 }, { label: "7", value: 7 },
          { label: "8", value: 8 },
        ],
      },
      {
        id: "numberFormat", label: "Number format", type: "select",
        options: [
          { label: "Automatic", value: "auto" },
          { label: "Decimal", value: "decimal" },
          { label: "Scientific", value: "scientific" },
          { label: "Engineering", value: "engineering" },
        ],
      },
      {
        id: "useSIPrefixes", label: "SI prefixes", type: "switch",
        description: "Use kΩ, mV, µF, etc. in Auto mode",
      },
    ],
  },
  "function-generator": {
    id: "function-generator",
    title: "Function generator settings",
    fields: [],
  },
} as const satisfies Record<"dmm" | "calculator" | "function-generator", SettingsDefinition>;

export type SettingsScope = keyof typeof settingsConfig;

// usePathname() provides the resolved path (e.g. /calculator/tool/voltage-divider),
// so every nested calculator screen inherits its section's settings.
export function settingsScopeForPath(pathname: string): SettingsScope {
  if (pathname === "/calculator" || pathname.startsWith("/calculator/")) return "calculator";
  if (pathname === "/dmm" || pathname.startsWith("/dmm/")) return "dmm";
  return "function-generator"; // Includes the current function-generator home route.
}

// Widen the literal config's fields to the public UI contract.
export function getSettingsDefinition(scope: SettingsScope): SettingsDefinition {
  return settingsConfig[scope];
}
