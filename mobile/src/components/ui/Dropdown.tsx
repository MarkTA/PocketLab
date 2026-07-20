import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Menu, TextInput } from "react-native-paper";

export type DropdownOption<Value extends string> = {
  label: string;
  value: Value;
  disabled?: boolean;
};

type DropdownProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly DropdownOption<Value>[];
  onValueChange: (value: Value) => void;
  disabled?: boolean;
};

export function Dropdown<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
}: DropdownProps<Value>) {
  const [visible, setVisible] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? "",
    [options, value]
  );

  const close = () => {
    setVisible(false);
  };

  return (
    <Menu
      visible={visible}
      onDismiss={close}
      anchorPosition="top"
      anchor={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${selectedLabel}`}
          accessibilityHint="Opens a list of options"
          accessibilityState={{ disabled, expanded: visible }}
          disabled={disabled}
          onPress={() => {
            setVisible(true);
          }}
        >
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              label={label}
              value={selectedLabel}
              editable={false}
              disabled={disabled}
              right={
                <TextInput.Icon
                  icon={visible ? "menu-up" : "menu-down"}
                />
              }
            />
          </View>
        </Pressable>
      }
      contentStyle={styles.menu}
    >
      {options.map((option) => (
        <Menu.Item
          key={option.value}
          title={option.label}
          disabled={option.disabled}
          leadingIcon={option.value === value ? "check" : undefined}
          onPress={() => {
            onValueChange(option.value);
            close();
          }}
        />
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  menu: {
    minWidth: 220,
  },
});