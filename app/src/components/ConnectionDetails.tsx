// Settings → Google Sheet, once connected: the Web app URL and secret key this device uses, so
// they're easy to copy onto another device. Folded away by default, and the key stays as dots
// until you choose to show it.
import { useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import type { Connection } from '@/db/sync';
import { colors, space } from '@/lib/theme';
import { Button, Muted } from './ui';

/**
 * The clipboard module is native code, so it only exists in app builds made after it was added
 * (an older installed build still receives this screen through an update). Load it carefully, and
 * where it's missing, fall back to the share sheet, which has its own Copy button.
 */
function loadClipboard(): { setStringAsync: (text: string) => Promise<unknown> } | null {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && navigator.clipboard
      ? { setStringAsync: (text) => navigator.clipboard.writeText(text) }
      : null;
  }
  try {
    return require('expo-clipboard');
  } catch {
    return null;
  }
}
const clipboard = loadClipboard();

export function ConnectionDetails({ connection }: { connection: Connection }) {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (what: string, text: string) => {
    try {
      if (clipboard) {
        await clipboard.setStringAsync(text);
        setCopied(what);
        setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
      } else {
        await Share.share({ message: text }); // the share sheet's Copy does the same job
      }
    } catch {
      setCopied(null);
    }
  };
  const label = (what: string, title: string) => (copied === what ? 'Copied ✓' : title);

  if (!open) {
    return <Button title="Show connection details" small color={colors.chip} textColor={colors.text} onPress={() => setOpen(true)} />;
  }

  return (
    <View style={{ gap: space.sm, backgroundColor: colors.bg, borderRadius: 10, padding: space.md }}>
      <Muted>To set up another device. Keep these private: anyone with both can read and change your journal sheet.</Muted>

      <Text style={{ color: colors.text, fontWeight: '600' }}>Web app URL</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{connection.url}</Text>
      <Button title={label('url', 'Copy URL')} small color={colors.chip} textColor={colors.text} onPress={() => copy('url', connection.url)} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>Secret key</Text>
        <Pressable onPress={() => setShowKey(!showKey)} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={showKey ? 'Hide secret key' : 'Show secret key'}>
          <Text style={{ color: colors.night, fontWeight: '600' }}>{showKey ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      <Text selectable={showKey} style={{ color: colors.muted, fontSize: 13 }}>
        {showKey ? connection.secret : '•'.repeat(24)}
      </Text>
      <Button title={label('key', 'Copy key')} small color={colors.chip} textColor={colors.text} onPress={() => copy('key', connection.secret)} />

      <Button title={label('both', 'Copy both')} small onPress={() => copy('both', `${connection.url}#${connection.secret}`)} />
      <Muted>“Copy both” copies one line: on the other device, paste it into the Web app URL box and leave the key box empty.</Muted>

      <Button title="Hide connection details" small color={colors.chip} textColor={colors.text}
        onPress={() => { setOpen(false); setShowKey(false); }} />
    </View>
  );
}
