/* src/features/dmm/DmmScreen.tsx */
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Button, IconButton, Snackbar, Text } from "react-native-paper";
import { Screen } from "../../components/layout/Screen";
import { pocketLabColors as c } from "../../themes/theme";
import { usePocketLabDevice } from "../device/DeviceProvider";
import { useAppShell } from "../appShell/AppShellContext";
import { InteractiveVoltageGraph } from "./components/InteractiveVoltageGraph";
import { DmmModeFooter, type DmmFooterMode } from "./components/DmmModeFooter";
import { AVERAGING_WINDOW_MS } from "./components/DcVoltageSettings";
import { averageRecentVoltage, formatDcVoltage } from "./graph/dcVoltageDisplay";
import { useContinuousDmm } from "./hooks/useContinuousDmm";
import { useDmmPreferences } from "./preferences/DmmPreferencesProvider";
import { saveMeasurement } from "./storage/savedMeasurements";
import { useDisplayRefresh } from "@/features/dmm/hooks/useDisplayRefresh";

export function DmmScreen() {
  const { state, capabilities, dmmState, requestDmmReading, setDmmMode } = usePocketLabDevice();
  const { deviceSheetVisible, registerBeforeDeviceSheetOpen, refreshSavedCount } = useAppShell();
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [inspectedPoint, setInspectedPoint] = useState<{ timestamp: number; value: number } | null>(null);
  const [recordNoticeVisible, setRecordNoticeVisible] = useState(false);
  // const [voltageSettingsVisible, setVoltageSettingsVisible] = useState(false);
  const {
    preferences: { averaging, sensitivity, displayRefreshMs }
  } = useDmmPreferences();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active" || AppState.currentState == null);

  useEffect(() => {
    const sub = AppState.addEventListener("change", next => setAppActive(next === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => { if (isFocused && appActive) void refreshSavedCount(); }, [isFocused, appActive, refreshSavedCount]);

  const dmmSupported = capabilities?.features.includes("DMM") ?? false;
  const connectedAndReady = state.connected && dmmSupported && dmmState !== null;
  const mode = dmmState?.mode ?? "VOLTAGE";
  const streamEnabled = connectedAndReady && isFocused && appActive && !deviceSheetVisible;
  const { reading: dmmReading, samples, error: readingError,
    switchingMode, changeMode, stopForDeviceSheet } = useContinuousDmm({
      connected: state.connected, enabled: streamEnabled, mode: dmmState?.mode ?? null,
      requestDmmReading, setDmmMode,
    });

  const averagedVoltage = useMemo(() =>
    mode === "VOLTAGE" ? averageRecentVoltage(samples, AVERAGING_WINDOW_MS[averaging]) : null,
    [mode, samples, averaging]
  );
  const formattedReading = useMemo(() => {
    if (mode === "VOLTAGE" && inspectedPoint !== null) return formatDcVoltage(inspectedPoint.value, sensitivity);
    if (mode === "VOLTAGE" && averagedVoltage !== null) return formatDcVoltage(averagedVoltage, sensitivity);
    if (!dmmReading) return { value: "—", unit: displayUnitForMode(mode) };
    if (dmmReading.overload) return { value: "OL", unit: "Ω" };
    if (dmmReading.value === null) return { value: "—", unit: displayUnitForMode(mode) };
    return formatDmmReading(dmmReading.value, dmmReading.unit);
  }, [mode, inspectedPoint, averagedVoltage, dmmReading, sensitivity]);

  const displayedReading = useDisplayRefresh(
    formattedReading,
    displayRefreshMs,
    `${mode}:${sensitivity}:${inspectedPoint?.timestamp ?? "live"}:${connectedAndReady}`,
  );

  const selectMode = (nextMode: DmmFooterMode) => {
    if (nextMode !== mode) { setInspectedPoint(null); void changeMode(nextMode); }
  };
  useEffect(() => {
    if (!isFocused) return;
    return registerBeforeDeviceSheetOpen(stopForDeviceSheet);
  }, [isFocused, stopForDeviceSheet, registerBeforeDeviceSheetOpen]);

  const handleSave = async () => {
    if (saving || switchingMode || !connectedAndReady) return;
    const isCursor = mode === "VOLTAGE" && inspectedPoint !== null;
    const value = isCursor ? inspectedPoint.value : mode === "VOLTAGE" ? averagedVoltage : dmmReading?.value;
    if (value == null || !Number.isFinite(value) || (!isCursor && dmmReading?.overload)) return;
    const latestVoltageSample = [...samples].reverse().find(sample =>
      sample.mode === "VOLTAGE" && sample.unit === "V" && !sample.overload && sample.value !== null
    );
    const measuredAt = isCursor
      ? inspectedPoint.timestamp
      : mode === "VOLTAGE" ? latestVoltageSample?.timestamp : Date.now();
    if (measuredAt == null) return;
    setSaving(true);
    try {
      await saveMeasurement({
        kind: mode === "RESISTANCE" ? "resistance" : "voltage",
        value,
        unit: mode === "RESISTANCE" ? "Ω" : "V",
        measuredAt,
        source: isCursor ? "cursor" : "live",
        ...(mode === "VOLTAGE" && !isCursor ? { averagingWindowMs: AVERAGING_WINDOW_MS[averaging] } : {}),
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

  return <>
    <Screen
      contentContainerStyle={styles.screenContent}
      footerContainerStyle={styles.screenFooter}
      footer={<DmmModeFooter mode={mode} disabled={!connectedAndReady || switchingMode} onModeChange={selectMode} />}
    >
      <View style={styles.content}>
        <View style={styles.readout}>
          <View style={styles.readingRow}>
            <Text style={styles.readingValue} numberOfLines={1} adjustsFontSizeToFit>
              {switchingMode ? "…" : displayedReading.value}
            </Text>
            <Text style={styles.readingUnit}>{displayedReading.unit}</Text>
            {(mode === "VOLTAGE" || mode === "RESISTANCE") &&
              <IconButton icon="bookmark-outline" size={24} mode="contained-tonal"
                style={styles.save} accessibilityLabel={inspectedPoint ? "Save selected graph reading" : "Save live measurement"}
                disabled={!connectedAndReady || switchingMode || saving || formattedReading.value === "—" || formattedReading.value === "OL"}
                onPress={() => { void handleSave(); }} />}
          </View>
          {/* {mode === "VOLTAGE" && <Button compact icon="tune-variant" mode="text" onPress={() => setVoltageSettingsVisible(true)}>
            {averaging === "FAST" ? "Fast" : averaging === "NORMAL" ? "Normal" : averaging === "STABLE" ? "Stable" : "Precision"} · {sensitivity === "AUTO" ? "Auto" : sensitivity === "HIGH" ? "High" : "Low"}
          </Button>} */}
          {mode === "CONTINUITY" && <Text style={styles.continuity}>
            {dmmReading?.continuity === true ? "● Connected" : dmmReading?.continuity === false ? "○ Open" : "Checking…"}
          </Text>}
        </View>
        {mode === "VOLTAGE" && <View style={styles.graphArea}>
          <InteractiveVoltageGraph samples={samples}
            onInspect={setInspectedPoint} />
        </View>}
        {mode === "VOLTAGE" && <View style={styles.recordRow}>
          <Button compact mode="outlined" icon="record-circle-outline"
            onPress={() => setRecordNoticeVisible(true)}>Record (soon)</Button>
        </View>}
        {readingError && <Text style={styles.error}>{readingError}</Text>}

      </View>
    </Screen>
    <Snackbar visible={saveNoticeVisible} onDismiss={() => setSaveNoticeVisible(false)} duration={2500}>
      {saveNotice}
    </Snackbar>
    <Snackbar visible={recordNoticeVisible} onDismiss={() => setRecordNoticeVisible(false)} duration={2500}>
      CSV recording — coming soon
    </Snackbar>
    {/* <DcVoltageSettings
      visible={voltageSettingsVisible}
      onDismiss={() => setVoltageSettingsVisible(false)}
      averaging={averaging}
      onAveragingChange={(value) =>
        setDmmPreferences({ averaging: value })
      }
      sensitivity={sensitivity}
      onSensitivityChange={(value) =>
        setDmmPreferences({ sensitivity: value })
      }
    /> */}
  </>;
}

function displayUnitForMode(mode: "RESISTANCE" | "VOLTAGE" | "CONTINUITY" | undefined): string {
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
  savedShortcut: { alignItems: "center", justifyContent: "center", position: "relative", marginTop: 0 },
  savedButton: { margin: 0, width: 42, height: 38 },
  savedLabel: { color: c.surface, fontSize: 11, lineHeight: 14, marginTop: -2 },
  savedBadge: { position: "absolute", top: -1, right: -3, minWidth: 18, height: 18,
    paddingHorizontal: 3, borderRadius: 9, backgroundColor: "#C62828", alignItems: "center",
    justifyContent: "center", zIndex: 1 },
  savedBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", lineHeight: 13 },
  screenContent: { paddingBottom: 0, gap: 0 },
  screenFooter: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: c.darkTeal },
  content: { flex: 1, minHeight: 0, paddingTop: 4, paddingBottom: 4, gap: 8 },
  // The reading and graph share the available height; no screen-level scrolling.
  readout: { flex: 0.65, minHeight: 80, justifyContent: "center", alignItems: "center", position: "relative" },
  readingRow: { width: "100%", flexDirection: "row", justifyContent: "center", alignItems: "baseline", paddingHorizontal: 12, position: "relative" },
  readingValue: { fontSize: 58, lineHeight: 70, fontWeight: "500", fontVariant: ["tabular-nums"], color: c.text, maxWidth: "78%" },
  readingUnit: { fontSize: 24, color: c.darkTeal, marginLeft: 8, fontWeight: "600" },
  save: { position: "absolute", right: 4, top: "50%", marginTop: -24, margin: 0 },
  continuity: { color: c.mutedText, marginTop: 8 },
  graphArea: { flex: 1.6, minHeight: 0, width: "100%" },
  recordRow: { flexDirection: "row", justifyContent: "flex-end" },
  error: { color: c.danger, fontSize: 12 },
});
