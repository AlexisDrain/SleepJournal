// Journal: one screen for the whole night, saved automatically as you go.
// Bedtime comes first, then Morning (the same order as a row of the spreadsheet). It opens on
// whatever is due now (morning before 3 PM, bedtime after) unless you forgot the check-in just
// before it. New users get one question at a time; "Show everything" puts it all on one page.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarSheet } from '@/components/CalendarSheet';
import { LatencyPicker, NightSwitcher, RESTED_LABELS, RestedScale, TagPicker } from '@/components/inputs';
import { NapsCard } from '@/components/NapsCard';
import { TimeField } from '@/components/TimeField';
import { Button, Chip, ErrorBox, Input, Muted, styles } from '@/components/ui';
import { store } from '@/db/store';
import { onPulled, requestSync } from '@/db/sync';
import { dueSlot, isFilled, loadUsualTimes, pickStart, usualTimes, wakeTimeProblem, type Start, type UsualTimes } from '@/lib/journal';
import { loadJournalMode, saveJournalMode, type JournalMode } from '@/lib/journalMode';
import { syncReminders } from '@/lib/notifications';
import { colors, radius, space } from '@/lib/theme';
import { clockOf, currentNight, formatClock, formatDuration } from '@/lib/time';
import { usePhaseOrder } from '@/lib/phaseOrder';
import type { Entry, EntryPatch, Phase, Tag } from '@/lib/types';
import { useAutosave, type SaveStatus } from '@/lib/useAutosave';
import { useDraft } from '@/lib/useDraft';
import { useEntry } from '@/lib/useEntry';
import { NARROW_PAGE, page, useWide, WIDE_PAGE } from '@/lib/useLayout';

const DEFAULT_RESTED = 3;
const MORNING_KEYS: (keyof EntryPatch)[] = ['sleepLatencyMin', 'wokeAt', 'dayStartedAt', 'rested', 'morningNote', 'dream'];
const RETARGET_AFTER_MS = 10 * 60_000; // coming back after this long re-picks what's due
const other = (p: Phase): Phase => (p === 'bedtime' ? 'morning' : 'bedtime');

