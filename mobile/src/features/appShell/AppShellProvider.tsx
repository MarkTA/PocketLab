import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ScanDeviceSheet } from "@/features/device/ScanDeviceSheet";

type BeforeDeviceSheetOpen = () => Promise<void> | void;

type AppShellContextValue = {
  deviceSheetVisible: boolean;
  openDeviceSheet: () => Promise<void>;
  closeDeviceSheet: () => void;
  registerBeforeDeviceSheetOpen: (callback: BeforeDeviceSheetOpen) => () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [deviceSheetVisible, setDeviceSheetVisible] = useState(false);
  const beforeOpen = useRef<BeforeDeviceSheetOpen | null>(null);
  const opening = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const registerBeforeDeviceSheetOpen = useCallback((callback: BeforeDeviceSheetOpen) => {
    beforeOpen.current = callback;
    return () => {
      if (beforeOpen.current === callback) beforeOpen.current = null;
    };
  }, []);

  const openDeviceSheet = useCallback(async () => {
    if (opening.current || deviceSheetVisible) return;
    opening.current = true;
    try {
      await beforeOpen.current?.();
      if (mounted.current) setDeviceSheetVisible(true);
    } catch (error) {
      // Do not begin scanning if the DMM was unable to stop its measurement loop.
      console.warn("Unable to prepare device sheet", error);
    } finally {
      opening.current = false;
    }
  }, [deviceSheetVisible]);

  const closeDeviceSheet = useCallback(() => setDeviceSheetVisible(false), []);

  return (
    <AppShellContext.Provider value={{
      deviceSheetVisible,
      openDeviceSheet,
      closeDeviceSheet,
      registerBeforeDeviceSheetOpen,
    }}>
      {children}
      <ScanDeviceSheet visible={deviceSheetVisible} onDismiss={closeDeviceSheet} />
    </AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell must be used within AppShellProvider");
  return context;
}
