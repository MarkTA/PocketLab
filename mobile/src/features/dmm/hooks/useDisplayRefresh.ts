import { useEffect, useRef, useState } from "react";

/** Throttle the numeric readout only; BLE sampling and graphs remain live. */
export function useDisplayRefresh<T>(
  latestValue: T,
  intervalMs: number,
  resetKey: string,
): T {
  const latest = useRef(latestValue);
  const [published, setPublished] = useState(latestValue);

  // Keep the newest reading available to the timer without changing its cadence.
  useEffect(() => {
    latest.current = latestValue;
  }, [latestValue]);

  // Publish the current reading at the requested display rate.
  useEffect(() => {
    const timer = setInterval(() => {
      setPublished(latest.current);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  // Refresh promptly when the measurement context changes (mode/cursor/etc.).
  // Scheduling the update avoids a synchronous state update inside an effect.
  useEffect(() => {
    const timer = setTimeout(() => setPublished(latest.current), 0);
    return () => clearTimeout(timer);
  }, [resetKey]);

  return published;
}
