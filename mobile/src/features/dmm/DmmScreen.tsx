/* src/features/dmm/DmmScreen.tsx */
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Button, IconButton, Snackbar, Text } from "react-native-paper";
import { Screen } from "../../components/layout/Screen";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { DrawerMenuButton } from "../../components/navigation/DrawerMenuButton";
import { pocketLabColors as c } from "../../themes/theme";
import { usePocketLabDevice } from "../device/DeviceProvider";
import { DeviceStatusCard } from "../device/DeviceStatusCard";
import { ScanDeviceSheet } from "../device/ScanDeviceSheet";
import { InteractiveVoltageGraph } from "./components/InteractiveVoltageGraph";
import { useContinuousDmm } from "./hooks/useContinuousDmm";

export function DmmScreen() {
  const { state, reconnecting, capabilities, dmmState, requestDmmReading, setDmmMode } = usePocketLabDevice();
  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const [inspectedVoltage, setInspectedVoltage] = useState<number | null>(null);
  const [recordNoticeVisible, setRecordNoticeVisible] = useState(false);
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active" || AppState.currentState == null);

  useEffect(() => {
    const sub = AppState.addEventListener("change", next => setAppActive(next === "active"));
    return () => sub.remove();
  }, []);

  const dmmSupported = capabilities?.features.includes("DMM") ?? false;
  const connectedAndReady = state.connected && dmmSupported && dmmState !== null;
  const mode = dmmState?.mode ?? "VOLTAGE";
  const streamEnabled = connectedAndReady && isFocused && appActive && !deviceSheetVisible;
  const { reading: dmmReading, samples, error: readingError,
    switchingMode, changeMode, stopForDeviceSheet } = useContinuousDmm({
      connected: state.connected, enabled: streamEnabled, mode: dmmState?.mode ?? null,
      requestDmmReading, setDmmMode,
    });

  const averagedVoltage = useMemo(() => {
    if (mode !== "VOLTAGE" || samples.length === 0) return null;
    const latest = samples[samples.length - 1].timestamp;
    const valid = samples.filter(s => s.mode === "VOLTAGE" && s.unit === "V" &&
      !s.overload && s.value !== null && Number.isFinite(s.value) && s.timestamp >= latest - 500);
    return valid.length ? valid.reduce((sum, s) => sum + (s.value ?? 0), 0) / valid.length : null;
  }, [mode, samples]);

  const formattedReading = useMemo(() => {
    if (mode === "VOLTAGE" && inspectedVoltage !== null) return formatDmmReading(inspectedVoltage, "V");
    if (mode === "VOLTAGE" && averagedVoltage !== null) return formatDmmReading(averagedVoltage, "V");
    if (!dmmReading) return { value: "—", unit: displayUnitForMode(mode) };
    if (dmmReading.overload) return { value: "OL", unit: "Ω" };
    if (dmmReading.value === null) return { value: "—", unit: displayUnitForMode(mode) };
    return formatDmmReading(dmmReading.value, dmmReading.unit);
  }, [mode, inspectedVoltage, averagedVoltage, dmmReading]);

  const selectMode = (nextMode: "VOLTAGE" | "RESISTANCE" | "CONTINUITY") => {
    if (nextMode !== mode) { setInspectedVoltage(null); void changeMode(nextMode); }
  };
  const showDeviceSheet = async () => { await stopForDeviceSheet(); setDeviceSheetVisible(true); };

  return <View style={styles.screenRoot}>
    <Screen header={<ScreenHeader title="PocketLab" subtitle="Digital Multimeter"
      left={<DrawerMenuButton />} right={<DeviceStatusCard connected={state.connected}
      reconnecting={reconnecting} deviceName={state.deviceName}
      onPress={() => { void showDeviceSheet(); }} />} />}>
      <View style={styles.content}>
        <View style={styles.readout}>
          <View style={styles.readingRow}>
            <Text style={styles.readingValue} numberOfLines={1} adjustsFontSizeToFit>
              {switchingMode ? "…" : formattedReading.value}
            </Text>
            <Text style={styles.readingUnit}>{formattedReading.unit}</Text>
            {(mode === "VOLTAGE" || mode === "RESISTANCE") &&
              <IconButton icon="bookmark-outline" size={24} mode="contained-tonal"
                style={styles.save} accessibilityLabel="Save measurement (coming soon)"
                disabled={!connectedAndReady || switchingMode || formattedReading.value === "—" || formattedReading.value === "OL"}
                onPress={() => setSaveNoticeVisible(true)} />}
          </View>
          {mode === "CONTINUITY" && <Text style={styles.continuity}>
            {dmmReading?.continuity === true ? "● Connected" : dmmReading?.continuity === false ? "○ Open" : "Checking…"}
          </Text>}
        </View>
        {mode === "VOLTAGE" && <View style={styles.graphArea}>
          <InteractiveVoltageGraph samples={samples}
            onInspect={point => setInspectedVoltage(point?.value ?? null)} />
        </View>}
        {mode === "VOLTAGE" && <View style={styles.recordRow}>
          <Button compact mode="outlined" icon="record-circle-outline"
            onPress={() => setRecordNoticeVisible(true)}>Record (soon)</Button>
        </View>}
        {readingError && <Text style={styles.error}>{readingError}</Text>}

      </View>
    </Screen>
    <View style={styles.footer} accessibilityRole="tablist">
          {([ ["VOLTAGE", "Voltage", "flash-outline"], ["RESISTANCE", "Ohms", "omega"], ["CONTINUITY", "Continuity", "volume-high"] ] as const)
            .map(([nextMode, label, icon]) => <Button key={nextMode} mode="text" compact
              icon={icon} accessibilityRole="tab" accessibilityState={{ selected: mode === nextMode }}
              disabled={!connectedAndReady || switchingMode} style={[styles.tab, mode === nextMode && styles.tabSelected]}
              contentStyle={styles.tabContent} labelStyle={styles.tabLabel}
              textColor={c.surface}
              onPress={() => selectMode(nextMode)}>{label}</Button>)}
    </View>
    <Snackbar visible={saveNoticeVisible} onDismiss={() => setSaveNoticeVisible(false)} duration={2500}>
      Save measurement — coming soon
    </Snackbar>
    <Snackbar visible={recordNoticeVisible} onDismiss={() => setRecordNoticeVisible(false)} duration={2500}>
      CSV recording — coming soon
    </Snackbar>
    <ScanDeviceSheet visible={deviceSheetVisible} onDismiss={() => setDeviceSheetVisible(false)} />
  </View>;
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
  screenRoot: { flex: 1, minHeight: 0 },
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
  footer: { flexDirection: "row", flexShrink: 0, borderTopWidth: 1, borderTopColor: c.darkTeal, backgroundColor: c.darkTeal },
  tab: { flex: 1, borderRadius: 0 },
  tabSelected: { borderTopWidth: 3, borderTopColor: c.green },
  tabContent: { minHeight: 56, paddingHorizontal: 0, flexDirection: "column" },
  tabLabel: { fontSize: 11, marginHorizontal: 0 },
  error: { color: c.danger, fontSize: 12 },
});