export default function JournalScreen() {
  const { night } = useLocalSearchParams<{ night?: string }>(); // "/?night=2026-10-05" opens that night
  const [nightOf, setNightOf] = useState(night ?? currentNight());
  const [start, setStart] = useState<Start | null>(null);
  const [expanded, setExpanded] = useState<Record<Phase, boolean>>({ bedtime: true, morning: true });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [mode, setMode] = useState<JournalMode>('all');
  const [stepsDone, setStepsDone] = useState(false); // finished the questions for the check-in on screen
  // Set by tapping "Ask me one question at a time": walk through this check-in now, even on a
  // night that was browsed to or a check-in that is already filled in.
  const [stepsAsked, setStepsAsked] = useState<Phase | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const wide = useWide();
  const [phases, swapPhases] = usePhaseOrder(); // Bedtime first, or Morning first if you swapped them

  const { entry, setEntry, tags, loading, error, reload, refresh } = useEntry(nightOf);
  const draft = useDraft(entry, nightOf);

  useEffect(() => {
    loadJournalMode().then(setMode, () => {});
  }, []);
  const chooseMode = (m: JournalMode, ask: Phase | null = null) => {
    setMode(m);
    setStepsDone(false);
    setStepsAsked(ask);
    saveJournalMode(m).catch(() => {});
  };

  // ---------- autosave ----------
  const autosave = useAutosave(nightOf, draft.patch, {
    prepare: (p) => {
      // "Rested" shows 3 until changed; write that default once the morning has been started.
      const morningTouched = MORNING_KEYS.some((k) => k in p);
      return morningTouched && entry?.rested == null && !('rested' in p) ? { rested: DEFAULT_RESTED, ...p } : p;
    },
    onSaved: (saved, sent) => {
      if (saved.nightOf === nightOf) {
        setEntry(saved);
        draft.markSaved(sent);
      }
      syncReminders().catch(() => {}); // a filled check-in cancels its reminder
      requestSync(); // to the Google Sheet, if connected
    },
  });

  // ---------- where to open ----------
  const { flush } = autosave;
  const openAt = useCallback(async (target: { nightOf: string; open?: Phase; both?: boolean }) => {
    await flush();
    setNightOf(target.nightOf);
    setStepsDone(false);
    setStepsAsked(null);
    setExpanded(
      target.both || !target.open
        ? { bedtime: true, morning: true }
        : ({ [target.open]: true, [other(target.open)]: false } as Record<Phase, boolean>),
    );
  }, [flush]);

  const retarget = useCallback(async () => {
    const s = await pickStart();
    setStart(s);
    // Forgot last night's bedtime but it's morning now: show both check-ins.
    const both = s.missed && s.nightOf === dueSlot().nightOf;
    await openAt({ nightOf: s.nightOf, open: s.open, both });
    // Don't walk through the questions again for a check-in that's already filled in.
    setStepsDone(isFilled(await store.getEntry(s.nightOf), s.open));
  }, [openAt]);

  /** A night chosen by hand (arrows, calendar): show all of it. */
  const browseTo = useCallback((n: string) => {
    setStart(null);
    return openAt({ nightOf: n, both: true });
  }, [openAt]);

  useEffect(() => {
    if (night) browseTo(night);
    else retarget().catch((e) => setActionError((e as Error).message));
  }, [night]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back to the app: reload, and after a while away jump to what's due now.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        awaySince.current ??= Date.now();
        return;
      }
      const away = awaySince.current ? Date.now() - awaySince.current : 0;
      awaySince.current = null;
      syncReminders().catch(() => {});
      requestSync(0);
      if (away > RETARGET_AFTER_MS) retarget().catch(() => {});
      else refresh();
    });
    return () => sub.remove();
  }, [retarget, refresh]);

  // Show changes that just arrived from the Google Sheet.
  useEffect(() => onPulled(() => void refresh()), [refresh]);

  // Switching back to this tab: pick up changes made in other tabs, and refresh "your usual
  // times" (the defaults offered when "now" doesn't fit).
  const [usual, setUsual] = useState<UsualTimes>(() => usualTimes([]));
  useFocusEffect(useCallback(() => {
    refresh();
    loadUsualTimes().then(setUsual, () => {});
  }, [refresh]));

  // ---------- what to show ----------
  const due = dueSlot();
  const onStartNight = start !== null && start.nightOf === nightOf;
  const missedBanner = onStartNight && start.missed && !isFilled(entry, start.open);
  // One question at a time only for the check-in the app opened on; browsing other nights shows everything.
  const stepPhase: Phase | null = mode !== 'steps' ? null : stepsAsked ?? (onStartNight && !stepsDone ? start.open : null);

  const rested = draft.get('rested') ?? DEFAULT_RESTED;
  const fields: FieldProps = { nightOf, draft, tags, rested, usual };
  const filledNow = (phase: Phase) =>
    isFilled({ inBedAt: draft.get('inBedAt'), triedSleepAt: draft.get('triedSleepAt'), wokeAt: draft.get('wokeAt') }, phase);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, page(wide && !stepPhase ? WIDE_PAGE : NARROW_PAGE)]}>
        <NightSwitcher nightOf={nightOf} onChange={browseTo} onOpenCalendar={() => setCalendarOpen(true)} arrows={!stepPhase}
          onToday={onStartNight || nightOf === due.nightOf ? null : () => void retarget()} />
        <SaveLine status={autosave.status} dirty={draft.dirty} error={autosave.error} onRetry={flush} />
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : loading ? (
          <ActivityIndicator color={colors.night} />
        ) : (
          <>
            {missedBanner && (
              <MissedBanner phase={start.open}
                onSkip={() => openAt({ nightOf: due.nightOf, open: due.phase })}
                skipLabel={due.nightOf === nightOf ? null : due.phase === 'bedtime' ? 'Go to tonight ›' : 'Go to this morning ›'} />
            )}

            {stepPhase ? (
              <StepByStep key={`${nightOf}-${stepPhase}`} phase={stepPhase}
                steps={[...(stepPhase === 'bedtime' ? bedtimeSteps(fields) : morningSteps(fields)), tagsStep(fields)]}
                onDone={async () => {
                  await flush();
                  setStepsDone(true);
                  setStepsAsked(null);
                }} />
            ) : (
              <>
                {/* Phones: stacked, the check-in that isn't due folded. Wide screens: side by side, both open. */}
                <View style={wide ? { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } : undefined}>
                  {phases.map((phase) => (
                    <View key={phase} style={wide ? { flex: 1 } : undefined}>
                      <Section phase={phase} expanded={wide || expanded[phase]} collapsible={!wide} filled={filledNow(phase)}
                        onToggle={() => setExpanded((x) => ({ ...x, [phase]: !x[phase] }))}
                        summary={summary(phase, entry)}>
                        <AllSteps steps={phase === 'bedtime' ? bedtimeSteps(fields) : morningSteps(fields)} />
                      </Section>
                    </View>
                  ))}
                </View>
                <NapsCard nightOf={nightOf} />
                <View style={{
                  backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
                  padding: space.lg, gap: space.md,
                }}>
                  <Label>Tags · for this night</Label>
                  <TagPicker all={tags} selected={draft.get('tags') ?? []} onChange={(t) => draft.set('tags', t)} />
                </View>
              </>
            )}

            <Pressable hitSlop={8}
              onPress={() => {
                if (stepPhase) return chooseMode('all');
                // Which check-in to ask about: the one the app opened on, else the one due now,
                // else the first one of this night that isn't filled in.
                chooseMode('steps', onStartNight ? start.open
                  : nightOf === due.nightOf ? due.phase
                  : filledNow('bedtime') && !filledNow('morning') ? 'morning' : 'bedtime');
              }}
              style={{ alignSelf: 'center', marginTop: space.lg }}>
              <Text style={{ color: colors.muted, textDecorationLine: 'underline' }}>
                {stepPhase ? 'Show everything on one page' : 'Ask me one question at a time'}
              </Text>
            </Pressable>
            {!stepPhase && (
              <Pressable onPress={swapPhases} hitSlop={8} style={{ alignSelf: 'center', marginTop: space.md }}
                accessibilityRole="button" accessibilityLabel="Swap the order of Bedtime and Morning">
                <Text style={{ color: colors.muted, textDecorationLine: 'underline' }}>
                  {phases[0] === 'bedtime' ? 'Show Morning first' : 'Show Bedtime first'}
                </Text>
              </Pressable>
            )}
            {actionError && <ErrorBox message={actionError} />}
          </>
        )}
      </ScrollView>
      <CalendarSheet visible={calendarOpen} selected={nightOf} onClose={() => setCalendarOpen(false)}
        onPick={(n) => {
          setCalendarOpen(false);
          browseTo(n);
        }} />
    </KeyboardAvoidingView>
  );
}

