/* src/features/functionGenerator/FunctionGeneratorScreen.tsx */
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Dialog,
  Portal,
  RadioButton,
  Text,
  TextInput,
} from "react-native-paper";

import { usePocketLabDevice } from "../device/DeviceProvider";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";
import { WaveformIcon } from "./WaveformIcon";
import { WaveformPreview } from "./WaveformPreview";
import type { Waveform } from "../../types/pocketLab";
import {
  FUNCTION_GENERATOR_LIMITS,
  clamp,
  frequencyToPeriodSec,
  periodSecToFrequency,
} from "../../lib/hardwareLimits";
import { pocketLabColors } from "@/themes/theme";

type EditingSetting = "waveform" | "frequency" | "period" | "amplitude" | "offset" | null;

export function FunctionGeneratorScreen() {
  const {
    state,
    reconnecting,
    setFrequency,
    setAmplitude,
    setOffset,
    setWaveform,
    setOutputEnabled,
  } = usePocketLabDevice();

  const [editingSetting, setEditingSetting] = useState<EditingSetting>(null);
  const [editText, setEditText] = useState("");
  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);

  const periodMs = frequencyToPeriodSec(state.frequencyHz) * 1000;
  const offsetV = state.offsetV ?? 0;

  const openNumberEditor = (
    setting: Exclude<EditingSetting, "connection" | "waveform" | null>,
    value: number
  ) => {
    setEditingSetting(setting);
    setEditText(String(value));
  };

  const closeEditor = () => {
    setEditingSetting(null);
    setEditText("");
  };

  const applyNumberEdit = () => {
    const value = Number(editText);
    if (!Number.isFinite(value)) return;

    if (editingSetting === "frequency") {
      setFrequency(
        clamp(
          value,
          FUNCTION_GENERATOR_LIMITS.minFrequencyHz,
          FUNCTION_GENERATOR_LIMITS.maxFrequencyHz
        )
      );
    }

    if (editingSetting === "period") {
      const periodSec = value / 1000;
      setFrequency(
        periodSecToFrequency(
          clamp(
            periodSec,
            1 / FUNCTION_GENERATOR_LIMITS.maxFrequencyHz,
            1 / FUNCTION_GENERATOR_LIMITS.minFrequencyHz
          )
        )
      );
    }

    if (editingSetting === "amplitude") {
      setAmplitude(
        clamp(
          value,
          FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp,
          FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp
        )
      );
    }

    if (editingSetting === "offset") {
      setOffset(
        clamp(
          value,
          FUNCTION_GENERATOR_LIMITS.minOffsetV,
          FUNCTION_GENERATOR_LIMITS.maxOffsetV
        )
      );
    }

    closeEditor();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineMedium">PocketLab</Text>
          <Text style={styles.center} variant="titleMedium">
            Function Generator
          </Text>
        </View>

        <DeviceStatusCard
          connected={state.connected}
          reconnecting={reconnecting}
          deviceName={state.deviceName}
          onPress={() => setDeviceSheetVisible(true)}
        />
      </View>

      <Card style={styles.card}>
        <WaveformPreview
          waveform={state.waveform}
          frequencyHz={state.frequencyHz}
          amplitudeVpp={state.amplitudeVpp}
          offsetV={state.offsetV ?? 0}
          outputEnabled={state.outputEnabled}
        />
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <CompactSettingRow
            icon={
              <WaveformIcon
                type={state.waveform}
                size={26}
                color={pocketLabColors.darkTeal}
              />
            }
            label="Waveform"
            value={formatWaveform(state.waveform)}
            onPress={() => setEditingSetting("waveform")}
          />

          <CompactSettingRow
            icon={<Text style={styles.symbolIcon}>ƒ</Text>}
            label="Frequency"
            value={`${formatNumber(state.frequencyHz)} Hz`}
            onPress={() => openNumberEditor("frequency", state.frequencyHz)}
          />

          <CompactSettingRow
            icon={<Text style={styles.symbolIcon}>T</Text>}
            label="Period"
            value={`${formatNumber(periodMs)} ms`}
            onPress={() => openNumberEditor("period", periodMs)}
          />

          <CompactSettingRow
            icon={<Text style={styles.smallSymbolIcon}>Vpp</Text>}
            label="Amplitude"
            value={`${state.amplitudeVpp.toFixed(2)} Vpp`}
            onPress={() => openNumberEditor("amplitude", state.amplitudeVpp)}
          />

          <CompactSettingRow
            icon={<Text style={styles.smallSymbolIcon}>Vdc</Text>}
            label="Offset"
            value={`${offsetV.toFixed(2)} V`}
            onPress={() => openNumberEditor("offset", offsetV)}
          />

          <Text variant="bodySmall" style={styles.outputStatus}>
            Output is {state.outputEnabled ? "enabled" : "disabled"}
          </Text>

          <Button
            mode="contained"
            disabled={!state.connected}
            onPress={() => setOutputEnabled(!state.outputEnabled)}
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

      <ScanDeviceSheet
        visible={deviceSheetVisible}
        onDismiss={() => setDeviceSheetVisible(false)}
      />

      <Portal>
        <Dialog visible={editingSetting === "waveform"} onDismiss={closeEditor}>
          <Dialog.Title>Waveform</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              value={state.waveform}
              onValueChange={(value) => {
                setWaveform(value as Waveform);
                closeEditor();
              }}
            >
              <RadioButton.Item label="Sine" value="sine" />
              <RadioButton.Item label="Square" value="square" />
              <RadioButton.Item label="Triangle" value="triangle" />
              <RadioButton.Item label="DC" value="dc" />
              <RadioButton.Item label="Ramp Up" value="rampUp" />
              <RadioButton.Item label="Ramp Down" value="rampDown" />
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>

        <Dialog
          visible={
            editingSetting === "frequency" ||
            editingSetting === "period" ||
            editingSetting === "amplitude" ||
            editingSetting === "offset"
          }
          onDismiss={closeEditor}
        >
          <Dialog.Title>{getEditorTitle(editingSetting)}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              keyboardType="numeric"
              value={editText}
              onChangeText={setEditText}
              autoFocus
            />
            <Text variant="bodySmall" style={styles.limitText}>
              {getLimitText(editingSetting)}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeEditor}>Cancel</Button>
            <Button mode="contained" onPress={applyNumberEdit}>
              Apply
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function CompactSettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.settingRow}>
      <View style={styles.settingLeft}>
        <View style={styles.settingIcon}>{icon}</View>
        <Text variant="bodyLarge">{label}</Text>
      </View>

      <View style={styles.settingRight}>
        <Text variant="bodyLarge" style={styles.settingValue}>
          {value}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function formatWaveform(waveform: Waveform) {
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

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function getEditorTitle(setting: EditingSetting) {
  switch (setting) {
    case "frequency":
      return "Edit Frequency (Hz)";
    case "period":
      return "Edit Period (ms)";
    case "amplitude":
      return "Edit Amplitude (Vpp)";
    case "offset":
      return "Edit Offset (V)";
    default:
      return "";
  }
}

function getLimitText(setting: EditingSetting) {
  switch (setting) {
    case "frequency":
      return `${FUNCTION_GENERATOR_LIMITS.minFrequencyHz} Hz to ${FUNCTION_GENERATOR_LIMITS.maxFrequencyHz} Hz`;
    case "period":
      return "Derived from frequency limits";
    case "amplitude":
      return `${FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp} Vpp to ${FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp} Vpp`;
    case "offset":
      return `${FUNCTION_GENERATOR_LIMITS.minOffsetV} V to ${FUNCTION_GENERATOR_LIMITS.maxOffsetV} V`;
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  chevron: {
    fontSize: 34,
    lineHeight: 20,
    opacity: 0.45,
    marginBottom: 4,
  },
  center: {
    textAlign: "center",
  },
  connectionButton: {
    alignItems: "center",
    gap: 4,
    paddingTop: 8,
  },
  connectionLed: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  connectedLed: {
    backgroundColor: pocketLabColors.green,
  },
  disconnectedLed: {
    backgroundColor: pocketLabColors.mutedText,
  },
  card: {
    marginTop: 8,
  },
  settingRow: {
    minHeight: 52,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingIcon: {
    width: 34,
    alignItems: "center",
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
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  settingValue: {
    opacity: 0.75,
    marginRight: 20,
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
  limitText: {
    marginTop: 8,
    opacity: 0.7,
  },
});
