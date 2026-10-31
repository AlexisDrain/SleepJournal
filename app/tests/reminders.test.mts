// Reminders (Settings → Notifications) must never go off when they're turned off, or for a
// check-in that's already filled in.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { store } from '@/db/store';
import { clearReminder, setReminder, syncReminders } from '@/lib/notifications';
import { addDays, currentNight } from '@/lib/time';

const notif = createRequire(import.meta.url)('expo-notifications');
const planned = (): string[] => [...notif.__scheduled.keys()];
const idFor = (phase: string, night: string) => `sj-reminder-${phase}-${night}`;

test('turning both off removes every planned reminder', async () => {
  await setReminder({ phase: 'bedtime', hour: 22, minute: 30 });
  await setReminder({ phase: 'morning', hour: 10, minute: 0 });
  assert.ok(planned().length > 0, 'reminders were planned while on');
  // one with its id in a different form, the way Expo Go can report them
  notif.__scheduled.set('@alexisdrain/sleep-journal:sj-reminder-bedtime-2026-10-20', new Date());
  await clearReminder('bedtime');
  await clearReminder('morning');
  assert.deepEqual(planned(), []);
});

test('turning one off keeps only the other', async () => {
  await setReminder({ phase: 'bedtime', hour: 22, minute: 30 });
  await setReminder({ phase: 'morning', hour: 10, minute: 0 });
  await clearReminder('bedtime');
  assert.ok(planned().length > 0);
  assert.ok(planned().every((id) => id.startsWith('sj-reminder-morning-')), String(planned()));
  await clearReminder('morning');
});

test('changing the time moves every reminder: none stay at the old time', async () => {
  await setReminder({ phase: 'bedtime', hour: 22, minute: 30 });
  await setReminder({ phase: 'bedtime', hour: 21, minute: 15 });
  const times = [...notif.__scheduled.values()] as Date[];
  assert.ok(times.length > 0);
  assert.ok(times.every((t) => t.getHours() === 21 && t.getMinutes() === 15), String(times));
  await clearReminder('bedtime');
});

test('a filled check-in gets no reminder; the other nights still do', async () => {
  await setReminder({ phase: 'morning', hour: 10, minute: 0 });
  const night = addDays(currentNight(), 2); // a morning safely in the future
  assert.ok(planned().includes(idFor('morning', night)));
  await store.saveEntry(night, { wokeAt: `${addDays(night, 1)}T08:00:00-07:00` });
  await syncReminders();
  assert.ok(!planned().includes(idFor('morning', night)), 'no reminder for the filled morning');
  assert.ok(planned().includes(idFor('morning', addDays(night, 1))), 'the next morning still has one');
  await clearReminder('morning');
});

test('overlapping re-plans never bring back a reminder for a filled check-in', async () => {
  await setReminder({ phase: 'morning', hour: 10, minute: 0 });
  const night = addDays(currentNight(), 3);
  for (let i = 0; i < 15; i++) {
    await store.saveEntry(night, { wokeAt: null });
    await syncReminders();
    const early = syncReminders(); // e.g. the re-plan on launch, still running
    await new Promise((r) => setTimeout(r, 3 + i * 3));
    await store.saveEntry(night, { wokeAt: `${addDays(night, 1)}T08:00:00-07:00` });
    await Promise.all([early, syncReminders()]);
    assert.ok(!planned().includes(idFor('morning', night)), `run ${i}`);
  }
  await clearReminder('morning');
  assert.deepEqual(planned(), []);
});
