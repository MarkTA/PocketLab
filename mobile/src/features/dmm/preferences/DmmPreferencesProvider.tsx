import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AveragingPreset, SensitivityPreset } from "../components/DcVoltageSettings";

export type DmmPreferences = {
  averaging: AveragingPreset;
  sensitivity: SensitivityPreset;
  displayRefreshMs: number;
};

export const DEFAULT_DMM_PREFERENCES: DmmPreferences = {
  averaging: "NORMAL",
  sensitivity: "AUTO",
  displayRefreshMs: 250,
};

const STORAGE_KEY = "@pocketlab/dmm/preferences/v1";
const AVERAGING: readonly AveragingPreset[] = ["FAST", "NORMAL", "STABLE", "PRECISION"];
const REFRESH_INTERVALS = [100, 250, 500, 1000, 2000] as const;
const SENSITIVITY: readonly SensitivityPreset[] = ["AUTO", "HIGH", "LOW"];

function validate(raw: unknown): DmmPreferences {
  const value = raw && typeof raw === "object" ? raw as Partial<DmmPreferences> : {};
  return {
    averaging: AVERAGING.includes(value.averaging as AveragingPreset)
      ? value.averaging as AveragingPreset : DEFAULT_DMM_PREFERENCES.averaging,
    sensitivity: SENSITIVITY.includes(value.sensitivity as SensitivityPreset)
      ? value.sensitivity as SensitivityPreset : DEFAULT_DMM_PREFERENCES.sensitivity,
    displayRefreshMs: REFRESH_INTERVALS.some(ms => ms === value.displayRefreshMs)
      ? value.displayRefreshMs as number : DEFAULT_DMM_PREFERENCES.displayRefreshMs,
  };
}

type DmmPreferencesContextValue = {
  preferences: DmmPreferences;
  setPreferences: (updates: Partial<DmmPreferences>) => void;
  resetPreferences: () => void;
};

const DmmPreferencesContext = createContext<DmmPreferencesContextValue | null>(null);

export function DmmPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setCurrent] = useState<DmmPreferences>(DEFAULT_DMM_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (active && raw) setCurrent(validate(JSON.parse(raw) as unknown));
      })
      .catch(error => console.warn("Unable to load DMM preferences", error))
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      .catch(error => console.warn("Unable to save DMM preferences", error));
  }, [preferences, loaded]);

  const value = useMemo<DmmPreferencesContextValue>(() => ({
    preferences,
    setPreferences: updates => setCurrent(previous => validate({ ...previous, ...updates })),
    resetPreferences: () => setCurrent(DEFAULT_DMM_PREFERENCES),
  }), [preferences]);

  return <DmmPreferencesContext.Provider value={value}>{children}</DmmPreferencesContext.Provider>;
}

export function useDmmPreferences(): DmmPreferencesContextValue {
  const value = useContext(DmmPreferencesContext);
  if (!value) throw new Error("useDmmPreferences requires DmmPreferencesProvider");
  return value;
}
