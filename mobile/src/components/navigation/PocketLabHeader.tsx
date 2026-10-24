import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Appbar, Menu, Text } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";

type Props = {
  subtitle: string;
  connected: boolean;
  reconnecting: boolean;
  onOpenDrawer: () => void;
  onOpenBleConnection: () => void;
  onOpenSavedMeasurements: () => void;
  onOpenSettings?: () => void;
  savedCount: number;
};

export function PocketLabHeader({ subtitle, connected, reconnecting, onOpenDrawer, onOpenBleConnection, onOpenSavedMeasurements, onOpenSettings, savedCount }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const invoke = (action: () => void) => { setMenuVisible(false); action(); };
  return (
    <Appbar.Header style={styles.header}>
      <Appbar.Action icon="menu" color="white" accessibilityLabel="Open navigation drawer" onPress={onOpenDrawer} />
      <Appbar.Content title={
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>PocketLab</Text>
          <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
        </View>
      } />
      <Appbar.Action
        icon={reconnecting ? "bluetooth-transfer" : connected ? "bluetooth-connect" : "bluetooth-off"}
        color={connected ? "#B8F3E5" : "white"}
        accessibilityLabel={reconnecting ? "Bluetooth reconnecting" : connected ? "Bluetooth connected" : "Bluetooth disconnected"}
        onPress={onOpenBleConnection}
      />
      <Menu visible={menuVisible} onDismiss={() => setMenuVisible(false)} anchor={
        <Appbar.Action icon="dots-vertical" color="white" accessibilityLabel="More options" onPress={() => setMenuVisible(true)} />
      }>
        <Menu.Item title="BLE Connection" leadingIcon="bluetooth" onPress={() => invoke(onOpenBleConnection)} />
        <Menu.Item title="Settings" leadingIcon="cog-outline" disabled={!onOpenSettings} onPress={() => { if (onOpenSettings) invoke(onOpenSettings); }} />
        <Menu.Item title={savedCount ? `Saved Measurements (${savedCount})` : "Saved Measurements"} leadingIcon="bookmark-multiple-outline" onPress={() => invoke(onOpenSavedMeasurements)} />
      </Menu>
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: c.darkTeal },
  titleBlock: { justifyContent: "center", gap: 1 },
  title: { fontSize: 20, fontWeight: "600", color: "white", lineHeight: 24 },
  subtitle: { fontSize: 12, color: "#D8E9E9", lineHeight: 17 },
});
