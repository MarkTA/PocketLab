import type { ToolConfig } from "./types";
import { ohmsLawConfig } from "../tools/ohmsLaw/config";
import { seriesParallelConfig } from "../tools/seriesParallel/config";
import { voltageDividerConfig } from "../tools/voltageDivider/config";

/** Slugs are defined once here; screens and catalog consumers use the same lookup. */
export const toolRegistryConfig: Record<string, ToolConfig> = {
  [voltageDividerConfig.slug]: voltageDividerConfig,
  [ohmsLawConfig.slug]: ohmsLawConfig,
  [seriesParallelConfig.slug]: seriesParallelConfig,
};
