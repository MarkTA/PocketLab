import { SafeAreaProvider } from "react-native-safe-area-context";
import { PaperProvider } from "react-native-paper";

import { DeviceProvider } from "../features/device/DeviceProvider";
import { FunctionGeneratorScreen } from "../features/functionGenerator/FunctionGeneratorScreen";
import { paperTheme } from "../themes/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <DeviceProvider>
          <FunctionGeneratorScreen />
        </DeviceProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
