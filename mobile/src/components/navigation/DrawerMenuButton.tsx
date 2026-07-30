import { useNavigation } from "expo-router";
import { IconButton } from "react-native-paper";

type DrawerNavigation = {
  openDrawer: () => void;
};

export function DrawerMenuButton() {
  const navigation = useNavigation<DrawerNavigation>("/(drawer)");

  return (
    <IconButton
      icon="menu"
      iconColor="#FFFFFF"
      size={28}
      accessibilityLabel="Open navigation menu"
      onPress={() => navigation.openDrawer()}
    />
  );
}