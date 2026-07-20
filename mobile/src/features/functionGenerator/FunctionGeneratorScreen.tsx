/* src/features/functionGenerator/FunctionGeneratorScreen.tsx */

import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";

import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";

import { FullscreenWaveformPlot } from "./FullscreenWaveformPlot";
import {
  FunctionGeneratorSettingsPager,
  type EditableGeneratorSettings,
} from "./FunctionGeneratorSettingsPager";
import { OutputControlFooter } from "./OutputControlFooter";
import { useFunctionGenerator } from "./useFunctionGenerator";
import { WaveformPreview } from "./WaveformPreview";

export function FunctionGeneratorScreen() {
  const generator = useFunctionGenerator();
  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);
  const [fullscreenPlotVisible, setFullscreenPlotVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { state, reconnecting } = generator;

  const [previewSettings, setPreviewSettings] = useState<EditableGeneratorSettings>({
    waveform: state.waveform,
    frequencyHz: state.frequencyHz,
    amplitudeVpp: state.amplitudeVpp,
    offsetV: generator.offsetV,
  });

  useEffect(() => {
    setPreviewSettings({
      waveform: state.waveform,
      frequencyHz: state.frequencyHz,
      amplitudeVpp: state.amplitudeVpp,
      offsetV: generator.offsetV,
    });
  }, [generator.offsetV, state.amplitudeVpp, state.frequencyHz, state.waveform]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const commitSettings = (settings: EditableGeneratorSettings) => {
    void generator.applySettings(settings).catch(() => {
      setPreviewSettings({
        waveform: state.waveform,
        frequencyHz: state.frequencyHz,
        amplitudeVpp: state.amplitudeVpp,
        offsetV: generator.offsetV,
      });
    });
  };

  return (
    <>
      <Screen
        header={
          <ScreenHeader
            title="PocketLab"
            subtitle="Function Generator"
            right={
              <DeviceStatusCard
                connected={state.connected}
                reconnecting={reconnecting}
                deviceName={state.deviceName}
                onPress={() => {
                  setDeviceSheetVisible(true);
                }}
              />
            }
          />
        }
        footer={
          <OutputControlFooter
            connected={generator.connected}
            running={state.outputEnabled}
            pending={generator.outputPending}
            onPress={() => {
              void generator.toggleOutput();
            }}
          />
        }
      >
        <Card style={styles.previewCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open fullscreen waveform plot"
            onPress={() => {
              setFullscreenPlotVisible(true);
            }}
          >
            <WaveformPreview
              {...previewSettings}
              outputEnabled={state.outputEnabled}
              chartHeight={keyboardVisible ? 130 : 240}
            />
            <Text variant="labelSmall" style={styles.expandHint}>
              Tap plot to expand
            </Text>
          </Pressable>
        </Card>

        <Card>
          <FunctionGeneratorSettingsPager
            settings={previewSettings}
            onPreviewChange={setPreviewSettings}
            onCommit={commitSettings}
            disabled={!generator.connected || generator.settingsPending}
          />
        </Card>

        {generator.settingsError ? (
          <Text variant="bodySmall" style={styles.error}>
            {generator.settingsError}
          </Text>
        ) : null}
      </Screen>

      <ScanDeviceSheet
        visible={deviceSheetVisible}
        onDismiss={() => {
          setDeviceSheetVisible(false);
        }}
      />

      <FullscreenWaveformPlot
        visible={fullscreenPlotVisible}
        {...previewSettings}
        outputEnabled={state.outputEnabled}
        onDismiss={() => {
          setFullscreenPlotVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    marginTop: 8,
  },
  expandHint: {
    position: "absolute",
    right: 12,
    top: 8,
    opacity: 0.58,
  },
  error: {
    color: "#B3261E",
    paddingHorizontal: 4,
  },
});