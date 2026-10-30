import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";
import type { ToolEquationVariant } from "../registry/types";

/** Compact, fixed secondary navigation for any calculator with equation variants. */
export function ToolVariantTabs({ variants, selectedId, onSelect }: {
  variants: readonly Pick<ToolEquationVariant, "id" | "label">[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return <View style={styles.bar} accessibilityRole="tablist">
    {variants.map(variant => {
      const selected = variant.id === selectedId;
      return <Pressable key={variant.id} accessibilityRole="tab" accessibilityState={{ selected }}
        onPress={() => onSelect(variant.id)}
        style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}>
        <Text style={[styles.label, { color: selected ? c.darkTeal : c.mutedText }]} numberOfLines={1}>
          {variant.label}
        </Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.mutedText },
  tab: { flex: 1, minWidth: 0, height: 38, justifyContent: "center", alignItems: "center" },
  selected: { backgroundColor: "#E7F2F4" },
  pressed: { opacity: 0.75 },
  label: { fontSize: 13, fontWeight: "500" },
});
