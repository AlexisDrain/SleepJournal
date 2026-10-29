import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Switch, Text, View } from 'react-native';
import { ExportSheet } from '@/components/ExportSheet';
import { GoogleSheetCard } from '@/components/GoogleSheetCard';
import { TimePicker } from '@/components/TimeField';
import { Button, Card, Chip, ErrorBox, Muted, Row, styles } from '@/components/ui';
import { pickAndImport } from '@/db/csv';
import buildInfo from '@/lib/buildInfo.json';
import { requestSync, resendAllNights } from '@/db/sync';
import { setCombine, useCombine } from '@/lib/advanced';
import { formatSheetDate, setDateStyle, setMondayFirst, useDateStyle, useMondayFirst, type DateStyle } from '@/lib/localePrefs';
import { setHour24, useHour24 } from '@/lib/clockFormat';
import { DAY_ENDS, DAY_STARTS, setDisplayMode, useDisplayMode, type DisplayMode } from '@/lib/displayMode';
import { formatHour } from '@/lib/clockFormat';
import { useThemeName } from '@/lib/displayMode';
import { REPO_URL, SUPPORT_EMAIL } from '@/lib/links';
import type { Phase } from '@/lib/types';
import { clearReminder, ensurePermission, getReminders, plannedReminders, remindersSupported, setReminder, type Reminder } from '@/lib/notifications';
import { colors, space } from '@/lib/theme';
import { formatClock } from '@/lib/time';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

const DEFAULT_REMINDER: Record<Phase, Reminder> = {
  bedtime: { phase: 'bedtime', hour: 22, minute: 30 },
  morning: { phase: 'morning', hour: 10, minute: 0 },
};
const PHASE_NAME: Record<Phase, string> = { bedtime: 'Bedtime', morning: 'Morning' };
const DATE_STYLES: [DateStyle, string][] = [['ymd', 'year-month-day'], ['mdy', 'month-day-year (US)'], ['dmy', 'day-month-year']];
const DISPLAY_MODES: [DisplayMode, string][] = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Light by day, dark at night']];
const SUPPORT_MAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Sleep Journal feedback (build ${buildInfo.build})`)}`;
const PHASE_COLOR: Record<Phase, string> = { get bedtime() { return colors.night; }, get morning() { return colors.morning; } };

