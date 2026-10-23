// A list you reorder by dragging the ≡ handle (touch on phones, the mouse on a computer).
// Only the handle starts a drag, so tapping the rest of a row still works (e.g. to edit it).
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Sortable from 'react-native-sortables';
import { colors, space } from '@/lib/theme';

export function SortableList<T>({ items, keyOf, onReorder, renderItem }: {
  items: T[];
  keyOf: (item: T) => string;
  /** Called once a drag ends, with the items in their new order. */
  onReorder: (items: T[]) => void;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <Sortable.Grid
      data={items}
      keyExtractor={keyOf}
      columns={1}
      rowGap={2}
      customHandle
      // Only the handle drags, so it can start at once: no press-and-hold needed (mouse or finger).
      dragActivationDelay={0}
      activationAnimationDuration={120}
      onDragEnd={({ data }) => onReorder(data)}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: 8 }}>
          <Sortable.Handle>
            <View accessibilityLabel="Drag to reorder" style={{ paddingHorizontal: 10, paddingVertical: 10, cursor: 'grab' } as object}>
              <Text style={{ color: colors.muted, fontSize: 18 }}>≡</Text>
            </View>
          </Sortable.Handle>
          <View style={{ flex: 1, minWidth: 0 }}>{renderItem(item)}</View>
        </View>
      )}
    />
  );
}
