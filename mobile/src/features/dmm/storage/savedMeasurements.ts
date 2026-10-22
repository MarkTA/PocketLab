import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pocketlab.saved-measurements.v1";

export type SavedMeasurement = {
  id: string;
  kind: "voltage" | "resistance";
  value: number; // SI base unit: volts or ohms, never a formatted string
  unit: "V" | "Ω";
  measuredAt: number;
  savedAt: number;
  source: "live" | "cursor";
  averagingWindowMs?: number;
  // A cursor can represent a point interpolated between raw samples.
  interpolated?: boolean;
};

let writeQueue: Promise<unknown> = Promise.resolve();

export async function listSavedMeasurements(): Promise<SavedMeasurement[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid saved measurement data");
  return parsed as SavedMeasurement[];
}

export function saveMeasurement(
  input: Omit<SavedMeasurement, "id" | "savedAt">
): Promise<SavedMeasurement> {
  if (!Number.isFinite(input.value) || !Number.isFinite(input.measuredAt)) {
    return Promise.reject(new Error("Invalid measurement"));
  }
  const item: SavedMeasurement = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    savedAt: Date.now(),
  };
  const pending = writeQueue.then(async () => {
    const existing = await listSavedMeasurements();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...existing]));
    return item;
  });
  writeQueue = pending.catch(() => undefined);
  return pending;
}

export function deleteSavedMeasurement(id: string): Promise<void> {
  const pending = writeQueue.then(async () => {
    const existing = await listSavedMeasurements();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter(item => item.id !== id)));
  });
  writeQueue = pending.catch(() => undefined);
  return pending;
}
