import { useNavigation } from "expo-router";
import { Appbar } from "react-native-paper";

type DrawerNavigation = { openDrawer: () => void };

/** The existing Expo Router drawer remains the single navigation source. */
export function DrawerMenuButton() {
  const navigation = useNavigation<DrawerNavigation>("/(drawer)");

  return (
    <Appbar.Action
      icon="menu"
      iconColor="#FFFFFF"
      accessibilityLabel="Open navigation menu"
      onPress={() => navigation.openDrawer()}
    />
  );
}