// ---------- the questions ----------

type FieldProps = {
  nightOf: string;
  draft: ReturnType<typeof useDraft>;
  tags: Tag[];
  rested: number;
  usual: UsualTimes;
};

/** One thing the Journal asks. The same list drives both layouts: all on a page, or one at a time. */
interface Step {
  id: string;
  /** Asked in step-by-step mode. */
  question: string;
  /** Small heading on the full page (time rows carry their own label, so they have none). */
  label?: string;
  body: ReactNode;
  /** On the full page, hold this back until the step before it is answered. */
  waitsForPrevious?: boolean;
}

function bedtimeSteps({ nightOf, draft, usual }: FieldProps): Step[] {
  const accent = colors.night;
  const inBed = draft.get('inBedAt');
  const tried = draft.get('triedSleepAt');
  return [
    {
      id: 'inBed',
      question: 'When did you get in bed?',
      body: <TimeField label="Got in bed" nightOf={nightOf} phase="bedtime" accent={accent} usual={usual.inBedAt}
        value={inBed} onChange={(v) => draft.set('inBedAt', v)} />,
    },
    {
      id: 'tried',
      question: 'When did you start trying to sleep?',
      waitsForPrevious: !(inBed || tried),
      body: <TimeField label="Trying to sleep" nightOf={nightOf} phase="bedtime" accent={accent}
        usual={inBed ? clockOf(inBed) : usual.triedSleepAt}
        value={tried} onChange={(v) => draft.set('triedSleepAt', v)} />,
    },
    {
      id: 'note',
      question: 'Anything to note before sleeping?',
      label: 'Note',
      body: <Input multiline placeholder="e.g. must wake up at 8 am for ✈️"
        value={draft.get('bedtimeNote') ?? ''} onChangeText={(t) => draft.set('bedtimeNote', t || null)} />,
    },
  ];
}

