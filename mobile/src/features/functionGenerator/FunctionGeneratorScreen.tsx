/* src/features/functionGenerator/FunctionGeneratorScreen.tsx */

import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { Button, Card, Dialog, Portal, RadioButton, Text } from "react-native-paper";

import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { NumberEditDialog } from "../../components/ui/NumberEditDialog";
import { SettingRow } from "../../components/ui/SettingRow";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";
import { pocketLabColors } from "@/themes/theme";

import type { Waveform } from "../../types/pocketLab";
import { useFunctionGenerator } from "./useFunctionGenerator";
import { useFunctionGeneratorEditor } from "./useFunctionGeneratorEditor";
import { WaveformIcon } from "./WaveformIcon";
import { WaveformPreview } from "./WaveformPreview";

export function FunctionGeneratorScreen() {
  const generator = useFunctionGenerator();
  const editor = useFunctionGeneratorEditor(generator);

  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);

  const { state, reconnecting, periodMs, offsetV } = generator;

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
                onPress={() => setDeviceSheetVisible(true)}
              />
            }
          />
        }
      >
        <Card style={styles.card}>
          <WaveformPreview {...generator.previewProps} />
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <SettingRow
              icon={
                <WaveformIcon
                  type={state.waveform}
                  size={26}
                  color={pocketLabColors.darkTeal}
                />
              }
              label="Waveform"
              value={formatWaveform(state.waveform)}
              onPress={editor.openWaveformEditor}
              disabled={editor.applying}
            />

            <SettingRow
              icon={<Text style={styles.symbolIcon}>ƒ</Text>}
              label="Frequency"
              value={`${formatNumber(state.frequencyHz)} Hz`}
              onPress={() => editor.openNumberEditor("frequency", state.frequencyHz)}
              disabled={editor.applying}
            />

            <SettingRow
              icon={<Text style={styles.symbolIcon}>T</Text>}
              label="Period"
              value={`${formatNumber(periodMs)} ms`}
              onPress={() => editor.openNumberEditor("period", periodMs)}
              disabled={editor.applying}
            />

            <SettingRow
              icon={<Text style={styles.smallSymbolIcon}>Vpp</Text>}
              label="Amplitude"
              value={`${state.amplitudeVpp.toFixed(2)} Vpp`}
              onPress={() => editor.openNumberEditor("amplitude", state.amplitudeVpp)}
              disabled={editor.applying}
            />

            <SettingRow
              icon={<Text style={styles.smallSymbolIcon}>Vdc</Text>}
              label="Offset"
              value={`${offsetV.toFixed(2)} V`}
              onPress={() => editor.openNumberEditor("offset", offsetV)}
              disabled={editor.applying}
              showDivider={false}
            />

            <Text variant="bodySmall" style={styles.outputStatus}>
              Output is {state.outputEnabled ? "enabled" : "disabled"}
            </Text>

            <Button
              mode="contained"
              disabled={!generator.connected || editor.applying}
              loading={editor.applying}
              onPress={() => {
                void Promise.resolve(generator.toggleOutput());
              }}
              style={[
                styles.outputButton,
                state.outputEnabled ? styles.outputButtonOn : styles.outputButtonOff,
              ]}
              labelStyle={styles.outputButtonLabel}
            >
              {state.outputEnabled ? "TURN OFF OUTPUT" : "TURN ON OUTPUT"}
            </Button>
          </Card.Content>
        </Card>
      </Screen>

      <ScanDeviceSheet
        visible={deviceSheetVisible}
        onDismiss={() => setDeviceSheetVisible(false)}
      />

      <Portal>
        <Dialog
          visible={editor.waveformDialogVisible}
          onDismiss={editor.closeEditor}
          dismissable={!editor.applying}
        >
          <Dialog.Title>Waveform</Dialog.Title>

          <Dialog.Content>
            <RadioButton.Group
              value={state.waveform}
              onValueChange={(value) => {
                void editor.selectWaveform(value as Waveform);
              }}
            >
              <RadioButton.Item label="Sine" value="sine" disabled={editor.applying} />
              <RadioButton.Item
                label="Square"
                value="square"
                disabled={editor.applying}
              />
              <RadioButton.Item
                label="Triangle"
                value="triangle"
                disabled={editor.applying}
              />
              <RadioButton.Item label="DC" value="dc" disabled={editor.applying} />
              <RadioButton.Item
                label="Ramp Up"
                value="rampUp"
                disabled={editor.applying}
              />
              <RadioButton.Item
                label="Ramp Down"
                value="rampDown"
                disabled={editor.applying}
              />
            </RadioButton.Group>

            {editor.errorMessage ? (
              <Text variant="bodySmall" style={styles.errorText}>
                {editor.errorMessage}
              </Text>
            ) : null}
          </Dialog.Content>

          <Dialog.Actions>
            <Button disabled={editor.applying} onPress={editor.closeEditor}>
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>

        <NumberEditDialog
          visible={editor.numberDialogVisible}
          title={editor.editorTitle}
          value={editor.editText}
          limitText={editor.limitText}
          errorMessage={editor.errorMessage}
          applying={editor.applying}
          onChangeText={editor.setEditText}
          onDismiss={editor.closeEditor}
          onApply={() => {
            void editor.applyNumberEdit();
          }}
        />
      </Portal>
    </>
  );
}

function formatWaveform(waveform: Waveform): string {
  const labels: Record<Waveform, string> = {
    sine: "Sine",
    square: "Square",
    triangle: "Triangle",
    dc: "DC",
    rampUp: "Ramp Up",
    rampDown: "Ramp Down",
  };

  return labels[waveform];
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
  },

  symbolIcon: {
    fontSize: 24,
    fontWeight: "700",
    color: pocketLabColors.darkTeal,
  },

  smallSymbolIcon: {
    fontSize: 13,
    fontWeight: "800",
    color: pocketLabColors.darkTeal,
  },

  outputStatus: {
    textAlign: "center",
    marginTop: 18,
    opacity: 0.7,
  },

  outputButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 8,
  },

  outputButtonOn: {
    backgroundColor: pocketLabColors.orange,
  },

  outputButtonOff: {
    backgroundColor: pocketLabColors.darkGreen,
  },

  outputButtonLabel: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  errorText: {
    marginTop: 8,
    color: pocketLabColors.orange,
  },
});
