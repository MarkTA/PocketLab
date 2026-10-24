import { useEffect, useRef, useState } from "react";

/** Throttle only the displayed reading. Sampling, graphing and saving remain live. */
export function useDisplayRefresh<T>(
  latestValue: T,
  intervalMs: number,
  resetKey: string,
): T {
  const latest = useRef(latestValue);
  latest.current = latestValue;

  const [published, setPublished] = useState(latestValue);
  const previousResetKey = useRef(resetKey);

  // A changed mode, sensitivity or cursor should be visible right away.
  const reset = previousResetKey.current !== resetKey;
  if (reset) previousResetKey.current = resetKey;

  useEffect(() => {
    const timer = setInterval(() => {
      setPublished(latest.current);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return reset ? latestValue : published;
}
