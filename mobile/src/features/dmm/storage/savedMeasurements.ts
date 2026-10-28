/** Local-first measurement persistence. Public API remains compatible with DMM and calculators. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

const LEGACY_KEY = "pocketlab.saved-measurements.v1";
const DATABASE_NAME = "pocketlab.db";
const GENERAL_SET_ID = "general-measurements";

export type SavedMeasurement = {
  id: string;
  setId?: string;
  kind: "voltage" | "resistance";
  value: number; // full-precision processed/calibrated value in SI units
  unit: "V" | "Ω";
  measuredAt: number;
  savedAt: number;
  source: "live" | "cursor";
  averagingWindowMs?: number;
  interpolated?: boolean;
  captureMetadata?: Record<string, unknown>;
  displayMetadata?: Record<string, unknown>;
  label?: string;
  notes?: string;
};

export type MeasurementSet = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

type MeasurementRow = {
  id: string; set_id: string; kind: "voltage" | "resistance";
  value: number; unit: "V" | "Ω"; measured_at: number; saved_at: number;
  source: "live" | "cursor"; averaging_window_ms: number | null;
  interpolated: number; capture_metadata: string | null; display_metadata: string | null;
  label: string | null; notes: string | null;
};

type SetRow = { id: string; name: string; created_at: number; updated_at: number };

function toMeasurement(row: MeasurementRow): SavedMeasurement {
  return {
    id: row.id, setId: row.set_id, kind: row.kind, value: row.value,
    unit: row.unit, measuredAt: row.measured_at, savedAt: row.saved_at,
    source: row.source,
    ...(row.averaging_window_ms !== null ? { averagingWindowMs: row.averaging_window_ms } : {}),
    ...(row.interpolated ? { interpolated: true } : {}),
    ...(row.capture_metadata ? { captureMetadata: JSON.parse(row.capture_metadata) as Record<string, unknown> } : {}),
    ...(row.display_metadata ? { displayMetadata: JSON.parse(row.display_metadata) as Record<string, unknown> } : {}),
    ...(row.label !== null ? { label: row.label } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
      if ((version?.user_version ?? 0) < 1) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS measurement_sets (
            id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS measurements (
            id TEXT PRIMARY KEY NOT NULL,
            set_id TEXT NOT NULL REFERENCES measurement_sets(id),
            kind TEXT NOT NULL CHECK(kind IN ('voltage','resistance')),
            value REAL NOT NULL, unit TEXT NOT NULL,
            measured_at INTEGER NOT NULL, saved_at INTEGER NOT NULL,
            source TEXT NOT NULL, averaging_window_ms INTEGER,
            interpolated INTEGER NOT NULL DEFAULT 0,
            capture_metadata TEXT, display_metadata TEXT, label TEXT, notes TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_measurements_set_date ON measurements(set_id, saved_at DESC);
          CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        `);
        await db.execAsync("PRAGMA user_version = 1");
      }
      const now = Date.now();
      await db.runAsync(
        "INSERT OR IGNORE INTO measurement_sets(id,name,created_at,updated_at) VALUES(?,?,?,?)",
        GENERAL_SET_ID, "General Measurements", now, now
      );
      await db.runAsync(
        "INSERT OR IGNORE INTO app_settings(key,value) VALUES('active_measurement_set_id',?)",
        GENERAL_SET_ID
      );
      // One-time import. Legacy data remains untouched until a successful transaction.
      const migrated = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key='legacy_measurements_imported'"
      );
      if (!migrated) {
        const raw = await AsyncStorage.getItem(LEGACY_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw new Error("Invalid legacy saved measurement data");
        await db.withExclusiveTransactionAsync(async tx => {
          for (const entry of parsed) {
            const item = entry as SavedMeasurement;
            if (!item || !Number.isFinite(item.value) || !Number.isFinite(item.measuredAt) ||
              !Number.isFinite(item.savedAt) || !["voltage", "resistance"].includes(item.kind)) {
              throw new Error("Invalid legacy saved measurement entry");
            }
            await tx.runAsync(`INSERT OR IGNORE INTO measurements
              (id,set_id,kind,value,unit,measured_at,saved_at,source,averaging_window_ms,interpolated)
              VALUES(?,?,?,?,?,?,?,?,?,?)`,
              item.id, GENERAL_SET_ID, item.kind, item.value, item.unit,
              item.measuredAt, item.savedAt, item.source,
              item.averagingWindowMs ?? null, item.interpolated ? 1 : 0);
          }
          await tx.runAsync(
            "INSERT INTO app_settings(key,value) VALUES('legacy_measurements_imported','1')"
          );
        });
      }
      return db;
    })().catch(error => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

/** Initialize database and migrate any AsyncStorage measurements. Safe to call more than once. */
export async function initializeMeasurementStorage(): Promise<void> { await openDatabase(); }