function morningSteps({ nightOf, draft, rested, usual }: FieldProps): Step[] {
  const accent = colors.morning;
  const woke = draft.get('wokeAt');
  const started = draft.get('dayStartedAt');
  const latency = draft.get('sleepLatencyMin');
  const selectedTags = draft.get('tags') ?? [];
  const suggestInsomnia = latency !== null && latency > 180 && !selectedTags.includes('insomnia');
  const problem = wakeTimeProblem(draft.get('triedSleepAt') ?? draft.get('inBedAt'), woke);
  return [
    {
      id: 'woke',
      question: 'When did you wake up?',
      body: (
        <>
          <TimeField label="Woke up" nightOf={nightOf} phase="morning" accent={accent} usual={usual.wokeAt}
            value={woke} onChange={(v) => draft.set('wokeAt', v)} />
          {problem && (
            <View style={{ backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '88', padding: space.md, gap: space.sm }}>
              <Text style={{ color: colors.text }}>
                {problem.hours <= 0
                  ? `${formatClock(woke)} is before you went to sleep.`
                  : `${formatClock(woke)} would mean ${Math.round(problem.hours * 10) / 10} hours after you went to sleep.`}
                {' '}Check AM / PM.
              </Text>
              {problem.fix && (
                <Chip label={`Change to ${formatClock(problem.fix)}`} color={colors.morning}
                  onPress={() => draft.set('wokeAt', problem.fix)} />
              )}
            </View>
          )}
        </>
      ),
    },
    {
      id: 'started',
      question: 'When did you start your day?',
      waitsForPrevious: !(woke || started),
      body: <TimeField label="Started the day" nightOf={nightOf} phase="morning" accent={accent}
        usual={woke ? clockOf(woke) : usual.dayStartedAt}
        value={started} onChange={(v) => draft.set('dayStartedAt', v)} />,
    },
    {
      id: 'note',
      question: 'Anything to note about the night?',
      label: 'Note',
      body: <Input multiline placeholder="e.g. insomnia, late to bed because of party"
        value={draft.get('morningNote') ?? ''} onChangeText={(t) => draft.set('morningNote', t || null)} />,
    },
    {
      id: 'dream',
      question: 'Do you remember a dream?',
      label: 'Dream',
      body: <Input multiline placeholder="What do you remember? (or “don't remember”)"
        value={draft.get('dream') ?? ''} onChangeText={(t) => draft.set('dream', t || null)} />,
    },
    {
      id: 'latency',
      question: 'How long did it take to fall asleep?',
      label: 'Took to fall asleep',
      body: (
        <>
          <LatencyPicker value={latency} onChange={(v) => draft.set('sleepLatencyMin', v)} />
          {suggestInsomnia && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Muted>Rough night?</Muted>
              <Chip label="+ insomnia tag" color={colors.morning}
                onPress={() => draft.set('tags', [...selectedTags, 'insomnia'])} />
            </View>
          )}
        </>
      ),
    },
    {
      id: 'rested',
      question: 'How rested do you feel?',
      label: 'How rested do you feel?',
      body: <RestedScale value={rested} onChange={(v) => draft.set('rested', v)} />,
    },
  ];
}

/** Tags belong to the whole night, so step-by-step mode asks them last in either check-in. */
function tagsStep({ draft, tags }: FieldProps): Step {
  return {
    id: 'tags',
    question: 'Any tags for this night?',
    body: <TagPicker all={tags} selected={draft.get('tags') ?? []} onChange={(t) => draft.set('tags', t)} />,
  };
}

/** Every question of a check-in on one page. */
function AllSteps({ steps }: { steps: Step[] }) {
  return (
    <>
      {steps.filter((s) => !s.waitsForPrevious).map((s) => (
        <Fragment key={s.id}>
          {s.label && <Label>{s.label}</Label>}
          {s.body}
        </Fragment>
      ))}
    </>
  );
}

