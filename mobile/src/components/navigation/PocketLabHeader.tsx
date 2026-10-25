import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  compact?: boolean;
  childTitle?: string | null;
  onBack?: () => void;
  onOpenCalculator?: () => void;
};

export function PocketLabHeader({ subtitle, connected, reconnecting, onOpenDrawer, onOpenBleConnection, onOpenSavedMeasurements, onOpenSettings, savedCount, compact = false, childTitle, onBack, onOpenCalculator }: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const invoke = (action: () => void) => { setMenuVisible(false); action(); };
  return (
    <Appbar.Header statusBarHeight={0} style={[styles.header, compact && styles.compactHeader]}>
      <Appbar.Action icon="menu" color="white" accessibilityLabel="Open navigation drawer" onPress={onOpenDrawer} />
      {compact && childTitle && onBack ? (
        <Appbar.Action icon="arrow-left" color="white" accessibilityLabel={`Back from ${childTitle}`} onPress={onBack} />
      ) : null}
      <Appbar.Content title={
        compact ? (
          <View style={styles.breadcrumbs}>
            <Text numberOfLines={1} style={styles.compactBrand}>PocketLab</Text>
            <Text style={styles.compactContext}> / </Text>
            {childTitle && onOpenCalculator ? (
              <>
                <Pressable
                  onPress={onOpenCalculator}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${subtitle} catalog`}
                  hitSlop={8}
                >
                  <Text numberOfLines={1} style={styles.breadcrumbLink}>{subtitle}</Text>
                </Pressable>
                <Text style={styles.compactContext}> / </Text>
                <Text numberOfLines={1} style={styles.breadcrumbCurrent}>{childTitle}</Text>
              </>
            ) : (
              <Text numberOfLines={1} style={styles.breadcrumbCurrent}>{subtitle}</Text>
            )}
          </View>
        ) : (
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={styles.title}>PocketLab</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
          </View>
        )
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
  compactHeader: { height: 52 },
  breadcrumbs: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  breadcrumbLink: { color: "#D8E9E9", fontSize: 16, textDecorationLine: "underline" },
  breadcrumbCurrent: { color: "#D8E9E9", fontSize: 16, flexShrink: 1 },
  compactBrand: { color: "white", fontWeight: "600" },
  compactContext: { color: "#D8E9E9", fontWeight: "400" },
  titleBlock: { justifyContent: "center", gap: 1 },
  title: { fontSize: 20, fontWeight: "600", color: "white", lineHeight: 24 },
  subtitle: { fontSize: 12, color: "#D8E9E9", lineHeight: 17 },
});
