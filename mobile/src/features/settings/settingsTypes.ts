export type SettingValue = string | number | boolean;
export type SettingOption = { label: string; value: string | number };
export type SettingField =
  | { id: string; label: string; type: "switch"; description?: string }
  | { id: string; label: string; type: "select" | "segmented"; options: readonly SettingOption[]; description?: string }
  | { id: string; label: string; type: "number"; min?: number; max?: number; step?: number; description?: string };
export type SettingsDefinition = { id: string; title: string; fields: readonly SettingField[] };
