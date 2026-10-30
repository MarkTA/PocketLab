import { SchematicCanvas } from "../schematic/SchematicCanvas";
import type { ElementState } from "../schematic/grid";
import type { SchematicConfig } from "../registry/types";

export function SchematicView({ config, values, states, onVariablePress }: {
  config: SchematicConfig;
  values?: Readonly<Record<string, string>>;
  states?: Readonly<Record<string, ElementState>>;
  onVariablePress?: (id: string) => void;
}) {
  const aliases = config.aliases ?? {};
  const displayValues = { ...(values ?? {}) };
  for (const [alias, id] of Object.entries(aliases)) displayValues[alias] = values?.[id] ?? "";
  return <SchematicCanvas grid={config.grid} elements={config.elements} values={displayValues} states={states}
    showGrid={false} showNumbers={false}
    onElementPress={id => onVariablePress?.(aliases[id] ?? id)} />;
}
