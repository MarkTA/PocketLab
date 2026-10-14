/* src/features/dmm/hooks/useContinuousDmm.ts */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DmmMode, DmmReading, DmmState } from "../../device/deviceTypes";

/** A timestamp records when the BLE measurement arrived at the app. */
export type DmmSample = {
  timestamp: number;
  mode: DmmMode;
  value: number | null;
  unit: DmmReading["unit"];
  overload: boolean;
};

type Options = {
  connected: boolean;
  enabled: boolean;
  mode: DmmMode | null;
  requestDmmReading: () => Promise<DmmReading>;
  setDmmMode: (mode: DmmMode) => Promise<DmmState>;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 200; // Aim for 5 readings per second.
const HISTORY_MS = 60_000;
const MAX_SAMPLES = 600;
const RETRY_DELAY_MS = 1_000;

/**
 * Sequential, response-driven polling. Never starts another DMM:READ while
 * one is outstanding. The next timer is scheduled only after a response/error.
 *
 * The provider still owns device state; this hook owns screen polling/history.
 */
export function useContinuousDmm({
  connected,
  enabled,
  mode,
  requestDmmReading,
  setDmmMode,
  intervalMs = DEFAULT_INTERVAL_MS,
}: Options) {
  const [paused, setPaused] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [readingPending, setReadingPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedSamples, setStoredSamples] = useState<DmmSample[]>([]);

  // Synchronous guards close the gap before React applies a state change.
  const generationRef = useRef(0);
  const switchingRef = useRef(false);
  const inFlightRef = useRef<Promise<DmmReading> | null>(null);

  // A new connection is a new measurement session. Never carry readings or
  // graph samples from the previous BLE connection into the next one.
  useEffect(() => {
    if (connected) {
      return;
    }
    const timer = setTimeout(() => {
      setStoredSamples((previous) => (previous.length ? [] : previous));
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [connected]);

  const recordReading = useCallback((reading: DmmReading, readMode: DmmMode) => {
    // Never plot/display a voltage reading under resistance, or vice versa.
    if ((readMode === "VOLTAGE" && reading.unit !== "V") ||
        (readMode === "RESISTANCE" && reading.unit !== "OHM")) {
      throw new Error(`Unexpected ${reading.unit} reading in ${readMode} mode.`);
    }

    const now = Date.now();
    const sample: DmmSample = {
      timestamp: now,
      mode: readMode,
      value: reading.value,
      unit: reading.unit,
      overload: reading.overload,
    };

    setStoredSamples((previous) => {
      const recent = previous.filter(
        (item) => item.mode === readMode && item.timestamp >= now - HISTORY_MS
      );
      return [...recent, sample].slice(-MAX_SAMPLES);
    });
  }, []);

  const takeReading = useCallback(
    async (readMode: DmmMode, isCurrent: () => boolean): Promise<boolean> => {
      // Another operation may be finishing after pause/resume or a mode change.
      // Do not queue up another request behind it.
      if (inFlightRef.current) {
        return false;
      }

      const pending = requestDmmReading();
      inFlightRef.current = pending;
      setReadingPending(true);

      try {
        const reading = await pending;
        if (isCurrent()) {
          recordReading(reading, readMode);
          setError(null);
        }
        return true;
      } catch (readError) {
        if (isCurrent()) {
          const message =
            readError instanceof Error ? readError.message : "Unable to read measurement.";
          console.warn("[DMM] Continuous reading failed:", readError);
          setError(message);
        }
        return false;
      } finally {
        if (inFlightRef.current === pending) {
          inFlightRef.current = null;
        }
        setReadingPending(false);
      }
    },
    [recordReading, requestDmmReading]
  );

  useEffect(() => {
    if (!enabled || paused || switchingMode || mode === null) {
      return;
    }

    const generation = ++generationRef.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const active = () =>
      !stopped && generationRef.current === generation && !switchingRef.current;

    const poll = async () => {
      if (!active()) {
        return;
      }

      // If pause was toggled during an in-flight read, wait for it to finish
      // rather than colliding with the BLE client's single-request guard.
      const previous = inFlightRef.current;
      if (previous) {
        try {
          await previous;
        } catch {
          // A previous failure should not prevent future attempts.
        }
        if (!active()) {
          return;
        }
      }

      const startedAt = Date.now();
      const succeeded = await takeReading(mode, active);
      if (!active()) {
        return;
      }

      const elapsed = Date.now() - startedAt;
      const wait = succeeded ? Math.max(0, intervalMs - elapsed) : RETRY_DELAY_MS;
      timer = setTimeout(() => void poll(), wait);
    };

    // Defer the first state update so the effect doesn't synchronously set state.
    timer = setTimeout(() => void poll(), 0);

    return () => {
      stopped = true;
      generationRef.current += 1;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [enabled, intervalMs, mode, paused, switchingMode, takeReading]);

  /** Stop future polling and finish the current request before showing
   * connection controls, so POWER:SHUTDOWN won't collide with DMM:READ. */
  const stopForDeviceSheet = useCallback(async (): Promise<void> => {
    generationRef.current += 1;
    const pending = inFlightRef.current;
    if (pending) {
      try {
        await pending;
      } catch {
        // A failed measurement should not block device management.
      }
    }
  }, []);

  const changeMode = useCallback(
    async (nextMode: DmmMode): Promise<void> => {
      if (!enabled || switchingRef.current || mode === nextMode) {
        return;
      }

      switchingRef.current = true;
      generationRef.current += 1;
      setSwitchingMode(true);
      setError(null);

      try {
        const pending = inFlightRef.current;
        if (pending) {
          try {
            await pending;
          } catch {
            // Switching modes is still allowed after a failed reading.
          }
        }

        await setDmmMode(nextMode);
        setStoredSamples([]);
      } catch (modeError) {
        setError(modeError instanceof Error ? modeError.message : "Unable to switch mode.");
        console.error("[DMM] Mode switch failed:", modeError);
      } finally {
        switchingRef.current = false;
        setSwitchingMode(false);
      }
    },
    [enabled, mode, setDmmMode]
  );

  const readOnce = useCallback(async (): Promise<void> => {
    if (!enabled || !paused || switchingRef.current || mode === null || inFlightRef.current) {
      return;
    }
    const generation = generationRef.current;
    await takeReading(
      mode,
      () => generationRef.current === generation && !switchingRef.current
    );
  }, [enabled, mode, paused, takeReading]);

  const samples = useMemo(
    () => (enabled && mode ? storedSamples.filter((sample) => sample.mode === mode) : []),
    [enabled, mode, storedSamples]
  );

  const latest = samples.length > 0 ? samples[samples.length - 1] : null;
  const reading: DmmReading | null = latest
    ? { value: latest.value, unit: latest.unit, overload: latest.overload }
    : null;

  return {
    reading,
    samples,
    error,
    paused,
    setPaused,
    readingPending,
    switchingMode,
    polling: enabled && !paused && !switchingMode,
    changeMode,
    readOnce,
    stopForDeviceSheet,
  };
}
