import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type NumberFormat = "auto" | "decimal" | "scientific" | "engineering";
export type CalculatorPreferences = {
  significantFigures: number;
  numberFormat: NumberFormat;
  useSIPrefixes: boolean;
};
export const DEFAULT_CALCULATOR_PREFERENCES: CalculatorPreferences = {
  significantFigures: 4,
  numberFormat: "auto",
  useSIPrefixes: true,
};
const STORAGE_KEY = "@pocketlab/calculator/preferences/v1";
const formats: readonly NumberFormat[] = ["auto", "decimal", "scientific", "engineering"];
function validate(value: unknown): CalculatorPreferences {
  const v = value && typeof value === "object" ? value as Partial<CalculatorPreferences> : {};
  return {
    significantFigures: typeof v.significantFigures === "number" && Number.isInteger(v.significantFigures)
      ? Math.min(8, Math.max(2, v.significantFigures)) : 4,
    numberFormat: formats.includes(v.numberFormat as NumberFormat) ? v.numberFormat as NumberFormat : "auto",
    useSIPrefixes: typeof v.useSIPrefixes === "boolean" ? v.useSIPrefixes : true,
  };
}
type ContextValue = {
  preferences: CalculatorPreferences;
  setPreferences: (updates: Partial<CalculatorPreferences>) => void;
};
const PreferencesContext = createContext<ContextValue | null>(null);
export function CalculatorPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setCurrent] = useState(DEFAULT_CALCULATOR_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (active && raw) setCurrent(validate(JSON.parse(raw) as unknown)); })
      .catch(() => { /* Keep defaults if storage is unavailable or corrupted. */ })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (loaded) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)).catch(() => {});
  }, [preferences, loaded]);
  const context = useMemo<ContextValue>(() => ({
    preferences,
    setPreferences: updates => setCurrent(prev => validate({ ...prev, ...updates })),
  }), [preferences]);
  return <PreferencesContext.Provider value={context}>{children}</PreferencesContext.Provider>;
}
export function useCalculatorPreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("Wrap calculator screens in CalculatorPreferencesProvider");
  return context;
}
