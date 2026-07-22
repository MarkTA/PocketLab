/* src/components/layout/Screen.tsx */

import React from "react";
import { StyleSheet, View, Text, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { pocketLabColors } from "@/themes/theme";

type ScreenProps = {
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;

  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({ header, children, footer, contentContainerStyle }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      {header ? <View style={styles.header}>{header}</View> : null}
      <View style={styles.container}>
        <View style={[styles.content, contentContainerStyle]}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: pocketLabColors.teal,
  },

  container: {
    flex: 1,
    backgroundColor: pocketLabColors.surface,
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: pocketLabColors.teal,
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
