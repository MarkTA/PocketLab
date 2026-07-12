/* src/components/ui/NumberEditDialog.tsx */

import React from "react";
import { Button, Dialog, Text, TextInput } from "react-native-paper";

type NumberEditDialogProps = {
  visible: boolean;
  title: string;
  value: string;
  limitText?: string;
  errorMessage?: string | null;
  applying?: boolean;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];

  onChangeText: (text: string) => void;
  onApply: () => void;
  onDismiss: () => void;
};

export function NumberEditDialog({
  visible,
  title,
  value,
  limitText,
  errorMessage,
  applying = false,
  keyboardType = "numeric",
  onChangeText,
  onApply,
  onDismiss,
}: NumberEditDialogProps) {
  return (
    <Dialog visible={visible} onDismiss={onDismiss} dismissable={!applying}>
      <Dialog.Title>{title}</Dialog.Title>

      <Dialog.Content>
        <TextInput
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
          autoFocus
          disabled={applying}
          error={Boolean(errorMessage)}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!applying) {
              onApply();
            }
          }}
        />

        {errorMessage ? (
          <Text variant="bodySmall" style={{ marginTop: 8 }}>
            {errorMessage}
          </Text>
        ) : limitText ? (
          <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.7 }}>
            {limitText}
          </Text>
        ) : null}
      </Dialog.Content>

      <Dialog.Actions>
        <Button disabled={applying} onPress={onDismiss}>
          Cancel
        </Button>

        <Button mode="contained" loading={applying} disabled={applying} onPress={onApply}>
          Apply
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}
