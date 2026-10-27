import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Menu } from "react-native-paper";
import { pocketLabColors as c } from "@/themes/theme";

// Keep the function generator available as a development reference until
// feature-based instrument discovery is ready.
const SHOW_DEVELOPMENT_INSTRUMENTS = true;

type Instrument = "dmm" | "function-generator";

type Props = {
  active: Instrument;
  onSelect: (instrument: Instrument) => void;
  generatorAvailable: boolean;
};

export function InstrumentSelector({ active, onSelect, generatorAvailable }: Props) {
  const [open, setOpen] = useState(false);
  const generatorVisible = generatorAvailable || SHOW_DEVELOPMENT_INSTRUMENTS;

  const select = (instrument: Instrument) => {
    setOpen(false);
    if (instrument !== active) onSelect(instrument);
  };

  return (
    <View style={styles.row}>
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={
          <Button compact mode="text" icon="chevron-down" textColor={c.darkTeal} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}
            accessibilityLabel="Select measurement instrument"
            onPress={() => setOpen(true)}>
            {active === "dmm" ? "Digital Multimeter" : "Function Generator"}
          </Button>
        }
      >
        <Menu.Item title="Digital Multimeter" leadingIcon="gauge" onPress={() => select("dmm")} />
        {generatorVisible ? (
          <Menu.Item title={generatorAvailable ? "Function Generator" : "Function Generator · Preview"}
            leadingIcon="sine-wave" onPress={() => select("function-generator")} />
        ) : null}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 4, backgroundColor: c.surface,
  },
  buttonContent: { flexDirection: "row-reverse", minHeight: 36 },
  buttonLabel: { fontSize: 14, fontWeight: "700" },
});
