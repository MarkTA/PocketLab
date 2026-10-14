/* src/features/dmm/DmmScreen.tsx */

import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";

import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { DrawerMenuButton } from "../../components/navigation/DrawerMenuButton";

import { pocketLabColors } from "../../themes/theme";

import { usePocketLabDevice } from "../device/DeviceProvider";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";
import { useContinuousDmm } from "./hooks/useContinuousDmm";

export function DmmScreen() {
  const { state, reconnecting, capabilities, dmmState, requestDmmReading, setDmmMode } =
    usePocketLabDevice();

  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active" || AppState.currentState == null
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  const dmmSupported = capabilities?.features.includes("DMM") ?? false;
  const connectedAndReady = state.connected && dmmSupported && dmmState !== null;
  const mode = dmmState?.mode ?? "RESISTANCE";

  // Only poll while the meter screen is visible, connected, and foregrounded.
  const streamEnabled =
    connectedAndReady && isFocused && appActive && !deviceSheetVisible;
  const {
    reading: dmmReading,
    samples,
    error: readingError,
    paused,
    setPaused,
    readingPending,
    switchingMode,
    polling,
    changeMode,
    readOnce,
    stopForDeviceSheet,
  } = useContinuousDmm({
    connected: state.connected,
    enabled: streamEnabled,
    mode: dmmState?.mode ?? null,
    requestDmmReading,
    setDmmMode,
  });

  const showDeviceSheet = async () => {
    // Ensure no DMM request is still pending before allowing shutdown.
    await stopForDeviceSheet();
    setDeviceSheetVisible(true);
  };

  const formattedReading = useMemo(() => {
    if (!dmmReading) {
      return {
        value: "—",
        unit: displayUnitForMode(dmmState?.mode),
      };
    }

    /*
     * OL is a valid resistance measurement state.
     */
    if (dmmReading.overload) {
      return {
        value: "OL",
        unit: "Ω",
      };
    }

    /*
     * A normal reading should always have a numeric value.
     */
    if (dmmReading.value === null) {
      return {
        value: "—",
        unit: displayUnitForMode(dmmState?.mode),
      };
    }

    return formatDmmReading(dmmReading.value, dmmReading.unit);
  }, [dmmReading, dmmState?.mode]);

  const connectionText = useMemo(() => {
    if (reconnecting) {
      return "Reconnecting…";
    }

    if (!state.connected) {
      return "Not connected";
    }

    if (!dmmSupported) {
      return "Connected device does not report DMM support";
    }

    if (!dmmState) {
      return "Synchronizing meter…";
    }

    return "Ready";
  }, [reconnecting, state.connected, dmmSupported, dmmState]);

  const referenceText =
    dmmState?.rrefOhms != null ? formatResistanceReference(dmmState.rrefOhms) : "—";

  return (
    <>
      <Screen
        header={
          <ScreenHeader
            title="PocketLab"
            subtitle="Digital Multimeter"
            left={<DrawerMenuButton />}
            right={
              <DeviceStatusCard
                connected={state.connected}
                reconnecting={reconnecting}
                deviceName={state.deviceName}
                onPress={() => {
                  void showDeviceSheet();
                }}
              />
            }
          />
        }
      >
        <View style={styles.content}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: connectedAndReady
                    ? pocketLabColors.green
                    : pocketLabColors.deviceOff,
                },
              ]}
            />

            <Text variant="bodySmall" style={styles.statusText}>
              {connectionText}
            </Text>
          </View>

          <View style={styles.displayCard}>
            <Text variant="labelLarge" style={styles.measurementLabel}>
              {mode === "RESISTANCE" ? "Resistance" : "DC Voltage"}
            </Text>

            <View style={styles.readingRow}>
              <Text style={styles.readingValue} numberOfLines={1} adjustsFontSizeToFit>
                {switchingMode ? "…" : formattedReading.value}
              </Text>

              <Text style={styles.readingUnit}>{formattedReading.unit}</Text>
            </View>

            <Text variant="bodySmall" style={styles.rangeLabel}>
              Range: {dmmState?.range ?? "—"}
            </Text>
            <Text variant="bodySmall" style={styles.streamStatus}>
              {polling
                ? `LIVE · 5 Hz target · ${samples.length} buffered`
                : paused && streamEnabled
                  ? "Paused"
                  : "Not measuring"}
            </Text>
          </View>

          <View style={styles.modeSection}>
            <Text variant="labelLarge" style={styles.sectionTitle}>
              Measurement
            </Text>

            <View style={styles.modeButtons}>
              <Button
                mode={mode === "RESISTANCE" ? "contained" : "outlined"}
                icon="omega"
                style={styles.modeButton}
                contentStyle={styles.modeButtonContent}
                disabled={!connectedAndReady || switchingMode}
                onPress={() => {
                  void changeMode("RESISTANCE");
                }}
              >
                Resistance
              </Button>

              <Button
                mode={mode === "VOLTAGE" ? "contained" : "outlined"}
                icon="flash-outline"
                style={styles.modeButton}
                contentStyle={styles.modeButtonContent}
                disabled={!connectedAndReady || switchingMode}
                onPress={() => {
                  void changeMode("VOLTAGE");
                }}
              >
                Voltage
              </Button>
            </View>

            <Text variant="bodySmall" style={styles.modeHint}>
              {mode === "VOLTAGE" ? "DC voltage measurement" : "Resistance measurement"}
            </Text>
          </View>

          <View style={styles.detailsCard}>
            <DetailRow
              label="Mode"
              value={mode === "RESISTANCE" ? "Resistance" : "DC Voltage"}
            />

            <DetailRow label="Range" value={dmmState?.range ?? "—"} />

            {mode === "RESISTANCE" ? (
              <DetailRow label="Reference" value={referenceText} />
            ) : null}
          </View>

          {readingError ? (
            <View style={styles.errorCard}>
              <Text variant="bodySmall" style={styles.errorText}>
                {readingError}
              </Text>
            </View>
          ) : null}

          <View style={styles.controls}>
            <Button
              mode="contained"
              icon={paused ? "play" : "pause"}
              disabled={!streamEnabled || switchingMode}
              onPress={() => setPaused((previous) => !previous)}
              contentStyle={styles.readButtonContent}
              style={styles.controlButton}
            >
              {paused ? "Resume" : "Pause"}
            </Button>

            {paused ? (
              <Button
                mode="outlined"
                icon="refresh"
                loading={readingPending}
                disabled={!streamEnabled || readingPending || switchingMode}
                onPress={() => void readOnce()}
                contentStyle={styles.readButtonContent}
                style={styles.controlButton}
              >
                Read Once
              </Button>
            ) : null}
          </View>
        </View>
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

