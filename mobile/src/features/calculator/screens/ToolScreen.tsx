import { Stack } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Icon, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { pocketLabColors } from "@/themes/theme";

import { useCalculatorCatalog } from "../CalculatorCatalogProvider";
import { findCategory, findTool } from "../catalog";

export function ToolScreen({ slug }: { slug: string | undefined }) {
  const tool = findTool(slug);
  const category = findCategory(tool?.categorySlug);
  const { isFavorite, toggleFavorite } = useCalculatorCatalog();

  return (
    <>
      <Stack.Screen options={{ title: tool?.title ?? "Calculator tool" }} />
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.content}>
          {tool ? (
            <>
              <View style={styles.hero}>
                <View style={styles.heroIcon}>
                  <Icon
                    source={
                      tool.template === "Interactive" ? "gesture-tap" : "function-variant"
                    }
                    size={34}
                    color={pocketLabColors.darkTeal}
                  />
                </View>
                <Text variant="headlineSmall" style={styles.title}>
                  {tool.title}
                </Text>
                <Text variant="bodyLarge" style={styles.description}>
                  {tool.description}
                </Text>
                <View style={styles.chips}>
                  <Chip compact icon="shape-outline">
                    {category?.title}
                  </Chip>
                  <Chip compact icon="view-dashboard-outline">
                    {tool.template}
                  </Chip>
                </View>
                <Button
                  mode={isFavorite(tool.slug) ? "contained-tonal" : "outlined"}
                  icon={isFavorite(tool.slug) ? "star" : "star-outline"}
                  onPress={() => toggleFavorite(tool.slug)}
                >
                  {isFavorite(tool.slug) ? "Pinned to favorites" : "Pin to favorites"}
                </Button>
              </View>

              <View style={styles.placeholder}>
                <Icon source="wrench-clock" size={32} color={pocketLabColors.mutedText} />
                <Text variant="titleMedium">Workspace route ready</Text>
                <Text variant="bodyMedium" style={styles.placeholderText}>
                  Inputs, equations, results, and validation for this tool will be added
                  on top of this shared calculator workspace.
                </Text>
              </View>
            </>
          ) : (
            <Text variant="bodyLarge">This calculator tool could not be found.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: pocketLabColors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  hero: {
    alignItems: "flex-start",
    gap: 12,
    padding: 20,
    borderRadius: 12,
    backgroundColor: pocketLabColors.surface,
  },
  heroIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#E7F2F4",
  },
  title: {
    fontWeight: "600",
  },
  description: {
    color: pocketLabColors.mutedText,
    lineHeight: 24,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  placeholder: {
    alignItems: "center",
    gap: 8,
    padding: 24,
    borderRadius: 12,
    backgroundColor: pocketLabColors.surface,
  },
  placeholderText: {
    maxWidth: 420,
    textAlign: "center",
    color: pocketLabColors.mutedText,
    lineHeight: 21,
  },
});