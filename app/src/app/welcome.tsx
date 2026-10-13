// First launch: a one-screen welcome, then a short overview with optional reminders.
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Muted } from '@/components/ui';
import { ensurePermission, remindersSupported, setReminder } from '@/lib/notifications';
import { colors, radius, space } from '@/lib/theme';
import { page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

export default function WelcomeScreen() {
  const [step, setStep] = useState<0 | 1>(0);
  const [reminders, setReminders] = useState<'off' | 'on' | 'denied'>('off');
  const insets = useSafeAreaInsets();

  const turnOnReminders = async () => {
    if (!(await ensurePermission())) return setReminders('denied');
    await setReminder({ phase: 'bedtime', hour: 22, minute: 30 });
    await setReminder({ phase: 'morning', hour: 10, minute: 0 });
    setReminders('on');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        ...page(520), flexGrow: 1, justifyContent: 'center', gap: space.xl,
        padding: space.xl, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl,
      }}
    >
      {step === 0 ? (
        <>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Text style={{ fontSize: 64, color: colors.night }}>☾</Text>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>Sleep Journal</Text>
            <Text style={{ color: colors.muted, fontSize: 17, textAlign: 'center', lineHeight: 24 }}>
              A one-minute sleep diary.{'\n'}Notice your patterns, one night at a time.
            </Text>
          </View>
          <Button title="Get started" onPress={() => setStep(1)} />
        </>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>How it works</Text>
          <Step icon="☾" color={colors.night} title="At bedtime"
            body="Note when you got in bed and started trying to sleep. Your bedtime and morning checklists are in the Routines tab." />
          <Step icon="☀" color={colors.morning} title="In the morning"
            body="Say how rested you feel, how long it took to fall asleep, and when you woke up." />
          <Step icon="≡" color={colors.muted} title="Over time"
            body="The Sheet tab shows every night as a spreadsheet. Export it, or sync it with Google Sheets, whenever you like." />
          <Step icon="⌂" color={colors.success} title="Private by design"
            body="Your journal is stored only on this device. No account, no server, no tracking." />
          <Muted>
            The Journal tab always opens on whatever is due now. Each entry is named after the night it
            starts on: “Friday night → Saturday morning”.
          </Muted>

          <View style={{ gap: space.sm }}>
            {remindersSupported && reminders === 'off' && (
              <Button title="Remind me at 10:30 PM and 10 AM" onPress={turnOnReminders}
                color={colors.chip} textColor={colors.text} />
            )}
            {reminders === 'on' && <Muted>✓ Reminders on. Change the times anytime in Settings.</Muted>}
            {reminders === 'denied' && <Muted>Notifications are off for this app. You can allow them in iOS Settings.</Muted>}
            <Button title="Start journaling" onPress={() => setWelcomeSeen(true)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Step({ icon, color, title, body }: { icon: string; color: string; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, backgroundColor: colors.card, borderRadius: radius, padding: space.lg }}>
      <Text style={{ fontSize: 26, color, width: 30, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 21 }}>{body}</Text>
      </View>
    </View>
  );
}
