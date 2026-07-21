/* src/features/functionGenerator/FunctionGeneratorScreen.tsx */

import React, { useEffect, useState } from "react";
import { Keyboard, StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";

import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { state, reconnecting } = generator;

  const [previewSettings, setPreviewSettings] = useState<EditableGeneratorSettings>({
    waveform: state.waveform,
    frequencyHz: state.frequencyHz,
    amplitudeVpp: state.amplitudeVpp,
    offsetV: generator.offsetV,
  });

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

  const settingsMatch =
    generator.connected &&
    previewSettings.waveform === state.waveform &&
    nearlyEqual(previewSettings.frequencyHz, state.frequencyHz, 0.5) &&
    nearlyEqual(previewSettings.amplitudeVpp, state.amplitudeVpp, 0.005) &&
    nearlyEqual(previewSettings.offsetV, generator.offsetV, 0.005);

  const deviceSettingsText = generator.connected
    ? `Device: ${formatWaveform(state.waveform)} · ${formatFrequency(
        state.frequencyHz
      )} · ${state.amplitudeVpp.toFixed(2)} Vpp · ${generator.offsetV.toFixed(2)} V offset`
    : "Device: Not connected";

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
            settingsMatch={settingsMatch}
            settingsPending={generator.settingsPending}
            outputPending={generator.outputPending}
            onSendUpdate={() => {
              void generator.applySettings(previewSettings).catch(() => undefined);
            }}
            onToggleOutput={() => {
              void generator.toggleOutput();
            }}
          />
        }
      >
        <Card style={styles.previewCard}>
          <Text variant="bodySmall" style={styles.deviceSettings}>
            {deviceSettingsText}
          </Text>
          <WaveformPreview
            {...previewSettings}
            matchesDeviceSettings={settingsMatch}
            chartHeight={keyboardVisible ? 130 : 240}
          />
        </Card>

        <Card>
          <FunctionGeneratorSettingsPager
            settings={previewSettings}
            onPreviewChange={setPreviewSettings}
            disabled={generator.settingsPending}
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
    </>
  );
}

function nearlyEqual(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

function formatWaveform(waveform: EditableGeneratorSettings["waveform"]): string {
  const labels: Record<EditableGeneratorSettings["waveform"], string> = {
    sine: "Sine",
    square: "Square",
    triangle: "Triangle",
    rampUp: "Ramp Up",
    rampDown: "Ramp Down",
    dc: "DC",
  };

  return labels[waveform];
}

function formatFrequency(frequencyHz: number): string {
  if (frequencyHz >= 1_000_000) {
    return `${frequencyHz / 1_000_000} MHz`;
  }

  if (frequencyHz >= 1_000) {
    return `${frequencyHz / 1_000} kHz`;
  }

  return `${frequencyHz} Hz`;
}

const styles = StyleSheet.create({
  previewCard: {
    marginTop: 8,
  },
  deviceSettings: {
    paddingHorizontal: 16,
    paddingTop: 12,
    opacity: 0.72,
  },
  error: {
    color: "#B3261E",
    paddingHorizontal: 4,
  },
});
