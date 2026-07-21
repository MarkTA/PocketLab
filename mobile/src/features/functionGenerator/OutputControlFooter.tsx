import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";

import { pocketLabColors } from "@/themes/theme";

type OutputControlFooterProps = {
  connected: boolean;
  running: boolean;
  settingsMatch: boolean;
  settingsPending?: boolean;
  outputPending?: boolean;
  onSendUpdate: () => void;
  onToggleOutput: () => void;
};

export function OutputControlFooter({
  connected,
  running,
  settingsMatch,
  settingsPending = false,
  outputPending = false,
  onSendUpdate,
  onToggleOutput,
}: OutputControlFooterProps) {
  return (
    <>
      <Text variant="bodySmall" style={styles.status}>
        {running ? "Output is running" : "Output is stopped"}
      </Text>

      <View style={styles.buttonRow}>
        <Button
          mode="outlined"
          disabled={!connected || settingsPending || settingsMatch}
          loading={settingsPending}
          onPress={onSendUpdate}
          style={styles.button}
          contentStyle={styles.buttonContent}
          labelStyle={styles.label}
        >
          SEND UPDATE
        </Button>

        <Button
          mode="contained"
          disabled={!connected || outputPending}
          loading={outputPending}
          onPress={onToggleOutput}
          style={[styles.button, running ? styles.stopButton : styles.runButton]}
          contentStyle={styles.buttonContent}
          labelStyle={styles.label}
        >
          {running ? "STOP" : "RUN"}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    textAlign: "center",
    marginBottom: 8,
    opacity: 0.7,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },

  button: {
    flex: 1,
    borderRadius: 14,
  },

  buttonContent: {
    minHeight: 52,
  },

  runButton: {
    backgroundColor: pocketLabColors.darkGreen,
  },

  stopButton: {
    backgroundColor: pocketLabColors.orange,
  },

  label: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
