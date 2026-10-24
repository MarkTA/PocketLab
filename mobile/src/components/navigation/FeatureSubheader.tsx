import { Appbar, Text } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import { pocketLabColors as c } from "@/themes/theme";

type Props = { title: string; onBack: () => void };

export function FeatureSubheader({ title, onBack }: Props) {
  return (
    <View style={styles.row}>
      <Appbar.Action icon="arrow-left" accessibilityLabel={`Back from ${title}`} onPress={onBack} size={22} />
      <Text variant="titleMedium" numberOfLines={1} style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D4DEDE" },
  title: { flex: 1, fontWeight: "600", color: c.darkTeal, marginRight: 12 },
});
