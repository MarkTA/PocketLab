// src/components/SettingRow.tsx

import { List } from "react-native-paper";

type Props = {
  label: string;
  value: string;
  onPress: () => void;
};

export function SettingRow({ label, value, onPress }: Props) {
  return (
    <List.Item
      title={label}
      description={value}
      onPress={onPress}
      right={(props) => <List.Icon {...props} icon="chevron-right" />}
    />
  );
}
