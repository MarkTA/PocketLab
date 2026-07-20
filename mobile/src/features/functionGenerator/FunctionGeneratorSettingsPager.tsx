import PagerView from "react-native-pager-view";
import React, { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

import { Dropdown, type DropdownOption } from "../../components/ui/Dropdown";
import { FUNCTION_GENERATOR_LIMITS, clamp } from "../../lib/hardwareLimits";
import type { Waveform } from "../../types/pocketLab";
import { ParameterSlider } from "./ParameterSlider";

export type EditableGeneratorSettings = {
  waveform: Waveform;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
};

type Props = {
  settings: EditableGeneratorSettings;
  disabled?: boolean;
  onPreviewChange: (settings: EditableGeneratorSettings) => void;
  onCommit: (settings: EditableGeneratorSettings) => void;
};

const TABS = ["Waveform", "Frequency", "Amplitude", "Offset"] as const;

const WAVEFORM_OPTIONS = [
  { label: "Sine", value: "sine" },
  { label: "Square", value: "square" },
  { label: "Triangle", value: "triangle" },
  { label: "Ramp Up", value: "rampUp" },
  { label: "Ramp Down", value: "rampDown" },
  { label: "DC", value: "dc" },
] as const satisfies readonly DropdownOption<Waveform>[];

const FREQUENCY_TICKS = ["1", "100", "10k", "1M"] as const;

export function FunctionGeneratorSettingsPager({
  settings,
  disabled = false,
  onPreviewChange,
  onCommit,
}: Props) {
  const theme = useTheme();
  const pagerRef = useRef<PagerView>(null);
  const [activePage, setActivePage] = useState(0);
  const [sliderActive, setSliderActive] = useState(false);

  const offsetRange = useMemo(() => {
    const halfAmplitude = settings.amplitudeVpp / 2;

    return {
      minimum: Math.max(
        FUNCTION_GENERATOR_LIMITS.minOffsetV,
        FUNCTION_GENERATOR_LIMITS.minActiveOutputV + halfAmplitude
      ),
      maximum: Math.min(
        FUNCTION_GENERATOR_LIMITS.maxOffsetV,
        FUNCTION_GENERATOR_LIMITS.maxActiveOutputV - halfAmplitude
      ),
    };
  }, [settings.amplitudeVpp]);

  const update = (changes: Partial<EditableGeneratorSettings>, commit = false) => {
    const nextSettings = { ...settings, ...changes };
    onPreviewChange(nextSettings);

    if (commit) {
      onCommit(nextSettings);
    }
  };

  const updateAmplitude = (amplitudeVpp: number, commit = false) => {
    const halfAmplitude = amplitudeVpp / 2;
    const minimumOffset = Math.max(
      FUNCTION_GENERATOR_LIMITS.minOffsetV,
      FUNCTION_GENERATOR_LIMITS.minActiveOutputV + halfAmplitude
    );
    const maximumOffset = Math.min(
      FUNCTION_GENERATOR_LIMITS.maxOffsetV,
      FUNCTION_GENERATOR_LIMITS.maxActiveOutputV - halfAmplitude
    );
    const offsetV = clamp(settings.offsetV, minimumOffset, maximumOffset);

    update({ amplitudeVpp, offsetV }, commit);
  };

  return (
    <View style={styles.container}>
      <View
        accessibilityRole="tablist"
        style={[styles.tabBar, { borderBottomColor: theme.colors.outlineVariant }]}
      >
        {TABS.map((tab, index) => {
          const selected = activePage === index;

          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                setActivePage(index);
                pagerRef.current?.setPage(index);
              }}
              style={styles.tab}
            >
              <Text
                variant="labelLarge"
                numberOfLines={1}
                style={selected ? { color: theme.colors.primary } : styles.inactiveTab}
              >
                {tab}
              </Text>
              <View
                style={[
                  styles.indicator,
                  {
                    backgroundColor: selected ? theme.colors.primary : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        scrollEnabled={!sliderActive}
        onPageSelected={(event) => {
          setActivePage(event.nativeEvent.position);
        }}
      >
        <View key="waveform" collapsable={false} style={styles.page}>
          <Dropdown
            label="Waveform"
            value={settings.waveform}
            options={WAVEFORM_OPTIONS}
            disabled={disabled}
            onValueChange={(waveform) => {
              update(
                waveform === "dc"
                  ? { waveform, frequencyHz: 0, amplitudeVpp: 0 }
                  : {
                      waveform,
                      frequencyHz: Math.max(1, settings.frequencyHz),
                    },
                true
              );
            }}
          />
        </View>

        <View key="frequency" collapsable={false}>
          <ParameterSlider
            label="Frequency"
            value={Math.max(1, settings.frequencyHz)}
            sliderValue={Math.max(1, settings.frequencyHz)}
            unit="Hz"
            minimumValue={FUNCTION_GENERATOR_LIMITS.minFrequencyHz}
            maximumValue={FUNCTION_GENERATOR_LIMITS.maxFrequencyHz}
            minimumSliderValue={0}
            maximumSliderValue={6}
            step={0.001}
            disabled={disabled || settings.waveform === "dc"}
            formatValue={formatFrequencyInput}
            fromSliderValue={sliderToFrequency}
            toSliderValue={frequencyToSlider}
            tickLabels={FREQUENCY_TICKS}
            onSlidingStateChange={setSliderActive}
            onValueChange={(frequencyHz) => {
              update({ frequencyHz: roundFrequency(frequencyHz) });
            }}
            onValueCommit={(frequencyHz) => {
              update({ frequencyHz: roundFrequency(frequencyHz) }, true);
            }}
          />
        </View>

        <View key="amplitude" collapsable={false}>
          <ParameterSlider
            label="Amplitude"
            value={settings.amplitudeVpp}
            unit="Vpp"
            minimumValue={FUNCTION_GENERATOR_LIMITS.minAmplitudeVpp}
            maximumValue={FUNCTION_GENERATOR_LIMITS.maxAmplitudeVpp}
            step={0.01}
            disabled={disabled || settings.waveform === "dc"}
            formatValue={formatVoltageInput}
            onSlidingStateChange={setSliderActive}
            onValueChange={(amplitudeVpp) => {
              updateAmplitude(roundVoltage(amplitudeVpp));
            }}
            onValueCommit={(amplitudeVpp) => {
              updateAmplitude(roundVoltage(amplitudeVpp), true);
            }}
          />
        </View>

        <View key="offset" collapsable={false}>
          <ParameterSlider
            label="Offset"
            value={settings.offsetV}
            unit="V"
            minimumValue={offsetRange.minimum}
            maximumValue={offsetRange.maximum}
            step={0.01}
            disabled={disabled}
            formatValue={formatVoltageInput}
            onSlidingStateChange={setSliderActive}
            onValueChange={(offsetV) => {
              update({ offsetV: roundVoltage(offsetV) });
            }}
            onValueCommit={(offsetV) => {
              update({ offsetV: roundVoltage(offsetV) }, true);
            }}
          />
        </View>
      </PagerView>
    </View>
  );
}

function frequencyToSlider(frequencyHz: number): number {
  return Math.log10(Math.max(1, frequencyHz));
}

function sliderToFrequency(sliderValue: number): number {
  return 10 ** sliderValue;
}

function roundFrequency(frequencyHz: number): number {
  if (frequencyHz < 100) {
    return Math.round(frequencyHz);
  }

  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(frequencyHz)) - 2);
  return Math.round(frequencyHz / magnitude) * magnitude;
}

function roundVoltage(voltage: number): number {
  return Math.round(voltage * 100) / 100;
}

function formatFrequencyInput(frequencyHz: number): string {
  return String(Math.round(frequencyHz));
}

function formatVoltageInput(voltage: number): string {
  return voltage.toFixed(2);
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 2,
    gap: 10,
  },
  inactiveTab: {
    opacity: 0.66,
  },
  indicator: {
    width: "78%",
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  pager: {
    height: 188,
  },
  page: {
    padding: 20,
    justifyContent: "center",
  },
});