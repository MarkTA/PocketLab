import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CalculatorPreferencesProvider } from "@/features/calculator/preferences/calculatorPreferences";
import { DmmPreferencesProvider } from "@/features/dmm/preferences/DmmPreferencesProvider";
import { DeviceProvider } from "@/features/device/DeviceProvider";
import { ContinuityAudioHost } from "@/features/dmm/components/ContinuityAudioHost";
import { paperTheme } from "@/themes/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <DeviceProvider>
            <ContinuityAudioHost />
            <CalculatorPreferencesProvider>
              <DmmPreferencesProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(drawer)" />
                </Stack>
              </DmmPreferencesProvider>
            </CalculatorPreferencesProvider>
          </DeviceProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}