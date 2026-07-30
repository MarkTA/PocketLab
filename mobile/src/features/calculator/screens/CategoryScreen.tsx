import { type Href, Stack, useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { pocketLabColors } from "@/themes/theme";

import { useCalculatorCatalog } from "../CalculatorCatalogProvider";
import { calculatorTools, findCategory, type CalculatorTool } from "../catalog";
import { ToolListItem } from "../components/ToolListItem";

export function CategoryScreen({ slug }: { slug: string | undefined }) {
  const router = useRouter();
  const category = findCategory(slug);
  const { isFavorite, toggleFavorite } = useCalculatorCatalog();
  const tools = calculatorTools.filter((tool) => tool.categorySlug === category?.slug);

  const openTool = (tool: CalculatorTool) => {
    router.push(`/calculator/tool/${tool.slug}` as Href);
  };

  return (
    <>
      <Stack.Screen options={{ title: category?.title ?? "Calculator topic" }} />
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {category ? (
            <>
              <View style={styles.intro}>
                <View style={styles.icon}>
                  <Icon
                    source={category.icon}
                    size={30}
                    color={pocketLabColors.darkTeal}
                  />
                </View>
                <Text variant="bodyLarge" style={styles.description}>
                  {category.description}
                </Text>
              </View>

              <View style={styles.toolList}>
                <Text variant="titleLarge" style={styles.heading}>
                  Tools
                </Text>
                {tools.map((tool) => (
                  <ToolListItem
                    key={tool.slug}
                    tool={tool}
                    favorite={isFavorite(tool.slug)}
                    onPress={() => openTool(tool)}
                    onToggleFavorite={() => toggleFavorite(tool.slug)}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text variant="bodyLarge">This calculator topic could not be found.</Text>
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
    gap: 24,
  },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 12,
    backgroundColor: pocketLabColors.surface,
  },
  icon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E7F2F4",
  },
  description: {
    flex: 1,
    color: pocketLabColors.mutedText,
    lineHeight: 23,
  },
  toolList: {
    gap: 10,
  },
  heading: {
    marginBottom: 2,
    fontWeight: "600",
  },
});