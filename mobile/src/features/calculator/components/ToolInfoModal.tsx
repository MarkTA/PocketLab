import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Button, IconButton, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { pocketLabColors as c } from "@/themes/theme";
import type { ToolInfo } from "../registry/types";

type Props = { title: string; info: ToolInfo; visible: boolean; onClose: () => void };

/** Shared, entirely local tool reference article. */
export function ToolInfoModal({ title, info, visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text variant="titleLarge" style={styles.title} numberOfLines={2}>{title}</Text>
          <IconButton icon="close" accessibilityLabel="Close tool information" onPress={onClose} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Section heading="Overview">
            <Text style={styles.body}>{info.overview}</Text>
          </Section>
          <Section heading="Key equations">
            {info.equations.map(equation => (
              <Text key={equation} style={styles.equation}>{equation}</Text>
            ))}
          </Section>
          <Section heading="Common applications">
            {info.applications.map(application => (
              <View key={application.title} style={styles.application}>
                <Text variant="titleSmall" style={styles.applicationTitle}>{application.title}</Text>
                <Text style={styles.body}>{application.description}</Text>
              </View>
            ))}
          </Section>
          {info.considerations?.length ? (
            <Section heading="Practical considerations">
              {info.considerations.map(item => (
                <Text key={item} style={styles.body}>• {item}</Text>
              ))}
            </Section>
          ) : null}
        </ScrollView>
        <View style={styles.footer}><Button mode="contained" onPress={onClose}>Back to calculator</Button></View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ heading, children }: React.PropsWithChildren<{ heading: string }>) {
  return <View style={styles.section}>
    <Text variant="titleMedium" style={styles.heading}>{heading}</Text>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grid },
  title: { color: c.darkTeal, fontWeight: "600", flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 40, gap: 26 },
  section: { gap: 10 },
  heading: { color: c.darkTeal, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 23, color: c.darkTeal },
  equation: { fontSize: 19, lineHeight: 30, color: c.darkTeal, paddingVertical: 3 },
  application: { gap: 3, paddingVertical: 3 },
  applicationTitle: { color: c.darkTeal, fontWeight: "600" },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.grid },
});
