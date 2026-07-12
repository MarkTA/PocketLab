/* src/features/device/DeviceStatusCard.tsx */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { pocketLabColors } from "@/themes/theme";

type DeviceStatusCardProps = {
  connected: boolean;
  reconnecting: boolean;
  deviceName: string | null;
  onPress: () => void;
};

export function DeviceStatusCard({
  connected,
  deviceName,
  reconnecting,
  onPress,
}: DeviceStatusCardProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View
        style={[
          styles.led,
          reconnecting
            ? styles.reconnectingLed
            : connected
              ? styles.connectedLed
              : styles.disconnectedLed,
        ]}
      />

      <Text variant="bodySmall">
        {connected
          ? (deviceName ?? "Connected")
          : reconnecting
            ? "Reconnecting…"
            : "Offline"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
    paddingTop: 8,
  },
  led: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  connectedLed: {
    backgroundColor: pocketLabColors.green,
  },
  reconnectingLed: {
    backgroundColor: pocketLabColors.orange,
  },
  disconnectedLed: {
    backgroundColor: pocketLabColors.mutedText,
  },
});
