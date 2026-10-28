/* src/features/dmm/DmmScreen.tsx */
import { useDisplayRefresh } from "@/features/dmm/hooks/useDisplayRefresh";
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { Button, Icon, Snackbar, Text } from "react-native-paper";
import { pocketLabColors as c } from "../../themes/theme";
import { useAppShell } from "../appShell/AppShellContext";
import { usePocketLabDevice } from "../device/DeviceProvider";
import { AVERAGING_WINDOW_MS } from "./components/DcVoltageSettings";
import { DmmModeFooter, type DmmFooterMode } from "./components/DmmModeFooter";
import { InteractiveVoltageGraph } from "./components/InteractiveVoltageGraph";
import { averageRecentVoltage, formatDcVoltage } from "./graph/dcVoltageDisplay";
import { useContinuousDmm } from "./hooks/useContinuousDmm";
import { useDmmPreferences } from "./preferences/DmmPreferencesProvider";
import { saveMeasurement } from "./storage/savedMeasurements";

export function DmmScreen() {
  const {
    state,
    capabilities,
    dmmState,
    continuityActive,
    requestDmmReading,
    setDmmMode,
  } = usePocketLabDevice();
  const { deviceSheetVisible, registerBeforeDeviceSheetOpen, refreshSavedCount } =
    useAppShell();
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [inspectedPoint, setInspectedPoint] = useState<{
    timestamp: number;
    value: number;
  } | null>(null);
  const [recordNoticeVisible, setRecordNoticeVisible] = useState(false);
  const [graphVisible, setGraphVisible] = useState(false);
  // const [voltageSettingsVisible, setVoltageSettingsVisible] = useState(false);
  const {
    preferences: { averaging, sensitivity, displayRefreshMs },
  } = useDmmPreferences();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active" || AppState.currentState == null
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) =>
      setAppActive(next === "active")
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isFocused && appActive) void refreshSavedCount();
  }, [isFocused, appActive, refreshSavedCount]);

  const dmmSupported = capabilities?.features.includes("DMM") ?? false;
  const connectedAndReady = state.connected && dmmSupported && dmmState !== null;
  const mode = dmmState?.mode ?? "VOLTAGE";
  const streamEnabled =
    connectedAndReady && isFocused && appActive && !deviceSheetVisible;
  const continuityClosed = connectedAndReady && mode === "CONTINUITY" && continuityActive;
  const {
    reading: dmmReading,
    samples,
    error: readingError,
    switchingMode,
    changeMode,
    stopForDeviceSheet,
  } = useContinuousDmm({
    connected: state.connected,
    enabled: streamEnabled,
    mode: dmmState?.mode ?? null,
    requestDmmReading,
    setDmmMode,
  });

  const averagedVoltage = useMemo(
    () =>
      mode === "VOLTAGE"
        ? averageRecentVoltage(samples, AVERAGING_WINDOW_MS[averaging])
        : null,
    [mode, samples, averaging]
  );
  const formattedReading = useMemo(() => {
    if (mode === "VOLTAGE" && inspectedPoint !== null)
      return formatDcVoltage(inspectedPoint.value, sensitivity);
    if (mode === "VOLTAGE" && averagedVoltage !== null)
      return formatDcVoltage(averagedVoltage, sensitivity);
    if (!dmmReading) return { value: "—", unit: displayUnitForMode(mode) };
    if (dmmReading.overload) return { value: "OL", unit: "Ω" };
    if (dmmReading.value === null) return { value: "—", unit: displayUnitForMode(mode) };
    return formatDmmReading(dmmReading.value, dmmReading.unit);
  }, [mode, inspectedPoint, averagedVoltage, dmmReading, sensitivity]);

  const displayedReading = useDisplayRefresh(
    formattedReading,
    displayRefreshMs,
    `${mode}:${sensitivity}:${inspectedPoint?.timestamp ?? "live"}:${connectedAndReady}`
  );

  const selectMode = (nextMode: DmmFooterMode) => {
    if (nextMode !== mode) {
      setInspectedPoint(null);
      void changeMode(nextMode);
    }
  };
  useEffect(() => {
    if (!isFocused) return;
    return registerBeforeDeviceSheetOpen(stopForDeviceSheet);
  }, [isFocused, stopForDeviceSheet, registerBeforeDeviceSheetOpen]);

  const handleSave = async () => {
    if (saving || switchingMode || !connectedAndReady) return;
    const isCursor = mode === "VOLTAGE" && inspectedPoint !== null;
    const value = isCursor
      ? inspectedPoint.value
      : mode === "VOLTAGE"
        ? averagedVoltage
        : dmmReading?.value;
    if (value == null || !Number.isFinite(value) || (!isCursor && dmmReading?.overload))
      return;
    const latestVoltageSample = [...samples]
      .reverse()
      .find(
        (sample) =>
          sample.mode === "VOLTAGE" &&
          sample.unit === "V" &&
          !sample.overload &&
          sample.value !== null
      );
    const measuredAt = isCursor
      ? inspectedPoint.timestamp
      : mode === "VOLTAGE"
        ? latestVoltageSample?.timestamp
        : Date.now();
    if (measuredAt == null) return;
    setSaving(true);
    try {
      await saveMeasurement({
        kind: mode === "RESISTANCE" ? "resistance" : "voltage",
        value,
        unit: mode === "RESISTANCE" ? "Ω" : "V",
        measuredAt,
        source: isCursor ? "cursor" : "live",
        ...(mode === "VOLTAGE" && !isCursor
          ? { averagingWindowMs: AVERAGING_WINDOW_MS[averaging] }
          : {}),
        ...(isCursor ? { interpolated: true } : {}),
      });
      // Refresh from persisted storage rather than assuming a successful write adds exactly one.
      await refreshSavedCount();
      setSaveNotice(isCursor ? "Selected graph reading saved" : "Measurement saved");
    } catch {
      setSaveNotice("Unable to save measurement");
    } finally {
      setSaving(false);
      setSaveNoticeVisible(true);
    }
  };

  return (
    <>
      <View style={styles.screen}>
        <View style={styles.content}>
          <DmmModeFooter
            mode={mode}
            disabled={!connectedAndReady || switchingMode}
            onModeChange={selectMode}
          />
          <View
            style={[
              styles.readout,
              mode === "VOLTAGE" && graphVisible && styles.readoutWithGraph,
            ]}
          >
            {mode === "CONTINUITY" ? (
              <View style={styles.continuityReadout}>
                <Text
                  accessibilityRole="text"
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.continuityStatus,
                    continuityClosed && styles.continuityClosed,
                  ]}
                >
                  {continuityClosed ? "CLOSED" : "OPEN"}
                </Text>
                <View style={[styles.readingRow, styles.continuitySecondaryRow]}>
                  <Text
                    style={styles.continuityReadingValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {switchingMode ? "…" : displayedReading.value}
                  </Text>
                  <Text style={styles.continuityReadingUnit}>
                    {displayedReading.unit}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.readingRow}>
                <Text style={styles.readingValue} numberOfLines={1} adjustsFontSizeToFit>
                  {switchingMode ? "…" : displayedReading.value}
                </Text>
                <Text style={styles.readingUnit}>{displayedReading.unit}</Text>
              </View>
            )}
          </View>
          {mode === "VOLTAGE" && graphVisible && (
            <View style={styles.graphArea}>
              <InteractiveVoltageGraph samples={samples} onInspect={setInspectedPoint} />
            </View>
          )}
          {mode !== "VOLTAGE" && <View style={styles.controlSpacer} />}
          {mode === "VOLTAGE" && (
            <View style={styles.voltageControls}>
              <Button
                compact
                mode="outlined"
                icon={graphVisible ? "chart-line-variant" : "chart-line"}
                onPress={() => {
                  setGraphVisible((visible) => !visible);
                  // A hidden graph should never leave the readout showing a cursor value.
                  setInspectedPoint(null);
                }}
              >
                {graphVisible ? "Hide Graph" : "Show Graph"}
              </Button>
              {graphVisible && (
                <Button
                  compact
                  mode="outlined"
                  icon="record-circle-outline"
                  onPress={() => setRecordNoticeVisible(true)}
                >
                  Record (soon)
                </Button>
              )}
            </View>
          )}
          {readingError && <Text style={styles.error}>{readingError}</Text>}
        </View>
        {(mode === "VOLTAGE" || mode === "RESISTANCE") && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              inspectedPoint ? "Save selected graph reading" : "Save live measurement"
            }
            accessibilityState={{
              disabled:
                !connectedAndReady ||
                switchingMode ||
                saving ||
                formattedReading.value === "—" ||
                formattedReading.value === "OL",
            }}
            disabled={
              !connectedAndReady ||
              switchingMode ||
              saving ||
              formattedReading.value === "—" ||
              formattedReading.value === "OL"
            }
            onPress={() => {
              void handleSave();
            }}
            style={({ pressed }) => [
              styles.saveFab,
              (!connectedAndReady ||
                switchingMode ||
                saving ||
                formattedReading.value === "—" ||
                formattedReading.value === "OL") &&
                styles.saveFabDisabled,
              pressed && styles.saveFabPressed,
            ]}
          >
            <Icon source="bookmark-outline" size={27} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
      <Snackbar
        visible={saveNoticeVisible}
        onDismiss={() => setSaveNoticeVisible(false)}
        duration={2500}
      >
        {saveNotice}
      </Snackbar>
      <Snackbar
        visible={recordNoticeVisible}
        onDismiss={() => setRecordNoticeVisible(false)}
        duration={2500}
      >
        CSV recording — coming soon
      </Snackbar>
    </>
  );
}

