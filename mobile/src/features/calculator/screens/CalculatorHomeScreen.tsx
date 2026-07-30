import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Icon, Searchbar, Text, TouchableRipple } from "react-native-paper";

import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { pocketLabColors } from "@/themes/theme";

import { useCalculatorCatalog } from "../CalculatorCatalogProvider";
import {
  calculatorCategories,
  calculatorTools,
  searchTools,
  type CalculatorCategory,
  type CalculatorTool,
} from "../catalog";
import { ToolListItem } from "../components/ToolListItem";

export function CalculatorHomeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { favoriteSlugs, isFavorite, toggleFavorite } = useCalculatorCatalog();

  const favoriteTools = useMemo(
    () =>
      favoriteSlugs
        .map((slug) => calculatorTools.find((tool) => tool.slug === slug))
        .filter((tool): tool is CalculatorTool => Boolean(tool)),
    [favoriteSlugs]
  );
  const results = useMemo(() => searchTools(query), [query]);
  const searching = query.trim().length > 0;

  const openTool = (tool: CalculatorTool) => {
    router.push(`/calculator/tool/${tool.slug}` as Href);
  };

  const openCategory = (category: CalculatorCategory) => {
    router.push(`/calculator/category/${category.slug}` as Href);
  };

  return (
    <Screen
      header={<ScreenHeader title="PocketLab" subtitle="EE Calculator" />}
      contentContainerStyle={styles.screenContent}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchSection}>
          <Text variant="bodyMedium" style={styles.intro}>
            Search by equation, variable, component, or engineering task.
          </Text>
          <Searchbar
            placeholder="Try “Vpp”, “KCL”, or “antenna”"
            value={query}
            onChangeText={setQuery}
            elevation={0}
            style={styles.search}
          />
        </View>

        {searching ? (
          <Section title={`Search results (${results.length})`}>
            {results.length ? (
              results.map((tool) => (
                <ToolListItem
                  key={tool.slug}
                  tool={tool}
                  favorite={isFavorite(tool.slug)}
                  onPress={() => openTool(tool)}
                  onToggleFavorite={() => toggleFavorite(tool.slug)}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Icon
                  source="magnify-close"
                  size={28}
                  color={pocketLabColors.mutedText}
                />
                <Text variant="bodyMedium" style={styles.emptyText}>
                  No exact match. Browse the topics below to see what is available.
                </Text>
              </View>
            )}
          </Section>
        ) : (
          <>
            <Section
              title="Pinned favorites"
              subtitle="Your most-used tools stay within one tap."
            >
              {favoriteTools.map((tool) => (
                <ToolListItem
                  key={tool.slug}
                  tool={tool}
                  favorite
                  onPress={() => openTool(tool)}
                  onToggleFavorite={() => toggleFavorite(tool.slug)}
                />
              ))}
              {!favoriteTools.length ? (
                <Text variant="bodyMedium" style={styles.emptyText}>
                  Tap a star beside any tool to pin it here.
                </Text>
              ) : null}
            </Section>

            <Section
              title="Browse by topic"
              subtitle="Explore related tools without needing to know a formula’s name."
            >
              <View style={styles.categoryGrid}>
                {calculatorCategories.map((category) => (
                  <CategoryCard
                    key={category.slug}
                    category={category}
                    toolCount={
                      calculatorTools.filter(
                        (tool) => tool.categorySlug === category.slug
                      ).length
                    }
                    onPress={() => openCategory(category)}
                  />
                ))}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <View style={styles.section}>
      <View>
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" style={styles.sectionSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function CategoryCard({
  category,
  toolCount,
  onPress,
}: {
  category: CalculatorCategory;
  toolCount: number;
  onPress: () => void;
}) {
  return (
    <TouchableRipple onPress={onPress} borderless style={styles.categoryCard}>
      <View style={styles.categoryContent}>
        <View style={styles.categoryIcon}>
          <Icon source={category.icon} size={26} color={pocketLabColors.darkTeal} />
        </View>
        <Text variant="titleMedium" style={styles.categoryTitle}>
          {category.title}
        </Text>
        <Text variant="bodySmall" style={styles.categoryDescription} numberOfLines={3}>
          {category.description}
        </Text>
        <View style={styles.categoryFooter}>
          <Text variant="labelMedium" style={styles.toolCount}>
            {toolCount} tools
          </Text>
          <Icon source="chevron-right" size={20} color={pocketLabColors.darkTeal} />
        </View>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 28,
    backgroundColor: pocketLabColors.background,
  },
  searchSection: {
    gap: 10,
  },
  intro: {
    color: pocketLabColors.mutedText,
  },
  search: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pocketLabColors.grid,
    backgroundColor: pocketLabColors.surface,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  sectionSubtitle: {
    marginTop: 2,
    color: pocketLabColors.mutedText,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryCard: {
    width: "48.5%",
    minHeight: 190,
    borderRadius: 12,
    backgroundColor: pocketLabColors.surface,
  },
  categoryContent: {
    flex: 1,
    padding: 14,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: "#E7F2F4",
  },
  categoryTitle: {
    fontWeight: "600",
  },
  categoryDescription: {
    flex: 1,
    marginTop: 5,
    color: pocketLabColors.mutedText,
    lineHeight: 17,
  },
  categoryFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  toolCount: {
    color: pocketLabColors.darkTeal,
  },
  emptyState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderRadius: 10,
    backgroundColor: pocketLabColors.surface,
  },
  emptyText: {
    flex: 1,
    color: pocketLabColors.mutedText,
  },
});