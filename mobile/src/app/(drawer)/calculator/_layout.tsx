import { Stack } from "expo-router";

import { CalculatorCatalogProvider } from "@/features/calculator/CalculatorCatalogProvider";
import { pocketLabColors } from "@/themes/theme";

export default function CalculatorLayout() {
  return (
    <CalculatorCatalogProvider>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: pocketLabColors.darkTeal,
          },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: {
            fontWeight: "600",
          },
          contentStyle: {
            backgroundColor: pocketLabColors.background,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="category/[slug]" />
        <Stack.Screen name="tool/[slug]" />
      </Stack>
    </CalculatorCatalogProvider>
  );
}