function displayUnitForMode(
  mode: "RESISTANCE" | "VOLTAGE" | "CONTINUITY" | undefined
): string {
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

const styles = StyleSheet.create({
  headerActions: { alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  savedShortcut: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginTop: 0,
  },
  savedButton: { margin: 0, width: 42, height: 38 },
  savedLabel: { color: c.surface, fontSize: 11, lineHeight: 14, marginTop: -2 },
  savedBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: "#C62828",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  savedBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", lineHeight: 13 },
  screen: { flex: 1, backgroundColor: c.surface },
  content: { flex: 1, minHeight: 0, paddingBottom: 4, gap: 8 },
  // The reading and graph share the available height; no screen-level scrolling.
  readout: {
    flex: 1,
    marginHorizontal: 16,
    minHeight: 80,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  readoutWithGraph: { flex: 0.4 },
  readingRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "baseline",
    paddingHorizontal: 12,
    position: "relative",
  },
  readingValue: {
    fontSize: 58,
    lineHeight: 70,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: c.text,
    maxWidth: "78%",
  },
  readingUnit: { fontSize: 24, color: c.darkTeal, marginLeft: 8, fontWeight: "600" },
  saveFab: {
    position: "absolute",
    bottom: 18,
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.orange,
    elevation: 4,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  saveFabDisabled: { opacity: 0.5 },
  saveFabPressed: { opacity: 0.85 },
  // Reserve the same bottom control height in every mode to align their readout centers.
  controlSpacer: { height: 64 },
  continuityReadout: {
    width: "100%",
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  continuityStatus: { fontSize: 58, lineHeight: 70, fontWeight: "500", color: c.text },
  continuityClosed: { color: c.danger },
  continuitySecondaryRow: { position: "absolute", top: 74 },
  continuityReadingValue: {
    fontSize: 24,
    lineHeight: 20,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: c.darkTeal,
    maxWidth: "78%",
  },
  continuityReadingUnit: {
    fontSize: 19,
    color: c.mutedText,
    marginLeft: 6,
    fontWeight: "500",
  },
  graphArea: { flex: 1.6, minHeight: 0, marginHorizontal: 16 },
  voltageControls: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 86,
    gap: 8,
  },
  error: { color: c.danger, fontSize: 12 },
});
