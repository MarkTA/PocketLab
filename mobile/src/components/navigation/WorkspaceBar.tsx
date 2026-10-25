import { StyleSheet, View, Pressable } from "react-native";
import { Icon, Text } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";

type Workspace = "tools" | "measure" | "log";

const workspaces: { id: Workspace; label: string; icon: string }[] = [
  { id: "tools", label: "Tools", icon: "calculator-variant-outline" },
  { id: "measure", label: "Measure", icon: "gauge" },
  { id: "log", label: "Log", icon: "notebook-outline" },
];

export function WorkspaceBar({
  pathname,
  onSelect,
  orientation = "horizontal",
}: {
  pathname: string;
  onSelect: (workspace: Workspace) => void;
  orientation?: "horizontal" | "vertical";
}) {
  const active: Workspace = pathname.startsWith("/calculator")
    ? "tools"
    : pathname.startsWith("/log")
      ? "log"
      : "measure";

  const vertical = orientation === "vertical";

  return (
    <View style={[styles.bar, vertical ? styles.rail : styles.bottomBar]} accessibilityRole="tablist">
      {workspaces.map(({ id, label, icon }) => {
        const selected = id === active;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityLabel={`${label} workspace`}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) onSelect(id); }}
            style={[styles.tab, vertical ? styles.railTab : styles.bottomTab, selected && styles.selected]}
          >
            <Icon source={icon} size={23} color={selected ? c.darkTeal : c.mutedText} />
            <Text style={[styles.label, { color: selected ? c.darkTeal : c.mutedText }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: c.surface },
  bottomBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.mutedText,
  },
  rail: {
    width: 84,
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: c.mutedText,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bottomTab: { flex: 1, minHeight: 62 },
  railTab: { minHeight: 70, paddingVertical: 7 },
  selected: { backgroundColor: "#E7F2F4" },
  label: { fontSize: 12, fontWeight: "600" },
});
