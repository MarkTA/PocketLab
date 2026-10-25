/* src/components/layout/Screen.tsx */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { pocketLabColors } from "@/themes/theme";

type ScreenProps = {
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footerContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({ header, children, footer, contentContainerStyle, footerContainerStyle }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={styles.container}>
        <View style={[styles.content, contentContainerStyle]}>{children}</View>
        {footer ? <View style={[styles.footer, footerContainerStyle]}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: pocketLabColors.darkTeal },
  container: { flex: 1, backgroundColor: pocketLabColors.surface },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 0, gap: 1 },
  footer: { paddingHorizontal: 16, paddingVertical: 0 },
});
