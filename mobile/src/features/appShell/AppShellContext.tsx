import { createContext, useContext, type ReactNode } from "react";

type AppShellActions = {
  deviceSheetVisible: boolean;
  registerOpenDrawer: (callback: () => void) => () => void;
  openDeviceSheet: () => Promise<void>;
  closeDeviceSheet: () => void;
  registerBeforeDeviceSheetOpen: (callback: () => Promise<void> | void) => () => void;
  refreshSavedCount: () => Promise<void>;
  openSavedMeasurements: () => void;
  subtitle: string;
  connected: boolean;
  reconnecting: boolean;
  savedCount: number;
};

const AppShellContext = createContext<AppShellActions | null>(null);

export function AppShellContextProvider({ value, children }: { value: AppShellActions; children: ReactNode }) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

// Only feature logic that must coordinate with a global dialog needs this hook.
export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell requires PocketLabAppShell");
  return context;
}