/** One question at a time, with Back / Next. Answers save as you go, so stopping halfway is fine. */
function StepByStep({ phase, steps, onDone }: { phase: Phase; steps: Step[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const s = SECTION[phase];
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.cardBorder,
      borderLeftWidth: 3, borderLeftColor: s.accent, padding: space.lg, gap: space.lg,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={{ color: s.accent, fontSize: 18 }}>{s.icon}</Text>
        <Text style={{ color: colors.muted, fontWeight: '600', flex: 1 }}>{s.title}</Text>
        <Muted>{index + 1} of {steps.length}</Muted>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((x, i) => (
          <View key={x.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? s.accent : colors.cardBorder }} />
        ))}
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{step.question}</Text>
      <View style={{ gap: space.md }}>{step.body}</View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {index > 0 && (
          <View style={{ flex: 1 }}>
            <Button title="Back" onPress={() => setIndex(index - 1)} color={colors.chip} textColor={colors.text} />
          </View>
        )}
        <View style={{ flex: 2 }}>
          <Button title={last ? 'Done' : 'Next'} color={s.accent} onPress={() => (last ? onDone() : setIndex(index + 1))} />
        </View>
      </View>
      <Muted>Skip anything you like: just tap {last ? 'Done' : 'Next'}.</Muted>
    </View>
  );
}

// ---------- pieces of the full page ----------

const SECTION = {
  bedtime: { icon: '☾', title: 'Bedtime', accent: colors.night },
  morning: { icon: '☀', title: 'Morning', accent: colors.morning },
};

function Section({ phase, expanded, collapsible, filled, onToggle, summary, children }: {
  phase: Phase;
  expanded: boolean;
  collapsible: boolean;
  filled: boolean;
  onToggle: () => void;
  summary: string;
  children: ReactNode;
}) {
  const s = SECTION[phase];
  const accent = filled ? colors.success : s.accent;
  return (
    <View style={{
      backgroundColor: filled ? colors.successBg : colors.card, borderRadius: radius, borderWidth: 1,
      borderColor: filled ? colors.success + '55' : colors.cardBorder,
      borderLeftWidth: 3, borderLeftColor: accent, marginBottom: space.md,
    }}>
      <Pressable onPress={onToggle} disabled={!collapsible} style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text style={{ color: accent, fontSize: 22 }}>{s.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: filled ? colors.success : colors.text, fontSize: 18, fontWeight: '700' }}>
            {s.title}{filled ? '  ✓' : ''}
          </Text>
          {!expanded && <Muted>{summary}</Muted>}
        </View>
        {collapsible && <Text style={{ color: colors.muted, fontSize: 16 }}>{expanded ? '▴' : '▾'}</Text>}
      </Pressable>
      {expanded && <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>{children}</View>}
    </View>
  );
}

function MissedBanner({ phase, onSkip, skipLabel }: { phase: Phase; onSkip: () => void; skipLabel: string | null }) {
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.morning + '66',
      padding: space.md, marginBottom: space.md, gap: space.sm,
    }}>
      <Text style={{ color: colors.text }}>
        {phase === 'bedtime' ? "You didn't fill in last night's bedtime." : "You didn't fill in this morning."} Fill it in
        while you still remember.
      </Text>
      {skipLabel && (
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={{ color: colors.night, fontWeight: '600' }}>{skipLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SaveLine({ status, dirty, error, onRetry }: { status: SaveStatus; dirty: boolean; error: string | null; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <Pressable onPress={onRetry} style={{ alignItems: 'center', marginBottom: space.md }}>
        <Text style={{ color: colors.danger }}>Couldn't save: {error}. Tap to retry.</Text>
      </Pressable>
    );
  }
  const text = status === 'saving' || dirty ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Changes save automatically';
  return <Text style={{ color: colors.muted, textAlign: 'center', marginTop: -space.sm, marginBottom: space.md, fontSize: 13 }}>{text}</Text>;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: space.sm }}>
      {children}
    </Text>
  );
}

/** One line shown when a section is folded. */
function summary(phase: Phase, e: Entry | null) {
  if (phase === 'bedtime') {
    if (!e?.inBedAt && !e?.triedSleepAt) return 'Not filled in yet';
    return [
      e?.inBedAt && `in bed ${formatClock(e.inBedAt)}`,
      e?.triedSleepAt && `trying ${formatClock(e.triedSleepAt)}`,
    ].filter(Boolean).join(' · ');
  }
  if (!e?.wokeAt && e?.rested == null) return 'Fill this in when you wake up';
  return [
    e?.wokeAt && `woke ${formatClock(e.wokeAt)}`,
    e?.rested != null && RESTED_LABELS[e.rested - 1],
    e?.sleepLatencyMin != null && `${formatDuration(e.sleepLatencyMin)} to fall asleep`,
  ].filter(Boolean).join(' · ');
}