export default function SettingsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Partial<Record<Phase, Reminder>>>({});
  const [planned, setPlanned] = useState<{ count: number; next: Date | null } | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const hour24 = useHour24();
  const display = useDisplayMode();
  const combine = useCombine();
  const mondayFirst = useMondayFirst();
  const dateStyle = useDateStyle();

  const load = useCallback(async () => {
    setError(null);
    try {
      setReminders(await getReminders());
      setPlanned(await plannedReminders().catch(() => null));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const importCsv = async () => {
    try {
      const r = await pickAndImport();
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

      <Card title="Display">
        <View style={styles.chips}>
          {DISPLAY_MODES.map(([m, label]) => (
            <Chip key={m} label={label} selected={display === m} onPress={() => setDisplayMode(m).catch((e) => setError((e as Error).message))} />
          ))}
        </View>
        <Muted>
          {display === 'auto'
            ? `Light from ${formatHour(DAY_STARTS)} to ${formatHour(DAY_ENDS)}, dark the rest of the time.`
            : display === 'light' ? 'Light all the time.' : 'Dark all the time, easy on the eyes in bed.'}
        </Muted>
      </Card>

      {remindersSupported && <Card title="Notifications">
        {(['bedtime', 'morning'] as const).map((phase) => (
          <ReminderRow key={phase} phase={phase} reminder={reminders[phase]} onChange={load} onError={setError} />
        ))}
        <Muted>Sent by your phone only if you haven't filled in that check-in yet. They work offline.</Muted>
        {planned && (
          <Muted>
            {planned.count === 0
              ? 'None planned on this phone right now.'
              : `${planned.count} planned on this phone${planned.next ? `, next ${planned.next.toLocaleDateString([], { weekday: 'short' })} ${formatClock(planned.next.toISOString())}` : ''}.`}
          </Muted>
        )}
      </Card>}

      <Card title="Locale">
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
        <Row label="Week starts on Monday">
          <Switch value={mondayFirst} trackColor={{ true: colors.night }} onValueChange={(v) => void setMondayFirst(v)} />
        </Row>
        <Muted>{mondayFirst ? 'The calendar starts each week on Monday.' : 'The calendar starts each week on Sunday.'} It started as your region's usual day.</Muted>
      </Card>

      <GoogleSheetCard />

      <Card title="Your data">
        <Muted>Everything is stored only on this device.</Muted>
        <Muted>
          Export as a color-coded spreadsheet (.xlsx) for Google Sheets / Excel, or as CSV for backups
          and moving to a new phone. You choose which fields to include.
        </Muted>
        <Button title="Export…" onPress={() => setExporting(true)} small />
        <Muted>
          Import a .csv or .xlsx exported from Sleep Journal, or your Google Sheet downloaded as .xlsx.
          Nights you already have are left alone.
        </Muted>
        <Button title="Import .csv or .xlsx" onPress={importCsv} small color={colors.chip} textColor={colors.text} />
        {importMsg && <Text style={{ color: colors.success }}>{importMsg}</Text>}
      </Card>

      <ExportSheet visible={exporting} onClose={() => setExporting(false)} onError={setError} />

      <Card title="Advanced">
        <Row label="Combine “Got in bed” and “Trying to sleep”">
          <Switch value={combine.bed} trackColor={{ true: colors.night }} onValueChange={(v) => void setCombine({ bed: v })} />
        </Row>
        <Row label="Combine “Woke up” and “Started the day”">
          <Switch value={combine.morning} trackColor={{ true: colors.morning }} onValueChange={(v) => void setCombine({ morning: v })} />
        </Row>
        <Muted>
          The Journal asks one time instead of two. It's saved in both columns, so the spreadsheet and
          hours asleep keep working.
        </Muted>
        <Text style={{ color: colors.text, fontSize: 16, marginTop: space.sm }}>Dates in spreadsheets</Text>
        <View style={styles.chips}>
          {DATE_STYLES.map(([style, label]) => (
            <Chip key={style} label={`${formatSheetDate('2026-10-23', style)} · ${label}`} selected={dateStyle === style}
              onPress={() => void setDateStyle(style)} />
          ))}
        </View>
        <Muted>
          For exports, CSV import and the Sheet tab. Your Google Sheet always uses year-month-day: syncing
          finds each night by its date, and that's the one style that can't be read two ways.
        </Muted>
      </Card>

      <Card title="Welcome screen">
        <Muted>The short overview of how the app works, shown the first time you opened it.</Muted>
        <Button title="Show the welcome again" onPress={() => setWelcomeSeen(false)} small
          color={colors.chip} textColor={colors.text} />
      </Card>

      <Card title="Help">
        <Muted>Found a problem, or have an idea for a feature?</Muted>
        <Muted>
          Email{' '}
          <Text style={{ color: colors.night, textDecorationLine: 'underline' }} accessibilityRole="link" selectable
            onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>{SUPPORT_EMAIL}</Text>
          {' '}with what happened. You can attach your journal as a
          spreadsheet: it helps with problems. Untick anything you'd rather keep private, like notes or dreams.
        </Muted>
        <Button title="Export a spreadsheet to attach" onPress={() => setExporting(true)} small
          color={colors.chip} textColor={colors.text} />
        <Muted>
          Or create a public issue on{' '}
          <Text style={{ color: colors.night, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(`${REPO_URL}/issues`).catch(() => {})}>
            {REPO_URL.replace('https://', '')}/issues
          </Text>
          . Don't attach your spreadsheet there: everyone can see it.
        </Muted>
      </Card>

      <Card title="About">
        {/* The build number goes up with every release (scripts/release.js): compare it between devices. */}
        <Text style={{ color: colors.text }} selectable>
          Sleep Journal {buildInfo.version} · build {buildInfo.build}
        </Text>
        <Muted>Published {buildInfo.date || 'from a development copy'}</Muted>
        <Muted>
          Project page and source code:{' '}
          <Text style={{ color: colors.night, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}>
            {REPO_URL.replace('https://', '')}
          </Text>
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
    <Row label={`${PHASE_NAME[phase]} notification`}>
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
