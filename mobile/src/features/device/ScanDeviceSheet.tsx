/* src/features/device/ScanDeviceSheet.tsx */
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { Device } from "react-native-ble-plx";
import {
  ActivityIndicator,
  Button,
  Dialog,
  Divider,
  Portal,
  Text,
} from "react-native-paper";

import { usePocketLabDevice } from "./DeviceProvider";
import { pocketLabColors } from "@/themes/theme";

type ScanDeviceSheetProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function ScanDeviceSheet({ visible, onDismiss }: ScanDeviceSheetProps) {
  const {
    state,
    scanning,
    reconnecting,
    discoveredDevices,
    scanForDevices,
    stopScan,
    connect,
    disconnect,
    testWrite,
  } = usePocketLabDevice();

  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  const [testingWrite, setTestingWrite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleDismiss = () => {
    if (scanning) {
      stopScan();
    }

    setConnectingDeviceId(null);
    setMessage(null);
    onDismiss();
  };

  const handleScan = async () => {
    setMessage(null);

    try {
      await scanForDevices();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleStopScan = () => {
    stopScan();
    setMessage("Scan stopped.");
  };

  const handleConnect = async (device: Device) => {
    setConnectingDeviceId(device.id);
    setMessage(null);

    try {
      await connect(device);
      setMessage(`Connected to ${getDeviceName(device)}.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const handleDisconnect = async () => {
    setMessage(null);

    try {
      await disconnect();
      setMessage("Device disconnected.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const handleTestWrite = async () => {
    setTestingWrite(true);
    setMessage(null);

    try {
      await testWrite();
      setMessage('The app sent "PING". Check the ESP32 Serial Monitor.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setTestingWrite(false);
    }
  };

  useEffect(() => {
    if (!state.connected) {
      setMessage(null);
      setTestingWrite(false);
      setConnectingDeviceId(null);
    }
  }, [state.connected]);

  const showConnectedView = state.connected || reconnecting;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title>Device Connection</Dialog.Title>

        <Dialog.Content style={styles.content}>
          <ConnectionStatus
            connected={state.connected}
            reconnecting={reconnecting}
            deviceName={state.deviceName}
          />

          {message ? (
            <Text variant="bodySmall" style={styles.message}>
              {message}
            </Text>
          ) : null}

          {showConnectedView ? (
            <View style={styles.connectedControls}>
              <Button
                mode="contained"
                loading={testingWrite}
                disabled={testingWrite || reconnecting || !state.connected}
                onPress={handleTestWrite}
              >
                Send PING
              </Button>

              <Button mode="outlined" onPress={handleDisconnect}>
                Disconnect
              </Button>
            </View>
          ) : (
            <>
              <View style={styles.scanControls}>
                {scanning ? (
                  <Button mode="outlined" onPress={handleStopScan}>
                    Stop Scan
                  </Button>
                ) : (
                  <Button mode="contained" onPress={handleScan}>
                    Scan for Devices
                  </Button>
                )}

                {scanning ? (
                  <View style={styles.scanningStatus}>
                    <ActivityIndicator size="small" />
                    <Text variant="bodySmall">Scanning…</Text>
                  </View>
                ) : null}
              </View>

              <Divider style={styles.divider} />

              <Text variant="titleSmall" style={styles.devicesTitle}>
                Discovered Devices
              </Text>

              {discoveredDevices.length === 0 ? (
                <Text variant="bodyMedium" style={styles.emptyMessage}>
                  No devices discovered yet.
                </Text>
              ) : (
                <FlatList
                  data={discoveredDevices}
                  keyExtractor={(device) => device.id}
                  renderItem={({ item }) => (
                    <DeviceRow
                      device={item}
                      connecting={connectingDeviceId === item.id}
                      disabled={connectingDeviceId !== null}
                      onPress={() => handleConnect(item)}
                    />
                  )}
                  ItemSeparatorComponent={() => <Divider style={styles.deviceDivider} />}
                  style={styles.deviceList}
                  contentContainerStyle={styles.deviceListContent}
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          )}
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={handleDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function ConnectionStatus({
  connected,
  reconnecting,
  deviceName,
}: {
  connected: boolean;
  reconnecting: boolean;
  deviceName: string | null;
}) {
  return (
    <View style={styles.statusRow}>
      <View
        style={[
          styles.statusLed,
          reconnecting
            ? styles.reconnectingLed
            : connected
              ? styles.connectedLed
              : styles.disconnectedLed,
        ]}
      />

      <View style={styles.statusText}>
        <Text variant="titleMedium">
          {reconnecting
            ? "Attempting to reconnect..."
            : connected
              ? "Connected"
              : "Offline"}
        </Text>

        <Text variant="bodySmall" style={styles.secondaryText}>
          {connected || reconnecting
            ? (deviceName ?? "PocketLab Device")
            : "No PocketLab device connected"}
        </Text>
      </View>
    </View>
  );
}

function DeviceRow({
  device,
  connecting,
  disabled,
  onPress,
}: {
  device: Device;
  connecting: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const deviceName = getDeviceName(device);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.deviceRow,
        pressed && !disabled ? styles.deviceRowPressed : null,
        disabled && !connecting ? styles.deviceRowDisabled : null,
      ]}
    >
      <View style={styles.deviceInformation}>
        <Text variant="bodyLarge">{deviceName}</Text>

        <Text variant="bodySmall" style={styles.secondaryText}>
          {device.id}
        </Text>

        {device.rssi !== null ? (
          <Text variant="bodySmall" style={styles.secondaryText}>
            Signal: {device.rssi} dBm
          </Text>
        ) : null}
      </View>

      {connecting ? (
        <ActivityIndicator size="small" />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

function getDeviceName(device: Device): string {
  return device.name ?? device.localName ?? "Unnamed BLE Device";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected Bluetooth error occurred.";
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: "85%",
  },
  content: {
    minHeight: 220,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusLed: {
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
  statusText: {
    flex: 1,
  },
  secondaryText: {
    opacity: 0.65,
  },
  message: {
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  connectedControls: {
    marginTop: 20,
    gap: 12,
  },
  scanControls: {
    marginTop: 20,
    gap: 12,
  },
  scanningStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  divider: {
    marginVertical: 18,
  },
  devicesTitle: {
    marginBottom: 8,
  },
  emptyMessage: {
    paddingVertical: 24,
    textAlign: "center",
    opacity: 0.65,
  },
  deviceList: {
    maxHeight: 320,
  },
  deviceListContent: {
    paddingBottom: 8,
  },
  deviceRow: {
    minHeight: 72,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deviceRowPressed: {
    opacity: 0.6,
  },
  deviceRowDisabled: {
    opacity: 0.45,
  },
  deviceInformation: {
    flex: 1,
    paddingRight: 12,
  },
  deviceDivider: {
    opacity: 0.6,
  },
  chevron: {
    fontSize: 34,
    lineHeight: 34,
    opacity: 0.45,
  },
});
