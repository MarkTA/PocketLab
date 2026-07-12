/* src/components/layout/ScreenHeader.tsx */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { pocketLabColors } from "@/themes/theme";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        <Text variant="headlineMedium">{title}</Text>

        {subtitle ? <Text variant="titleMedium">{subtitle}</Text> : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: pocketLabColors.teal,
    gap: 16,
  },

  titleContainer: {
    flex: 1,
  },

  right: {
    flexShrink: 0,
  },
});