export async function listSavedMeasurements(setId?: string): Promise<SavedMeasurement[]> {
  const db = await openDatabase();
  const rows = setId
    ? await db.getAllAsync<MeasurementRow>("SELECT * FROM measurements WHERE set_id=? ORDER BY saved_at DESC, id DESC", setId)
    : await db.getAllAsync<MeasurementRow>("SELECT * FROM measurements ORDER BY saved_at DESC, id DESC");
  return rows.map(toMeasurement);
}

export async function getSavedMeasurement(id: string): Promise<SavedMeasurement | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<MeasurementRow>("SELECT * FROM measurements WHERE id=?", id);
  return row ? toMeasurement(row) : null;
}

export async function listMeasurementSets(): Promise<MeasurementSet[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<SetRow>(
    "SELECT * FROM measurement_sets ORDER BY updated_at DESC, name ASC"
  );
  return rows.map(row => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function getActiveMeasurementSet(): Promise<MeasurementSet> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<SetRow>(`SELECT s.* FROM measurement_sets s
    JOIN app_settings a ON a.value=s.id WHERE a.key='active_measurement_set_id'`);
  if (row) return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
  await setActiveMeasurementSet(GENERAL_SET_ID);
  return (await listMeasurementSets()).find(item => item.id === GENERAL_SET_ID)!;
}

export async function setActiveMeasurementSet(setId: string): Promise<void> {
  const db = await openDatabase();
  const result = await db.runAsync(
    "UPDATE app_settings SET value=? WHERE key='active_measurement_set_id' AND EXISTS (SELECT 1 FROM measurement_sets WHERE id=?)",
    setId, setId
  );
  if (!result.changes) throw new Error("Measurement set not found");
}

export async function createMeasurementSet(name: string): Promise<MeasurementSet> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Measurement set name is required");
  const db = await openDatabase();
  const now = Date.now();
  const set = { id: Crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now };
  await db.runAsync("INSERT INTO measurement_sets(id,name,created_at,updated_at) VALUES(?,?,?,?)",
    set.id, set.name, set.createdAt, set.updatedAt);
  return set;
}

export async function saveMeasurement(
  input: Omit<SavedMeasurement, "id" | "savedAt">
): Promise<SavedMeasurement> {
  if (!Number.isFinite(input.value) || !Number.isFinite(input.measuredAt)) {
    throw new Error("Invalid measurement");
  }
  const db = await openDatabase();
  const activeSet = await getActiveMeasurementSet();
  const item: SavedMeasurement = {
    ...input, id: Crypto.randomUUID(), setId: input.setId ?? activeSet.id, savedAt: Date.now(),
  };
  await db.runAsync(`INSERT INTO measurements
    (id,set_id,kind,value,unit,measured_at,saved_at,source,averaging_window_ms,interpolated,capture_metadata,display_metadata,label,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    item.id, item.setId!, item.kind, item.value, item.unit, item.measuredAt, item.savedAt,
    item.source, item.averagingWindowMs ?? null, item.interpolated ? 1 : 0,
    item.captureMetadata ? JSON.stringify(item.captureMetadata) : null,
    item.displayMetadata ? JSON.stringify(item.displayMetadata) : null,
    item.label ?? null, item.notes ?? null
  );
  return item;
}

/** Moves exactly one measurement and activates the destination for subsequent saves. */
export async function moveSavedMeasurement(id: string, setId: string): Promise<void> {
  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async tx => {
    const result = await tx.runAsync(
      "UPDATE measurements SET set_id=? WHERE id=?", setId, id
    );
    if (!result.changes) throw new Error("Measurement not found");
    await tx.runAsync("UPDATE measurement_sets SET updated_at=? WHERE id=?", Date.now(), setId);
    await tx.runAsync("UPDATE app_settings SET value=? WHERE key='active_measurement_set_id'", setId);
  });
}

export async function deleteSavedMeasurement(id: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync("DELETE FROM measurements WHERE id=?", id);
}

/** Editable organization metadata; the captured value and timestamp never change. */
export async function updateMeasurementDetails(id: string, label: string, notes: string): Promise<void> {
  const db = await openDatabase();
  const result = await db.runAsync("UPDATE measurements SET label=?, notes=? WHERE id=?", label.trim() || null, notes.trim() || null, id);
  if (!result.changes) throw new Error("Measurement not found");
}
