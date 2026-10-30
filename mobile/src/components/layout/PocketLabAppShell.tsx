import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, type Href } from "expo-router";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { getSettingsDefinition, settingsScopeForPath } from "@/features/settings/settings.config";
import { SafeAreaView } from "react-native-safe-area-context";
import { pocketLabColors as c } from "@/themes/theme";
import { PocketLabHeader } from "@/components/navigation/PocketLabHeader";
import { FeatureSubheader } from "@/components/navigation/FeatureSubheader";
import { usePocketLabDevice } from "@/features/device/DeviceProvider";
import { ScanDeviceSheet } from "@/features/device/ScanDeviceSheet";
import { SavedMeasurementsScreen } from "@/features/dmm/components/SavedMeasurementsScreen";
import { listSavedMeasurements } from "@/features/dmm/storage/savedMeasurements";
import { findCategory, findTool } from "@/features/calculator/catalog";
import { toolRegistryConfig } from "@/features/calculator/registry/toolRegistryConfig";
import { AppShellContextProvider } from "@/features/appShell/AppShellContext";
import { useSettingsAdapter } from "@/features/settings/useSettingsAdapter";
import { WorkspaceBar } from "@/components/navigation/WorkspaceBar";

function routePresentation(pathname: string) {
  const path = decodeURIComponent(pathname);
  if (path.startsWith("/calculator")) {
    const tool = path.match(/^\/calculator\/tool\/([^/]+)/);
    if (tool) return { subtitle: "Calculator", child: findTool(tool[1])?.title ?? "Calculator Tool" };
    const category = path.match(/^\/calculator\/category\/([^/]+)/);
    if (category) return { subtitle: "Calculator", child: findCategory(category[1])?.title ?? "Calculator Category" };
    return { subtitle: "Calculator", child: null };
  }
  if (path.startsWith("/log")) return { subtitle: "Log", child: null };
  if (path.startsWith("/dmm")) return { subtitle: "Measure", child: null };
  return { subtitle: "Function Generator", child: null };
}

