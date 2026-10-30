import { Text } from "react-native-paper";
import { ToolView } from "../components/ToolView";
import { toolRegistryConfig } from "../registry/toolRegistryConfig";

export function ToolScreen({ slug }: { slug: string | undefined }) {
  const config = slug ? toolRegistryConfig[slug] : undefined;
  if (!config) return <Text variant="bodyLarge">This calculator is not available yet.</Text>;
  return <ToolView key={config.slug} config={config} />;
}
