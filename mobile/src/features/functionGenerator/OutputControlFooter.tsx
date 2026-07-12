import React from "react";
import { StyleSheet } from "react-native";
import { Button, Text } from "react-native-paper";

import { pocketLabColors } from "@/themes/theme";

type OutputControlFooterProps = {
  connected: boolean;
  running: boolean;
  pending?: boolean;
  onPress: () => void;
};

export function OutputControlFooter({
  connected,
  running,
  pending = false,
  onPress,
}: OutputControlFooterProps) {
  return (
    <>
      <Text variant="bodySmall" style={styles.status}>
        {running ? "Output is running" : "Output is stopped"}
      </Text>

      <Button
        mode="contained"
        disabled={!connected || pending}
        loading={pending}
        onPress={onPress}
        style={[styles.button, running ? styles.stopButton : styles.runButton]}
        labelStyle={styles.label}
      >
        {running ? "STOP OUTPUT" : "RUN OUTPUT"}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    textAlign: "center",
    marginBottom: 8,
    opacity: 0.7,
  },

  button: {
    borderRadius: 14,
    paddingVertical: 8,
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
