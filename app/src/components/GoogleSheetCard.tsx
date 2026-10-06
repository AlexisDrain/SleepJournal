// Settings → Google Sheet: connect with a connection code, then sync automatically.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { connect, disconnect, getConnection, getSyncState, LATEST_SCRIPT_VERSION, syncNow, type SyncState } from '@/db/sync';
import { SHEET_GUIDE_URL, SHEET_TEMPLATE_URL } from '@/lib/links';
import { confirmAction } from '@/lib/confirm';
import { colors, space } from '@/lib/theme';
import { Button, Card, Input, Muted } from './ui';

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

export function GoogleSheetCard() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<SyncState | null>(null);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false); // a secret, so it's dots unless asked
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    setConnected(!!(await getConnection()));
    setState(await getSyncState());
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await fn() });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
      load();
    }
  };

  const onConnect = () =>
    run(async () => {
      const name = await connect(url, key);
      setUrl('');
      setKey('');
      setShowKey(false);
      const r = await syncNow();
      return `Connected to “${name}”. Sent ${r.pushed} night(s), received ${r.pulled}.`;
    });

  const onSync = () =>
    run(async () => {
      const r = await syncNow();
      return r.pushed || r.pulled ? `Sent ${r.pushed}, received ${r.pulled}.` : 'Everything is up to date.';
    });

  const onDisconnect = async () => {
    if (await confirmAction('Disconnect the Google Sheet?', 'Nothing is deleted. The sheet and this device just stop syncing.', 'Disconnect')) {
      run(async () => (await disconnect(), 'Disconnected.'));
    }
  };

  return (
    <Card title="Google Sheet">
      {connected ? (
        <>
          <Text style={{ color: colors.text }}>Syncing with “{state?.sheetName ?? 'your sheet'}”</Text>
          <Muted>
            {state?.lastError
              ? `Last sync failed: ${state.lastError}`
              : state?.lastSyncAt
                ? `Last synced ${ago(state.lastSyncAt)}. Syncs automatically after changes.`
                : 'Not synced yet.'}
          </Muted>
          {state && state.scriptVersion < LATEST_SCRIPT_VERSION && (
            <Text style={{ color: colors.morning }}>
              Your sheet's script is an older version. Syncing still works, but it's missing newer fixes.
              To update it, paste the current script into the sheet and deploy a new version (see "Updating
              the script" in the setup guide).
            </Text>
          )}
          <Button title="Sync now" onPress={onSync} busy={busy} small />
          <Button title="Disconnect" onPress={onDisconnect} small color={colors.chip} textColor={colors.text} />
        </>
      ) : (
        <>
          <Muted>
            Keep your journal in your own private Google Sheet: one tab per year, and edits in either place
            sync both ways. No Google login in the app.
          </Muted>
          <Muted>
            First set up your sheet on a computer: {SHEET_TEMPLATE_URL
              ? 'copy the template sheet, then follow the short guide (about 3 minutes).'
              : 'about 10 minutes, see google-sheets/README.md.'}
          </Muted>
          {SHEET_TEMPLATE_URL !== '' && (
            <Button title="Get the template sheet" small color={colors.chip} textColor={colors.text}
              onPress={() => Linking.openURL(SHEET_TEMPLATE_URL)} />
          )}
          {SHEET_GUIDE_URL !== '' && (
            <Pressable onPress={() => Linking.openURL(SHEET_GUIDE_URL)} hitSlop={8}>
              <Text style={{ color: colors.night }}>Open the setup guide</Text>
            </Pressable>
          )}
          <Muted>Then, in the sheet's script editor (Extensions → Apps Script):</Muted>
          <Text style={{ color: colors.text }}>1. Web app URL</Text>
          <Muted>Deploy → Manage deployments → copy the Web app URL. It ends in /exec.</Muted>
          <Input placeholder="https://script.google.com/macros/s/…/exec" value={url} onChangeText={setUrl}
            autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="url" />
          <Text style={{ color: colors.text }}>2. Secret key</Text>
          <Muted>Choose showConnectionCode at the top, click Run, and copy the key from the log.</Muted>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {/* Shown: several lines, so the whole key can be checked. Hidden: dots (which need a single line). */}
            <Input key={showKey ? 'shown' : 'hidden'} style={{ flex: 1 }} placeholder="Secret key"
              value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} spellCheck={false}
              secureTextEntry={!showKey} multiline={showKey} />
            <Pressable onPress={() => setShowKey((v) => !v)} hitSlop={8}
              accessibilityRole="button" accessibilityLabel={showKey ? 'Hide secret key' : 'Show secret key'}>
              <Text style={{ color: colors.night, fontWeight: '600' }}>{showKey ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          <Muted>Spaces and a missing "https://" are fixed for you.</Muted>
          <Button title="Connect" onPress={onConnect} busy={busy} disabled={!url.trim()} small />
        </>
      )}
      {message && <Text style={{ color: message.error ? colors.danger : colors.success }}>{message.text}</Text>}
    </Card>
  );
}
