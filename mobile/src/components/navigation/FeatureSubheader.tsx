import { ToolInfoModal } from "@/features/calculator/components/ToolInfoModal";
import type { ToolConfig } from "@/features/calculator/registry/types";
import { pocketLabColors as c } from "@/themes/theme";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Appbar, IconButton, Text } from "react-native-paper";

type Props = { title: string; onBack: () => void; toolConfig?: ToolConfig };

export function FeatureSubheader({ title, onBack, toolConfig }: Props) {
  const [infoVisible, setInfoVisible] = useState(false);
  return (
    <View style={styles.row}>
      <Appbar.Action
        icon="arrow-left"
        accessibilityLabel={`Back from ${title}`}
        onPress={onBack}
        size={22}
      />
      <Text
        variant="titleMedium"
        numberOfLines={1}
        style={[styles.title, toolConfig?.info ? styles.titleWithInfo : undefined]}
      >
        {title}
      </Text>
      {toolConfig?.info ? (
        <IconButton
          icon="information-outline"
          size={21}
          onPress={() => setInfoVisible(true)}
          accessibilityLabel={`About ${title}`}
          style={styles.infoButton}
        />
      ) : null}
      {toolConfig?.info ? (
        <ToolInfoModal
          visible={infoVisible}
          title={toolConfig.title}
          info={toolConfig.info}
          onClose={() => setInfoVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D4DEDE",
  },
  title: { flex: 1, fontWeight: "600", color: c.darkTeal, marginRight: 12 },
  titleWithInfo: { flex: 0, flexShrink: 1, marginRight: 0 },
  infoButton: { marginLeft: 0 },
});
