import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, Button, IconButton, Text } from "react-native-paper";
import { pocketLabColors as c } from "../../../themes/theme";
import {
  deleteSavedMeasurement,
  listSavedMeasurements,
  type SavedMeasurement,
} from "../storage/savedMeasurements";

type Props = { visible: boolean; onClose: () => void; onCountChange?: (count: number) => void };

function formatValue(item: SavedMeasurement): string {
  const value = item.value;
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (item.kind === "resistance") {
    if (abs >= 1e6) return `${Number((value / 1e6).toPrecision(6))} MΩ`;
    if (abs >= 1e3) return `${Number((value / 1e3).toPrecision(6))} kΩ`;
    return `${Number(value.toPrecision(6))} Ω`;
  }
  if (abs > 0 && abs < 0.001) return `${Number((value * 1e6).toPrecision(6))} µV`;
  if (abs > 0 && abs < 1) return `${Number((value * 1e3).toPrecision(6))} mV`;
  return `${Number(value.toPrecision(7))} V`;
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "Unknown date";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function sourceDescription(item: SavedMeasurement): string {
  if (item.source === "cursor") return "Graph cursor · selected historical value";
  if (item.kind === "resistance") return "Live resistance";
  if (item.averagingWindowMs !== undefined) {
    const seconds = item.averagingWindowMs / 1000;
    return `Live voltage · ${seconds} s average`;
  }
  return "Live voltage";
}

export function SavedMeasurementsScreen({ visible, onClose, onCountChange }: Props) {
  const [items, setItems] = useState<SavedMeasurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const saved = await listSavedMeasurements();
      setItems(saved);
      onCountChange?.(saved.length);
    } catch {
      setError("Unable to load saved measurements.");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const remove = async (id: string) => {
    if (deletingId !== null) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteSavedMeasurement(id);
      // Read the persisted list again rather than assuming deletion succeeded.
      const remaining = await listSavedMeasurements();
      setItems(remaining);
      onCountChange?.(remaining.length);
    } catch {
      setError("Unable to delete the measurement.");
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = (item: SavedMeasurement) => {
    Alert.alert(
      "Delete measurement?",
      `Delete ${formatValue(item)} saved on ${formatDate(item.savedAt)}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { void remove(item.id); } },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <IconButton icon="arrow-left" accessibilityLabel="Close saved measurements" onPress={onClose} />
          <View style={styles.headerText}>
            <Text variant="titleLarge" style={styles.title}>Saved Measurements</Text>
            <Text variant="bodySmall" style={styles.subtitle}>{items.length} saved locally on this device</Text>
          </View>
          <IconButton icon="refresh" accessibilityLabel="Refresh saved measurements" disabled={loading} onPress={() => { void refresh(); }} />
        </View>
        {error !== null && <View style={styles.banner}><Text style={styles.error}>{error}</Text><Button onPress={() => { void refresh(); }}>Retry</Button></View>}
        {loading && items.length === 0 ? (
          <View style={styles.empty}><ActivityIndicator /><Text>Loading measurements…</Text></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            contentContainerStyle={items.length === 0 ? styles.empty : styles.list}
            ListEmptyComponent={<View style={styles.emptyContent}>
              <Text variant="titleMedium">No saved measurements yet</Text>
              <Text style={styles.muted}>Bookmark a voltage or resistance reading from the DMM to see it here.</Text>
            </View>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.cardBody}>
                    <Text variant="headlineSmall" style={styles.value}>{formatValue(item)}</Text>
                    <Text style={styles.muted}>{sourceDescription(item)}</Text>
                  </View>
                  <IconButton
                    icon="delete-outline"
                    accessibilityLabel={`Delete ${formatValue(item)} measurement`}
                    disabled={deletingId !== null}
                    onPress={() => confirmDelete(item)}
                  />
                </View>
                <Text variant="bodySmall" style={styles.timestamp}>Measured: {formatDate(item.measuredAt)}</Text>
                <Text variant="bodySmall" style={styles.timestamp}>Saved: {formatDate(item.savedAt)}</Text>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: c.grid },
  headerText: { flex: 1, paddingVertical: 8 },
  title: { color: c.text },
  subtitle: { color: c.mutedText },
  banner: { padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  error: { color: c.danger, flexShrink: 1 },
  list: { padding: 12, paddingBottom: 28, gap: 10 },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.grid, borderRadius: 12, padding: 14 },
  row: { flexDirection: "row", alignItems: "center" },
  cardBody: { flex: 1, gap: 4 },
  value: { color: c.darkTeal, fontVariant: ["tabular-nums"] },
  muted: { color: c.mutedText },
  timestamp: { color: c.mutedText, marginTop: 6 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyContent: { alignItems: "center", gap: 10 },
});
