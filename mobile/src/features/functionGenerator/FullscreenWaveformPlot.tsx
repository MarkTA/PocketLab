import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { IconButton, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Waveform } from "../../types/pocketLab";
import { WaveformPreview, type WaveformViewport } from "./WaveformPreview";

type Props = {
  visible: boolean;
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  outputEnabled: boolean;
  onDismiss: () => void;
};

const DEFAULT_VIEWPORT: WaveformViewport = {
  horizontalZoom: 1,
  verticalZoom: 1,
  horizontalPan: 0,
  verticalPan: 0,
};

export function FullscreenWaveformPlot({
  visible,
  waveform,
  frequencyHz,
  amplitudeVpp,
  offsetV,
  outputEnabled,
  onDismiss,
}: Props) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const viewportRef = useRef(DEFAULT_VIEWPORT);
  const gestureStart = useRef(DEFAULT_VIEWPORT);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const resetViewport = () => {
    setViewport(DEFAULT_VIEWPORT);
  };

  const gestures = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((_event, success) => {
        if (success) {
          resetViewport();
        }
      })
      .runOnJS(true);

    const pinch = Gesture.Pinch()
      .onBegin(() => {
        gestureStart.current = viewportRef.current;
      })
      .onUpdate((event) => {
        const zoom = clamp(gestureStart.current.horizontalZoom * event.scale, 1, 50);

        setViewport((current) => ({
          ...current,
          horizontalZoom: zoom,
          verticalZoom: zoom,
        }));
      })
      .runOnJS(true);

    const pan = Gesture.Pan()
      .minDistance(6)
      .onBegin(() => {
        gestureStart.current = viewportRef.current;
      })
      .onUpdate((event) => {
        setViewport((current) => ({
          ...current,
          horizontalPan: clamp(
            gestureStart.current.horizontalPan - event.translationX / width,
            -10,
            10
          ),
          verticalPan: clamp(
            gestureStart.current.verticalPan + event.translationY / height,
            -10,
            10
          ),
        }));
      })
      .runOnJS(true);

    return Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
  }, [height, width]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <GestureHandlerRootView style={styles.safeArea}>
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
        >
          <View style={styles.toolbar}>
            <IconButton
              icon="close"
              accessibilityLabel="Close fullscreen plot"
              onPress={onDismiss}
            />

            <View style={styles.titleGroup}>
              <Text variant="titleMedium">Signal</Text>
              <Text variant="bodySmall" style={styles.hint}>
                Pinch to zoom · drag to pan · double-tap to reset
              </Text>
            </View>

            <IconButton
              icon="restore"
              accessibilityLabel="Reset plot view"
              onPress={resetViewport}
            />
          </View>

          <GestureDetector gesture={gestures}>
            <View style={styles.plot}>
              <WaveformPreview
                waveform={waveform}
                frequencyHz={frequencyHz}
                amplitudeVpp={amplitudeVpp}
                offsetV={offsetV}
                outputEnabled={outputEnabled}
                fullscreen
                chartHeight={Math.max(260, height - 130)}
                viewport={viewport}
              />
            </View>
          </GestureDetector>

          <View style={styles.scaleReadout} pointerEvents="none">
            <Text variant="labelMedium">{viewport.horizontalZoom.toFixed(1)}× time</Text>
            <Text variant="labelMedium">{viewport.verticalZoom.toFixed(1)}× voltage</Text>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  toolbar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  titleGroup: {
    alignItems: "center",
  },
  hint: {
    opacity: 0.65,
  },
  plot: {
    flex: 1,
    justifyContent: "center",
  },
  scaleReadout: {
    position: "absolute",
    right: 18,
    bottom: 18,
    alignItems: "flex-end",
    opacity: 0.7,
  },
});