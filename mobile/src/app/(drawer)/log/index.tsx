import { StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { useAppShell } from "@/features/appShell/AppShellContext";

// Stage 1: reuse the existing saved-measurements sheet.
// A full Log workspace (components, captures, sessions) comes next.
export default function LogRoute() {
  const { openSavedMeasurements } = useAppShell();
  return (
    <View style={styles.root}>
      <Text variant="headlineSmall">Log</Text>
      <Text variant="bodyMedium" style={styles.description}>
        Your saved measurements live here. Later this workspace will also
        contain identified components and measurement sessions.
      </Text>
      <Button mode="contained" icon="bookmark-outline" onPress={openSavedMeasurements}>
        Browse saved measurements
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  description: { lineHeight: 23 },
});
