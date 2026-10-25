import { useEffect } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Drawer } from "expo-router/drawer";
import { usePathname, useRouter } from "expo-router";
import { Drawer as PaperDrawer } from "react-native-paper";

import { PocketLabAppShell } from "@/components/layout/PocketLabAppShell";
import { useAppShell } from "@/features/appShell/AppShellContext";
import { pocketLabColors as c } from "@/themes/theme";

// These are the navigation methods supplied to the Drawer content by
// expo-router/drawer. No @react-navigation/drawer import is required.
type DrawerContentNavigation = {
  openDrawer: () => void;
  closeDrawer: () => void;
};

type DrawerContentProps = {
  navigation: DrawerContentNavigation;
};

function PocketLabDrawerContent({ navigation }: DrawerContentProps) {
  const { registerOpenDrawer } = useAppShell();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    return registerOpenDrawer(() => navigation.openDrawer());
  }, [navigation, registerOpenDrawer]);

  const navigate = (href: "/" | "/dmm" | "/calculator" | "/log") => {
    navigation.closeDrawer();
    router.navigate(href);
  };

  return (
    <ScrollView
      style={styles.drawerContent}
      contentContainerStyle={styles.drawerContentContainer}
    >
      <PaperDrawer.Section showDivider={false}>
        <PaperDrawer.Item
          icon="sine-wave"
          label="Function Generator"
          active={pathname === "/"}
          onPress={() => navigate("/")}
        />
        <PaperDrawer.Item
          icon="gauge"
          label="Digital Multimeter"
          active={pathname.startsWith("/dmm")}
          onPress={() => navigate("/dmm")}
        />
        <PaperDrawer.Item
          icon="calculator-variant-outline"
          label="EE Calculator"
          active={pathname.startsWith("/calculator")}
          onPress={() => navigate("/calculator")}
        />
        <PaperDrawer.Item
          icon="notebook-outline"
          label="Log"
          active={pathname.startsWith("/log")}
          onPress={() => navigate("/log")}
        />
      </PaperDrawer.Section>
    </ScrollView>
  );
}

function DrawerNavigator() {
  return (
    <Drawer
      drawerContent={(props) => (
        <PocketLabDrawerContent navigation={props.navigation} />
      )}
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: c.darkTeal,
        drawerActiveBackgroundColor: "#E7F2F4",
        drawerInactiveTintColor: c.mutedText,
        drawerLabelStyle: { marginLeft: -12, fontSize: 15, fontWeight: "600" },
        drawerStyle: { backgroundColor: c.surface },
        drawerType: "front",
        swipeEnabled: false,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: "Function Generator",
          drawerLabel: "Function Generator",
        }}
      />
      <Drawer.Screen
        name="dmm"
        options={{
          title: "Digital Multimeter",
          drawerLabel: "Digital Multimeter",
        }}
      />
      <Drawer.Screen
        name="log"
        options={{ title: "Log", drawerLabel: "Log" }}
      />
      <Drawer.Screen
        name="calculator"
        options={{
          title: "EE Calculator",
          drawerLabel: "EE Calculator",
        }}
      />
    </Drawer>
  );
}

export default function DrawerLayout() {
  return (
    <PocketLabAppShell>
      <DrawerNavigator />
    </PocketLabAppShell>
  );
}

const styles = StyleSheet.create({
  drawerContent: { flex: 1, backgroundColor: c.surface },
  drawerContentContainer: { paddingTop: 14 },
});
