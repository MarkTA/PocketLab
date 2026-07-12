/* src/components/layout/Screen.tsx */

import React from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenProps = {
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;

  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, "children" | "contentContainerStyle">;
};

export function Screen({
  header,
  children,
  footer,
  contentContainerStyle,
  scrollViewProps,
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {header ? <View style={styles.header}>{header}</View> : null}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
        >
          {children}
        </ScrollView>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },

  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
