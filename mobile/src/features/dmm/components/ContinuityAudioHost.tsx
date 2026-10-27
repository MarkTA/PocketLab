import { useEffect, useState } from "react";
import { usePathname } from "expo-router";
import { AppState } from "react-native";
import { usePocketLabDevice } from "../../device/DeviceProvider";
import { ContinuityAudio } from "./ContinuityAudio";

/**
 * Own the native audio graph at the app root, NOT inside a navigated screen.
 * Initialize lazily on first continuity use, then keep the graph mounted
 * until the app root itself unmounts. All other conditions only control gain.
 * This avoids repeatedly closing/reopening Android's audio stream.
 */
export function ContinuityAudioHost() {
  const { state, dmmState, continuityActive } = usePocketLabDevice();
  const pathname = usePathname();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active" || AppState.currentState == null
  );
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", state => {
      setAppActive(state === "active");
    });
    return () => sub.remove();
  }, []);

  const onMeterScreen = pathname === "/dmm" || pathname.startsWith("/dmm/");
  const enabled = state.connected && dmmState?.mode === "CONTINUITY" &&
    onMeterScreen && appActive;

  useEffect(() => {
    if (!enabled || initialized) return;

    // Defer lazy initialization until after the current render commits.
    // Keep the graph mounted thereafter; mode changes only control gain.
    const timer = setTimeout(() => setInitialized(true), 0);
    return () => clearTimeout(timer);
  }, [enabled, initialized]);

  if (!initialized) return null;
  return <ContinuityAudio active={continuityActive} enabled={enabled} />;
}