type DetailRowProps = {
  label: string;
  value: string;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodyMedium" style={styles.detailLabel}>
        {label}
      </Text>

      <Text variant="bodyMedium" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function displayUnitForMode(mode: "RESISTANCE" | "VOLTAGE" | undefined): string {
  switch (mode) {
    case "VOLTAGE":
      return "V";

    case "RESISTANCE":
    default:
      return "Ω";
  }
}

function formatDmmReading(
  value: number,
  unit: "OHM" | "V"
): {
  value: string;
  unit: string;
} {
  if (!Number.isFinite(value)) {
    return {
      value: "—",
      unit: unit === "OHM" ? "Ω" : "V",
    };
  }

  if (unit === "OHM") {
    const absoluteValue = Math.abs(value);

    if (absoluteValue >= 1_000_000) {
      return {
        value: (value / 1_000_000).toFixed(5),
        unit: "MΩ",
      };
    }

    if (absoluteValue >= 1_000) {
      return {
        value: (value / 1_000).toFixed(3),
        unit: "kΩ",
      };
    }

    return {
      value: value.toFixed(2),
      unit: "Ω",
    };
  }

  const absoluteValue = Math.abs(value);

  if (absoluteValue > 0 && absoluteValue < 0.001) {
    return {
      value: (value * 1_000_000).toFixed(1),
      unit: "µV",
    };
  }

  if (absoluteValue > 0 && absoluteValue < 1) {
    return {
      value: (value * 1_000).toFixed(3),
      unit: "mV",
    };
  }

  return {
    value: value.toFixed(5),
    unit: "V",
  };
}

function formatResistanceReference(resistanceOhms: number): string {
  if (resistanceOhms >= 1_000_000) {
    return `${(resistanceOhms / 1_000_000).toFixed(3)} MΩ`;
  }

  if (resistanceOhms >= 1_000) {
    return `${(resistanceOhms / 1_000).toFixed(3)} kΩ`;
  }

  return `${resistanceOhms.toFixed(1)} Ω`;
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 16,
    paddingTop: 8,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },

  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  statusText: {
    color: pocketLabColors.mutedText,
  },

  displayCard: {
    minHeight: 220,
    backgroundColor: pocketLabColors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: "center",
    alignItems: "center",

    borderWidth: 1,
    borderColor: pocketLabColors.grid,
  },

  measurementLabel: {
    color: pocketLabColors.mutedText,
    marginBottom: 14,
  },

  readingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    width: "100%",
  },

  readingValue: {
    color: pocketLabColors.text,
    fontSize: 58,
    lineHeight: 66,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    maxWidth: "78%",
  },

  readingUnit: {
    color: pocketLabColors.darkTeal,
    fontSize: 25,
    lineHeight: 34,
    fontWeight: "600",
    marginLeft: 8,
  },

  rangeLabel: {
    color: pocketLabColors.mutedText,
    marginTop: 12,
  },

  modeSection: {
    gap: 8,
  },

  sectionTitle: {
    color: pocketLabColors.text,
  },

  modeButtons: {
    flexDirection: "row",
    gap: 10,
  },

  modeButton: {
    flex: 1,
  },

  modeButtonContent: {
    minHeight: 48,
  },

  modeHint: {
    color: pocketLabColors.mutedText,
    paddingHorizontal: 2,
  },

  detailsCard: {
    backgroundColor: pocketLabColors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,

    borderWidth: 1,
    borderColor: pocketLabColors.grid,
  },

  detailRow: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  detailLabel: {
    color: pocketLabColors.mutedText,
  },

  detailValue: {
    color: pocketLabColors.text,
    fontWeight: "600",
  },

  controls: {
    marginTop: 2,
    flexDirection: "row",
    gap: 10,
  },

  controlButton: {
    flex: 1,
  },

  streamStatus: {
    color: pocketLabColors.mutedText,
    marginTop: 8,
  },

  readButtonContent: {
    minHeight: 52,
  },

  errorCard: {
    borderWidth: 1,
    borderColor: pocketLabColors.danger,
    borderRadius: 8,
    padding: 12,
  },

  errorText: {
    color: pocketLabColors.danger,
  },
});
