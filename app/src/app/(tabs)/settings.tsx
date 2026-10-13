import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Switch, Text, View } from 'react-native';
import { ExportSheet } from '@/components/ExportSheet';
import { GoogleSheetCard } from '@/components/GoogleSheetCard';
import { TimePicker } from '@/components/TimeField';
import { Button, Card, ErrorBox, Muted, Row, styles } from '@/components/ui';
import { pickAndImportCsv } from '@/db/csv';
import buildInfo from '@/lib/buildInfo.json';
import { requestSync, resendAllNights } from '@/db/sync';
import { setHour24, useHour24 } from '@/lib/clockFormat';
import { REPO_URL } from '@/lib/links';
import type { Phase } from '@/lib/types';
import { clearReminder, ensurePermission, getReminders, remindersSupported, setReminder, type Reminder } from '@/lib/notifications';
import { colors, space } from '@/lib/theme';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

const DEFAULT_REMINDER: Record<Phase, Reminder> = {
  bedtime: { phase: 'bedtime', hour: 22, minute: 30 },
  morning: { phase: 'morning', hour: 10, minute: 0 },
};
const PHASE_NAME: Record<Phase, string> = { bedtime: 'Bedtime', morning: 'Morning' };
const PHASE_COLOR: Record<Phase, string> = { bedtime: colors.night, morning: colors.morning };

export default function SettingsScreen() {
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Partial<Record<Phase, Reminder>>>({});
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const hour24 = useHour24();

  const load = useCallback(async () => {
    setError(null);
    try {
      setReminders(await getReminders());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const importCsv = async () => {
    try {
      const r = await pickAndImportCsv();
      if (!r) return;
      requestSync();
      setImportMsg(
        `Imported ${r.imported} night${r.imported === 1 ? '' : 's'}` +
        (r.skipped ? ` · ${r.skipped} already in your journal (kept as is)` : '') +
        (r.invalid ? ` · ${r.invalid} row(s) without a date` : '') +
        (r.empty ? ` · ${r.empty} blank row(s) skipped` : ''),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, page(NARROW_PAGE)]}>
      {error && <ErrorBox message={error} onRetry={load} />}

      {remindersSupported && <Card title="Reminders">
        {(['bedtime', 'morning'] as const).map((phase) => (
          <ReminderRow key={phase} phase={phase} reminder={reminders[phase]} onChange={load} onError={setError} />
        ))}
        <Muted>Local notifications from your phone. They work offline.</Muted>
      </Card>}

      <Card title="Clock">
        <Row label="24-hour time">
          <Switch value={hour24} trackColor={{ true: colors.night }}
            onValueChange={(v) => {
              setHour24(v)
                .then(resendAllNights) // the Google Sheet, if connected, is rewritten in the new style
                .catch((e) => setError((e as Error).message));
            }} />
        </Row>
        <Muted>
          {hour24 ? '23:30 instead of 11:30 PM.' : '11:30 PM instead of 23:30.'} Used everywhere in the app, in exports and in
          your Google Sheet. It started as your region's style.
        </Muted>
      </Card>

      <GoogleSheetCard />

      <Card title="Your data">
        <Muted>Everything is stored only on this device.</Muted>
        <Muted>
          Export as a color-coded spreadsheet (.xlsx) for Google Sheets / Excel, or as CSV for backups
          and moving to a new phone. You choose which fields to include.
        </Muted>
        <Button title="Export…" onPress={() => setExporting(true)} small />
        <Muted>Import a CSV exported from Sleep Journal. Nights you already have are left alone.</Muted>
        <Button title="Import CSV" onPress={importCsv} small color={colors.chip} textColor={colors.text} />
        {importMsg && <Text style={{ color: colors.success }}>{importMsg}</Text>}
      </Card>

      <ExportSheet visible={exporting} onClose={() => setExporting(false)} onError={setError} />

      <Card title="About">
        {/* The build number goes up with every release (scripts/release.js): compare it between devices. */}
        <Text style={{ color: colors.text }} selectable>
          Sleep Journal {buildInfo.version} · build {buildInfo.build}
        </Text>
        <Muted>Published {buildInfo.date || 'from a development copy'}. If two devices show different build numbers, one of them hasn't updated yet.</Muted>
        <Button title="Show the welcome again" onPress={() => setWelcomeSeen(false)} small
          color={colors.chip} textColor={colors.text} />
        <Muted>
          For support and to report issues, go to{' '}
          <Text style={{ color: colors.night, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}>
            {REPO_URL.replace('https://', '')}
          </Text>
          .
        </Muted>
      </Card>
    </ScrollView>
  );
}

function ReminderRow({ phase, reminder, onChange, onError }: {
  phase: Phase;
  reminder?: Reminder;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const schedule = async (r: Reminder) => {
    try {
      if (!(await ensurePermission())) return onError('Notifications are turned off for this app in iOS Settings.');
      await setReminder(r);
      onChange();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const toggle = async (on: boolean) => {
    if (on) return schedule(DEFAULT_REMINDER[phase]);
    await clearReminder(phase);
    onChange();
  };
  return (
    <Row label={`${PHASE_NAME[phase]} reminder`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {reminder && (
          <TimePicker value={new Date(2000, 0, 1, reminder.hour, reminder.minute)} accent={PHASE_COLOR[phase]}
            onChange={(d) => schedule({ phase, hour: d.getHours(), minute: d.getMinutes() })} />
        )}
        <Switch value={!!reminder} onValueChange={toggle} trackColor={{ true: PHASE_COLOR[phase] }} />
      </View>
    </Row>
  );
}
