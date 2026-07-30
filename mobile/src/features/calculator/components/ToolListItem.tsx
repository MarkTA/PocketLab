import type { GestureResponderEvent } from "react-native";
import { StyleSheet, View } from "react-native";
import { Icon, IconButton, Text, TouchableRipple } from "react-native-paper";

import { pocketLabColors } from "@/themes/theme";

import type { CalculatorTool } from "../catalog";

type ToolListItemProps = {
  tool: CalculatorTool;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
};

export function ToolListItem({
  tool,
  favorite,
  onPress,
  onToggleFavorite,
}: ToolListItemProps) {
  const handleFavoritePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleFavorite();
  };

  return (
    <TouchableRipple onPress={onPress} borderless style={styles.container}>
      <View style={styles.content}>
        <View style={styles.toolIcon}>
          <Icon
            source={tool.template === "Interactive" ? "gesture-tap" : "function-variant"}
            size={22}
          />
        </View>
        <View style={styles.copy}>
          <Text variant="titleMedium">{tool.title}</Text>
          <Text variant="bodySmall" style={styles.description} numberOfLines={2}>
            {tool.description}
          </Text>
        </View>
        <IconButton
          icon={favorite ? "star" : "star-outline"}
          iconColor={favorite ? pocketLabColors.orange : pocketLabColors.mutedText}
          size={22}
          accessibilityLabel={favorite ? `Unpin ${tool.title}` : `Pin ${tool.title}`}
          onPress={handleFavoritePress}
        />
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    backgroundColor: pocketLabColors.surface,
  },
  content: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
  },
  toolIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#E7F2F4",
  },
  copy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  description: {
    marginTop: 3,
    color: pocketLabColors.mutedText,
    lineHeight: 17,
  },
});