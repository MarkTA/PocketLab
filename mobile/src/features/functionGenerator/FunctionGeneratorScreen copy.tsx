/* src/features/functionGenerator/FunctionGeneratorScreen.tsx */

import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { Card, Portal } from "react-native-paper";

import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";

import { FunctionGeneratorSettingsDialog } from "./FunctionGeneratorSettingsDialog";
import { FunctionGeneratorSettingsSummary } from "./FunctionGeneratorSettingsSummary";
import { OutputControlFooter } from "./OutputControlFooter";
import { useFunctionGenerator } from "./useFunctionGenerator";
import { useFunctionGeneratorSettingsEditor } from "./useFunctionGeneratorSettingsEditor";
import { WaveformPreview } from "./WaveformPreview";

export function FunctionGeneratorScreen() {
  const generator = useFunctionGenerator();
  const settingsEditor = useFunctionGeneratorSettingsEditor(generator);

  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);

  const { state, reconnecting } = generator;

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
          <WaveformPreview {...generator.previewProps} />
        </Card>

        <FunctionGeneratorSettingsSummary
          waveform={state.waveform}
          frequencyHz={state.frequencyHz}
          amplitudeVpp={state.amplitudeVpp}
          offsetV={generator.offsetV}
          disabled={!generator.connected || generator.settingsPending}
          onPress={settingsEditor.open}
        />
      </Screen>

      <ScanDeviceSheet
        visible={deviceSheetVisible}
        onDismiss={() => {
          setDeviceSheetVisible(false);
        }}
      />

      <Portal>
        <FunctionGeneratorSettingsDialog
          visible={settingsEditor.visible}
          draft={settingsEditor.draft}
          applying={settingsEditor.applying}
          errorMessage={settingsEditor.errorMessage}
          onChange={settingsEditor.updateField}
          onDismiss={settingsEditor.close}
          onApply={() => {
            void settingsEditor.apply();
          }}
        />
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    marginTop: 8,
  },
});