export function PocketLabAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const pathname = usePathname();
  const location = useMemo(() => routePresentation(pathname), [pathname]);
  const lastCalculatorPath = useRef<Href>("/calculator");
  useEffect(() => {
    if (pathname.startsWith("/calculator")) lastCalculatorPath.current = pathname as Href;
  }, [pathname]);
  const openWorkspace = (workspace: "tools" | "measure" | "log") => {
    if (workspace === "tools") router.navigate(lastCalculatorPath.current);
    else router.navigate(workspace === "measure" ? "/dmm" : "/log");
  };
  const { state, reconnecting, capabilities } = usePocketLabDevice();
  const isMeasureRoute = pathname === "/" || pathname.startsWith("/dmm");
  const activeInstrument = pathname.startsWith("/dmm") ? "dmm" : "function-generator";
  const generatorAvailable = state.connected &&
    (capabilities?.features.includes("FG") ?? false);
  const openInstrument = (instrument: "dmm" | "function-generator") => {
    router.navigate(instrument === "dmm" ? "/dmm" : "/");
  };
  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);
  const [settingsScopeOpen, setSettingsScopeOpen] = useState<string | null>(null);
  const scope = settingsScopeForPath(pathname);
  const settingsVisible = settingsScopeOpen === scope;
  const settingsDefinition = getSettingsDefinition(scope);
  const { values: settingsValues, update: changeSettingsValue } = useSettingsAdapter(scope);

  const [savedCount, setSavedCount] = useState(0);
  const beforeOpen = useRef<(() => Promise<void> | void) | null>(null);
  const opening = useRef(false);
  const drawerOpenRef = useRef<(() => void) | null>(null);
  const registerOpenDrawer = useCallback((open: () => void) => {
    drawerOpenRef.current = open;
    return () => { if (drawerOpenRef.current === open) drawerOpenRef.current = null; };
  }, []);
  const openDrawer = useCallback(() => {
    if (!drawerOpenRef.current) console.warn("Drawer is not ready yet");
    drawerOpenRef.current?.();
  }, []);

  const refreshSavedCount = useCallback(async () => {
    try { setSavedCount((await listSavedMeasurements()).length); }
    catch (error) { console.warn("Unable to refresh saved measurements", error); }
  }, []);
  useEffect(() => {
    let active = true;
    async function loadInitialCount() {
      try {
        const items = await listSavedMeasurements();
        if (active) setSavedCount(items.length);
      } catch (error) {
        console.warn("Unable to load saved measurements", error);
      }
    }
    void loadInitialCount();
    return () => { active = false; };
  }, []);

  const registerBeforeDeviceSheetOpen = useCallback((callback: () => Promise<void> | void) => {
    beforeOpen.current = callback;
    return () => { if (beforeOpen.current === callback) beforeOpen.current = null; };
  }, []);
  const openDeviceSheet = useCallback(async () => {
    if (opening.current || deviceSheetVisible) return;
    opening.current = true;
    try {
      await beforeOpen.current?.();
      setDeviceSheetVisible(true);
    } catch (error) {
      console.warn("Unable to pause measurement before BLE scanning", error);
    } finally { opening.current = false; }
  }, [deviceSheetVisible]);
  const closeDeviceSheet = useCallback(() => setDeviceSheetVisible(false), []);
  const openSavedMeasurements = useCallback(() => {
    void refreshSavedCount();
    setSavedVisible(true);
  }, [refreshSavedCount]);

  const shellValue = useMemo(() => ({
    deviceSheetVisible,
    registerOpenDrawer,
    openDeviceSheet,
    closeDeviceSheet,
    registerBeforeDeviceSheetOpen,
    refreshSavedCount,
    openSavedMeasurements,
    subtitle: location.subtitle,
    connected: state.connected,
    reconnecting,
    savedCount,
  }), [
    deviceSheetVisible,
    registerOpenDrawer,
    openDeviceSheet,
    closeDeviceSheet,
    registerBeforeDeviceSheetOpen,
    refreshSavedCount,
    openSavedMeasurements,
    location.subtitle,
    state.connected,
    reconnecting,
    savedCount,
  ]);

  const goBackInCalculator = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/calculator");
  };

  return (
    <AppShellContextProvider value={shellValue}>
      <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
        <PocketLabHeader
          subtitle={location.subtitle}
          instrument={isMeasureRoute ? activeInstrument : undefined}
          generatorAvailable={generatorAvailable}
          onSelectInstrument={openInstrument}
          compact={isLandscape}
          childTitle={location.child}
          onBack={goBackInCalculator}
          onOpenCalculator={() => router.navigate("/calculator")}
          connected={state.connected}
          reconnecting={reconnecting}
          onOpenDrawer={openDrawer}
          onOpenBleConnection={() => { void openDeviceSheet(); }}
          onOpenSavedMeasurements={openSavedMeasurements}
          savedCount={savedCount}
          onOpenSettings={() => setSettingsScopeOpen(previous => previous === scope ? null : scope)}
        />
        <SettingsPanel
          visible={settingsVisible}
          definition={settingsDefinition}
          values={settingsValues}
          onChange={changeSettingsValue}
          onDismiss={() => setSettingsScopeOpen(null)}
        />
        <View style={styles.workspaceRow}>
          <View style={styles.mainColumn}>
            {!isLandscape && location.child ? (
              <FeatureSubheader title={location.child} onBack={goBackInCalculator}
                toolConfig={pathname.startsWith("/calculator/tool/") ? toolRegistryConfig[decodeURIComponent(pathname.split("/")[3] ?? "")] : undefined} />
            ) : null}
            <View style={styles.content}>{children}</View>
          </View>
          {isLandscape ? (
            <WorkspaceBar pathname={pathname} onSelect={openWorkspace} orientation="vertical" />
          ) : null}
        </View>
        {!isLandscape ? (
          <WorkspaceBar pathname={pathname} onSelect={openWorkspace} orientation="horizontal" />
        ) : null}
      </SafeAreaView>
      <ScanDeviceSheet visible={deviceSheetVisible} onDismiss={closeDeviceSheet} />
      <SavedMeasurementsScreen visible={savedVisible} onClose={() => setSavedVisible(false)} onCountChange={setSavedCount} />
    </AppShellContextProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.darkTeal },
  workspaceRow: { flex: 1, flexDirection: "row" },
  mainColumn: { flex: 1, minWidth: 0 },
  content: { flex: 1, backgroundColor: c.surface },
});
