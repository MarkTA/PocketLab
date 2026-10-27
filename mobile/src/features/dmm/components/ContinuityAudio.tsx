import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { AudioContext } from "react-native-audio-api";
import { bleDiagnostic } from "../../device/bleClient";

type Props = { active: boolean; enabled: boolean };

const FREQUENCY_HZ = 3000;
const VOLUME = 0.08;
const RAMP_SECONDS = 0.004;

/** An app-lifetime tone generator; ON/OFF adjusts gain, never oscillator start. */
export function ContinuityAudio({ active, enabled }: Props) {
  const requestedActive = useRef(false);
  const enabledRef = useRef(enabled);
  const foreground = useRef(AppState.currentState === "active" || AppState.currentState == null);
  const audio = useRef<{
    context: AudioContext;
    oscillator: ReturnType<AudioContext["createOscillator"]>;
    gain: ReturnType<AudioContext["createGain"]>;
  } | null>(null);

  const updateGain = useCallback(() => {
    const graph = audio.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const target = requestedActive.current && foreground.current ? VOLUME : 0;
    graph.gain.gain.cancelAndHoldAtTime(now);
    graph.gain.gain.linearRampToValueAtTime(target, now + RAMP_SECONDS);
  }, []);

  useEffect(() => {
    console.log("[AUDIO] Graph mounting");

    let disposed = false;
    let context: AudioContext | null = null;
    let oscillator: ReturnType<AudioContext["createOscillator"]> | null = null;

    const initializeAudio = async () => {
      if (disposed) return;

      try {
        context = new AudioContext();

        oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = FREQUENCY_HZ;

        gain.gain.value = 0;

        oscillator.connect(gain);
        gain.connect(context.destination);

        audio.current = { context, oscillator, gain };

        oscillator.start();

        console.log("[AUDIO] Initial context state:", context.state);

        if (context.state !== "running") {
          await context.resume();
        }

        if (disposed) return;

        console.log("[AUDIO] Context running:", context.state);
        updateGain();

      } catch (error) {
        if (!disposed) {
          console.error("[AUDIO] Initialization failed:", error);
        }
      }
    };

    const timer = setTimeout(() => {
      void initializeAudio();
    }, 500);

    const sub = AppState.addEventListener("change", state => {
      foreground.current = state === "active";
      updateGain();
    });

    return () => {
      console.log("[AUDIO] Graph unmounting");

      disposed = true;

      clearTimeout(timer);
      sub.remove();

      requestedActive.current = false;

      const graph = audio.current;
      audio.current = null;

      if (graph) {
        graph.gain.gain.value = 0;

        try {
          graph.oscillator.stop();
        } catch {
          // Oscillator may already be stopped.
        }

        void graph.context.close().catch(error => {
          console.warn("[AUDIO] Close failed:", error);
        });
      }
    };
  }, [updateGain]);

  // Keep the direct BLE callback's enable guard synchronized after React commits.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      requestedActive.current = false;
      updateGain();
    }
  }, [enabled, updateGain]);

  // Fast BLE path: bypass React state propagation for tone gain changes.
  // The provider still receives the events for its UI indicator.
  useEffect(() => {
    return bleDiagnostic.onContinuityChanged((nextActive) => {
      requestedActive.current = enabledRef.current && nextActive;
      updateGain();
    });
  }, [updateGain]);

  // Keep the existing state-based path for mode/disconnect/navigation safety.
  useEffect(() => {
    requestedActive.current = enabled && active;
    updateGain();
  }, [active, enabled, updateGain]);

  return null;
}
