import { useLocalSearchParams } from "expo-router";

import { ToolScreen } from "@/features/calculator/screens/ToolScreen";

export default function ToolRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return <ToolScreen slug={slug} />;
}