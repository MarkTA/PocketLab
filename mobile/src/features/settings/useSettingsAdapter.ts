import { useCallback } from "react";
import { useCalculatorPreferences, type CalculatorPreferences } from "@/features/calculator/preferences/calculatorPreferences";
import { useDmmPreferences, type DmmPreferences } from "@/features/dmm/preferences/DmmPreferencesProvider";
import { settingsConfig, type SettingsScope } from "./settings.config";
import type { SettingField, SettingValue } from "./settingsTypes";

// Connect the shared settings UI to existing, persisted feature preferences.
// Fields with no matching preference are intentionally ignored.
export function useSettingsAdapter(scope: SettingsScope) {
  const calculator = useCalculatorPreferences();
  const dmm = useDmmPreferences();

  const values: Record<string, SettingValue> =
    scope === "calculator" ? { ...calculator.preferences } :
    scope === "dmm" ? { ...dmm.preferences } : {};

  const update = useCallback((id: string, value: SettingValue) => {
    const fields: readonly SettingField[] = settingsConfig[scope].fields;

    const field = fields.find(item => item.id === id);
    if (!field) return;

    // Validate at the UI boundary. The providers independently validate
    // restored AsyncStorage values and merged updates.
    if (field.type === "switch" && typeof value !== "boolean") return;
    if ((field.type === "select" || field.type === "segmented") &&
      !field.options.some(option => option.value === value)) return;
    if (field.type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value) ||
       (field.min !== undefined && value < field.min) ||
       (field.max !== undefined && value > field.max))) return;

    if (scope === "calculator" && Object.hasOwn(calculator.preferences, id)) {
      calculator.setPreferences({ [id]: value } as Partial<CalculatorPreferences>);
    } else if (scope === "dmm" && Object.hasOwn(dmm.preferences, id)) {
      dmm.setPreferences({ [id]: value } as Partial<DmmPreferences>);
    }
  }, [scope, calculator, dmm]);

  return { values, update };
}
