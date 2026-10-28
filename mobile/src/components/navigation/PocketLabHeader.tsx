import { pocketLabColors as c } from "@/themes/theme";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Appbar, Menu, Text } from "react-native-paper";

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
  instrument?: "dmm" | "function-generator";
  generatorAvailable?: boolean;
  onSelectInstrument?: (instrument: "dmm" | "function-generator") => void;
};

export function PocketLabHeader({
  subtitle,
  connected,
  reconnecting,
  onOpenDrawer,
  onOpenBleConnection,
  onOpenSavedMeasurements,
  onOpenSettings,
  savedCount,
  compact = false,
  childTitle,
  onBack,
  onOpenCalculator,
  instrument,
  generatorAvailable = false,
  onSelectInstrument,
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [instrumentMenuVisible, setInstrumentMenuVisible] = useState(false);
  const invoke = (action: () => void) => {
    setMenuVisible(false);
    action();
  };
  return (
    <Appbar.Header
      statusBarHeight={0}
      style={[styles.header, compact && styles.compactHeader]}
    >
      <Appbar.Action
        icon="menu"
        color="white"
        accessibilityLabel="Open navigation drawer"
        onPress={onOpenDrawer}
      />
      {compact && childTitle && onBack ? (
        <Appbar.Action
          icon="arrow-left"
          color="white"
          accessibilityLabel={`Back from ${childTitle}`}
          onPress={onBack}
        />
      ) : null}
      <Appbar.Content
        title={
          compact ? (
            <View style={styles.breadcrumbs}>
              <Text numberOfLines={1} style={styles.compactBrand}>
                PocketLab
              </Text>
              <Text style={styles.compactContext}> / </Text>
              {childTitle && onOpenCalculator ? (
                <>
                  <Pressable
                    onPress={onOpenCalculator}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${subtitle} catalog`}
                    hitSlop={8}
                  >
                    <Text numberOfLines={1} style={styles.breadcrumbLink}>
                      {subtitle}
                    </Text>
                  </Pressable>
                  <Text style={styles.compactContext}> / </Text>
                  <Text numberOfLines={1} style={styles.breadcrumbCurrent}>
                    {childTitle}
                  </Text>
                </>
              ) : (
                <Text numberOfLines={1} style={styles.breadcrumbCurrent}>
                  {subtitle}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.titleBlock}>
              <Text numberOfLines={1} style={styles.title}>
                PocketLab
              </Text>
              {instrument && onSelectInstrument ? (
                <Menu
                  visible={instrumentMenuVisible}
                  onDismiss={() => setInstrumentMenuVisible(false)}
                  anchor={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select measurement instrument"
                      onPress={() => setInstrumentMenuVisible(true)}
                      style={styles.instrumentTrigger}
                    >
                      <Text numberOfLines={1} style={styles.instrumentSubtitle}>
                        {instrument === "dmm"
                          ? "Digital Multimeter"
                          : "Function Generator"}
                      </Text>
                      <Appbar.Action
                        icon="chevron-down"
                        color="#D8E9E9"
                        size={18}
                        style={styles.chevron}
                        onPress={() => setInstrumentMenuVisible(true)}
                      />
                    </Pressable>
                  }
                >
                  <Menu.Item
                    title="Digital Multimeter"
                    leadingIcon="gauge"
                    onPress={() => {
                      setInstrumentMenuVisible(false);
                      onSelectInstrument("dmm");
                    }}
                  />
                  <Menu.Item
                    title={
                      generatorAvailable
                        ? "Function Generator"
                        : "Function Generator · Preview"
                    }
                    leadingIcon="sine-wave"
                    onPress={() => {
                      setInstrumentMenuVisible(false);
                      onSelectInstrument("function-generator");
                    }}
                  />
                </Menu>
              ) : (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {subtitle}
                </Text>
              )}
            </View>
          )
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          reconnecting
            ? "Bluetooth reconnecting. Open device connections"
            : connected
              ? "Bluetooth connected. Open device connections"
              : "Bluetooth disconnected. Open device connections"
        }
        onPress={onOpenBleConnection}
        style={styles.bleButton}
        hitSlop={8}
      >
        <View
          style={[
            styles.statusDot,
            connected ? styles.dotConnected : styles.dotDisconnected,
          ]}
        />
        <Text style={styles.statusText}>{connected ? "connected" : "offline"}</Text>
      </Pressable>
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <Appbar.Action
            icon="dots-vertical"
            color="white"
            accessibilityLabel="More options"
            onPress={() => setMenuVisible(true)}
          />
        }
      >
        <Menu.Item
          title="BLE Connection"
          leadingIcon="bluetooth"
          onPress={() => invoke(onOpenBleConnection)}
        />
        <Menu.Item
          title="Settings"
          leadingIcon="cog-outline"
          disabled={!onOpenSettings}
          onPress={() => {
            if (onOpenSettings) invoke(onOpenSettings);
          }}
        />
        <Menu.Item
          title={savedCount ? `Saved Measurements (${savedCount})` : "Saved Measurements"}
          leadingIcon="bookmark-multiple-outline"
          onPress={() => invoke(onOpenSavedMeasurements)}
        />
      </Menu>
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: c.darkTeal, height: 76 },
  compactHeader: { height: 52 },
  instrumentTrigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 28,
  },
  instrumentSubtitle: { color: "#D8E9E9", fontSize: 15, fontWeight: "500" },
  chevron: { width: 25, height: 26, margin: 0 },
  bleButton: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  statusDot: { width: 20, height: 20, borderRadius: 10 },
  dotConnected: { backgroundColor: c.green },
  dotDisconnected: { backgroundColor: c.deviceOff },
  statusText: { color: c.deviceOff, fontSize: 10, marginTop: 4 },
  breadcrumbs: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  breadcrumbLink: { color: "#D8E9E9", fontSize: 16, textDecorationLine: "underline" },
  breadcrumbCurrent: { color: "#D8E9E9", fontSize: 16, flexShrink: 1 },
  compactBrand: { color: "white", fontWeight: "600" },
  compactContext: { color: "#D8E9E9", fontWeight: "400" },
  titleBlock: { justifyContent: "center", gap: 1 },
  title: { fontSize: 20, fontWeight: "600", color: "white", lineHeight: 24 },
  subtitle: { fontSize: 12, color: "#D8E9E9", lineHeight: 17 },
});
