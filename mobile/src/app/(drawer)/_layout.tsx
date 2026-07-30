import { Drawer } from "expo-router/drawer";
import { Icon } from "react-native-paper";

import { pocketLabColors } from "@/themes/theme";

export default function DrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: pocketLabColors.darkTeal,
        drawerActiveBackgroundColor: "#E7F2F4",
        drawerInactiveTintColor: pocketLabColors.mutedText,
        drawerLabelStyle: {
          marginLeft: -12,
          fontSize: 15,
          fontWeight: "600",
        },
        drawerStyle: {
          backgroundColor: pocketLabColors.surface,
        },
        drawerType: "front",
        swipeEdgeWidth: 48,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: "Function Generator",
          drawerLabel: "Function Generator",
          drawerIcon: ({ color, size }) => (
            <Icon
              source="sine-wave"
              color={typeof color === "string" ? color : pocketLabColors.darkTeal}
              size={size}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="calculator"
        options={{
          title: "EE Calculator",
          drawerLabel: "EE Calculator",
          drawerIcon: ({ color, size }) => (
            <Icon
              source="calculator-variant-outline"
              color={typeof color === "string" ? color : pocketLabColors.darkTeal}
              size={size}
            />
          ),
        }}
      />
    </Drawer>
  );
}