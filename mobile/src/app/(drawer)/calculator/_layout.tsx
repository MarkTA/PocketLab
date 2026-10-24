import { Stack } from "expo-router";

import { CalculatorCatalogProvider } from "@/features/calculator/CalculatorCatalogProvider";
import { pocketLabColors } from "@/themes/theme";

export default function CalculatorLayout() {
  return (
    <CalculatorCatalogProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: pocketLabColors.background,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="category/[slug]" />
        <Stack.Screen name="tool/[slug]" />
      </Stack>
    </CalculatorCatalogProvider>
  );
}