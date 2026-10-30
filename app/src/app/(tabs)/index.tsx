// Journal: one screen for the whole night, saved automatically as you go.
// Bedtime comes first, then Morning (the same order as a row of the spreadsheet). It opens on
// whatever is due now (morning before 3 PM, bedtime after) unless you forgot the check-in just
// before it. New users get one question at a time; "Show everything" puts it all on one page.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarSheet } from '@/components/CalendarSheet';
import { Panel } from '@/components/Panel';
import { SyncChip } from '@/components/SyncChip';
import { joinStatus, useSyncText } from '@/components/SyncLine';
import { useSheetSync } from '@/lib/useSync';
import { TagManager } from '@/components/TagManager';
import { LatencyPicker, NightSwitcher, RESTED_LABELS, RestedScale, TagPicker } from '@/components/inputs';
import { NapsCard } from '@/components/NapsCard';
import { TimeField } from '@/components/TimeField';
import { Button, Chip, ErrorBox, Input, Muted, styles } from '@/components/ui';
import { store } from '@/db/store';
import { onPulled, requestSync } from '@/db/sync';
import { bedtimeProblem, negativeSleep, dueSlot, isFilled, loadUsualTimes, pickStart, untilHint, usualTimes, wakeTimeProblem, type Start, type UsualTimes } from '@/lib/journal';
import { loadJournalMode, saveJournalMode, type JournalMode } from '@/lib/journalMode';
import { syncReminders } from '@/lib/notifications';
import { colors, radius, space } from '@/lib/theme';
import { clockOf, currentNight, formatClock, formatDuration } from '@/lib/time';
import { useCombine, type Combine } from '@/lib/advanced';
import { useHour24 } from '@/lib/clockFormat';
import { useThemeName } from '@/lib/displayMode';
import { usePhaseOrder } from '@/lib/phaseOrder';
import type { Entry, EntryPatch, Phase, Tag } from '@/lib/types';
import { useAutosave, type SaveStatus } from '@/lib/useAutosave';
import { usePullToSync } from '@/lib/usePullToSync';
import { useDraft } from '@/lib/useDraft';
import { useEntry } from '@/lib/useEntry';
import { NARROW_PAGE, page, useWide, WIDE_PAGE } from '@/lib/useLayout';

const DEFAULT_RESTED = 3; // "How rested" starts on the middle answer
const MORNING_KEYS: (keyof EntryPatch)[] = ['sleepLatencyMin', 'wokeAt', 'dayStartedAt', 'rested', 'morningNote', 'dream'];
const RETARGET_AFTER_MS = 10 * 60_000; // coming back after this long re-picks what's due
const other = (p: Phase): Phase => (p === 'bedtime' ? 'morning' : 'bedtime');

export default function JournalScreen() {
  const pullControl = usePullToSync();
  useThemeName(); // redraw when the display changes (dark / light)
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
  useHour24(); // redraw the times if the 12/24-hour setting changes
  const [phases, swapPhases] = usePhaseOrder('journal'); // Bedtime first, or Morning first if you swapped them

  const { entry, setEntry, tags, loading, error, reload, refresh, reloadLists } = useEntry(nightOf);
  const [managingTags, setManagingTags] = useState(false);
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
      // "Rested" shows 3 until changed: write that default once the morning has been started,
      // unless you cleared it on purpose (tapping the chosen number again).
      const morningTouched = MORNING_KEYS.some((k) => k in p);
      const skipped = p.restedSkipped ?? entry?.restedSkipped ?? false;
      return morningTouched && !skipped && entry?.rested == null && !('rested' in p) ? { rested: DEFAULT_RESTED, ...p } : p;
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

  // A saved answer always shows. Otherwise 3 is pre-selected, unless you cleared it for this night.
  const rested = draft.get('rested') ?? (draft.get('restedSkipped') ? null : DEFAULT_RESTED);
  const combine = useCombine();
  const fields: FieldProps = { nightOf, draft, tags, rested, usual, combine };
  const filledNow = (phase: Phase) =>
    isFilled({ inBedAt: draft.get('inBedAt'), triedSleepAt: draft.get('triedSleepAt'), wokeAt: draft.get('wokeAt') }, phase);

  return (
    <View style={styles.screen}>
      {/* automaticallyAdjustKeyboardInsets: the list ends at the top of the iPhone keyboard. */}
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={pullControl}
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
            {/* Centered under the date, like Swap / Edit on the Routines tab. */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.md, marginBottom: space.md }}>
              {!stepPhase && <Chip label={wide ? '⇄ Swap' : '⇅ Swap'} onPress={swapPhases} />}
              <SyncChip />
              <Chip label={stepPhase ? 'Show everything' : 'One question at a time'}
                onPress={() => {
                  if (stepPhase) return chooseMode('all');
                  // Which check-in to ask about: the one the app opened on, else the one due now,
                  // else the first one of this night that isn't filled in.
                  chooseMode('steps', onStartNight ? start.open
                    : nightOf === due.nightOf ? due.phase
                    : filledNow('bedtime') && !filledNow('morning') ? 'morning' : 'bedtime');
                }} />
            </View>
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
                        summary={summary(phase, entry, combine)} hint={untilHint(phase, nightOf)}>
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
                  <Pressable onPress={() => setManagingTags(true)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                    <Text style={{ color: colors.muted, textDecorationLine: 'underline' }}>Hide or delete tags…</Text>
                  </Pressable>
                </View>
              </>
            )}

            {actionError && <ErrorBox message={actionError} />}
          </>
        )}
      </ScrollView>
      <Panel visible={managingTags} onClose={() => setManagingTags(false)}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Tags</Text>
        {/* A deleted tag also leaves this night, so re-read the night as well as the list. */}
        <TagManager onChanged={() => { reloadLists(); refresh(); }} />
        <Button title="Done" small color={colors.chip} textColor={colors.text} onPress={() => setManagingTags(false)} />
      </Panel>
      <CalendarSheet visible={calendarOpen} selected={nightOf} onClose={() => setCalendarOpen(false)}
        onPick={(n) => {
          setCalendarOpen(false);
          browseTo(n);
        }} />
    </View>
  );
}

// ---------- the questions ----------

type FieldProps = {
  nightOf: string;
  draft: ReturnType<typeof useDraft>;
  tags: Tag[];
  rested: number | null;
  usual: UsualTimes;
  /** Settings → Advanced: one time question instead of two, saved in both fields. */
  combine: Combine;
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
  /** Shown under the body when something needs a second look (e.g. times in the wrong order). */
  after?: ReactNode;
}

/** A red-edged note under a time that doesn't fit with the one before it. */
function TimeWarning({ children }: { children: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.danger + '88', padding: space.md }}>
      <Text style={{ color: colors.text }}>{children}</Text>
    </View>
  );
}

function bedtimeSteps({ nightOf, draft, usual, combine }: FieldProps): Step[] {
  const accent = colors.night;
  const inBed = draft.get('inBedAt');
  const tried = draft.get('triedSleepAt');
  /** A note under a bedtime that's in the morning (AM/PM slip), with a button to make it the evening. */
  const morningBedtime = (time: string | null, apply: (fix: string) => void) => {
    const p = bedtimeProblem(time);
    return p && (
      <TimeWarning>
        {formatClock(time)} is the morning after this night. Did you mean {formatClock(p.fix)}?{'\n'}
        <Text style={{ color: colors.night, fontWeight: '700' }} onPress={() => apply(p.fix)} accessibilityRole="button">
          Change to {formatClock(p.fix)}
        </Text>
      </TimeWarning>
    );
  };
  const note: Step = {
    id: 'note',
    question: 'Anything to note before sleeping?',
    label: 'Note',
    body: <Input multiline placeholder="e.g. must wake up at 8 am for ✈️, or leave blank"
      value={draft.get('bedtimeNote') ?? ''} onChangeText={(t) => draft.set('bedtimeNote', t || null)} />,
  };
  if (combine.bed) {
    return [
      {
        id: 'inBed',
        question: 'When did you go to bed?',
        body: <TimeField label="Went to bed" nightOf={nightOf} phase="bedtime" accent={accent} usual={usual.inBedAt}
          value={inBed ?? tried} onChange={(v) => {
            draft.set('inBedAt', v);
            draft.set('triedSleepAt', v);
          }} />,
        after: morningBedtime(inBed ?? tried, (fix) => {
          draft.set('inBedAt', fix);
          draft.set('triedSleepAt', fix);
        }),
      },
      note,
    ];
  }
  return [
    {
      id: 'inBed',
      question: 'When did you get in bed?',
      body: <TimeField label="Got in bed" nightOf={nightOf} phase="bedtime" accent={accent} usual={usual.inBedAt}
        value={inBed} onChange={(v) => draft.set('inBedAt', v)} />,
      after: morningBedtime(inBed, (fix) => draft.set('inBedAt', fix)),
    },
    {
      id: 'tried',
      question: 'When did you start trying to sleep?',
      waitsForPrevious: !(inBed || tried),
      body: <TimeField label="Trying to sleep" nightOf={nightOf} phase="bedtime" accent={accent}
        usual={inBed ? clockOf(inBed) : usual.triedSleepAt}
        value={tried} onChange={(v) => draft.set('triedSleepAt', v)} />,
      after: morningBedtime(tried, (fix) => draft.set('triedSleepAt', fix)) || inBed && tried && Date.parse(inBed) > Date.parse(tried) && (
        <TimeWarning>
          Got in bed ({formatClock(inBed)}) is after you started trying to sleep ({formatClock(tried)}). Check the times
          and AM / PM.
        </TimeWarning>
      ),
    },
    note,
  ];
}

function morningSteps({ nightOf, draft, rested, usual, combine }: FieldProps): Step[] {
  const accent = colors.morning;
  const woke = draft.get('wokeAt') ?? (combine.morning ? draft.get('dayStartedAt') : null);
  const setWoke = (v: string | null) => {
    draft.set('wokeAt', v);
    if (combine.morning) draft.set('dayStartedAt', v); // one answer for both
  };
  const started = draft.get('dayStartedAt');
  const latency = draft.get('sleepLatencyMin');
  const selectedTags = draft.get('tags') ?? [];
  const suggestInsomnia = latency !== null && latency > 180 && !selectedTags.includes('insomnia');
  const problem = wakeTimeProblem(draft.get('triedSleepAt') ?? draft.get('inBedAt'), woke);
  // Only when the wake time itself looks fine: then it's the bedtime or the time to fall asleep.
  const minus = problem ? null : negativeSleep(draft.get('triedSleepAt') ?? draft.get('inBedAt'), woke, latency);
  return [
    {
      id: 'woke',
      question: combine.morning ? 'When did you get up?' : 'When did you wake up?',
      body: (
        <>
          <TimeField label={combine.morning ? 'Got up' : 'Woke up'} nightOf={nightOf} phase="morning" accent={accent} usual={usual.wokeAt}
            value={woke} onChange={setWoke} />
          {minus !== null && (
            <TimeWarning>
              That makes {minus} hours asleep: waking up before falling asleep. Check the bedtime (AM / PM) and
              "Took to fall asleep".
            </TimeWarning>
          )}
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
                  onPress={() => setWoke(problem.fix)} />
              )}
            </View>
          )}
        </>
      ),
    },
    ...(combine.morning ? [] : [{
      id: 'started',
      question: 'When did you start your day?',
      waitsForPrevious: !(woke || started),
      body: <TimeField label="Started the day" nightOf={nightOf} phase="morning" accent={accent}
        usual={woke ? clockOf(woke) : usual.dayStartedAt}
        value={started} onChange={(v) => draft.set('dayStartedAt', v)} />,
      after: woke && started && Date.parse(started) < Date.parse(woke) && (
        <TimeWarning>
          Started the day ({formatClock(started)}) is before you woke up ({formatClock(woke)}). Check the times
          and AM / PM.
        </TimeWarning>
      ),
    }]),
    {
      id: 'dream',
      question: 'Do you remember a dream?',
      label: 'Dream',
      body: <Input multiline placeholder="Leave blank if you don't remember"
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
      body: <RestedScale value={rested} onChange={(v) => {
        draft.set('rested', v);
        draft.set('restedSkipped', v === null); // cleared on purpose: don't go back to the pre-selected 3
      }} />,
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
          {s.body}{s.after || null}
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
      <View style={{ gap: space.md }}>{step.body}{step.after || null}</View>
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
  bedtime: { icon: '☾', title: 'Bedtime', get accent() { return colors.night; } },
  morning: { icon: '☀', title: 'Morning', get accent() { return colors.morning; } },
};

function Section({ phase, expanded, collapsible, filled, onToggle, summary, hint, children }: {
  phase: Phase;
  expanded: boolean;
  collapsible: boolean;
  filled: boolean;
  onToggle: () => void;
  summary: string;
  /** The hours this check-in covers, e.g. "until 3 PM" (shown on every night). */
  hint: string;
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
          {/* Under the title: what's filled in when folded, otherwise how long it's this check-in's turn. */}
          {!expanded ? <Muted>{summary}</Muted> : hint ? <Muted>{hint}</Muted> : null}
        </View>
        {collapsible && <Text style={{ color: colors.muted, fontSize: 16 }}>{expanded ? '▴' : '▾'}</Text>}
      </Pressable>
      {expanded && <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>{children}</View>}
    </View>
  );
}

function MissedBanner({ phase, onSkip, skipLabel }: { phase: Phase; onSkip: () => void; skipLabel: string | null }) {
  // With a Google Sheet connected, the check-in may already be filled in on another device and not
  // here yet: say so while syncing, and confirm once the sync has finished.
  const { connected, status } = useSheetSync();
  const which = phase === 'bedtime' ? 'Last night' : 'This morning';
  const syncNote = !connected ? null
    : status === 'syncing' || status === 'idle' ? 'Syncing now. If you filled it in on another device, please wait a moment.'
    : status === 'done' ? `Sync complete. ${which} is confirmed not filled in.`
    : "Couldn't sync, so it may already be filled in on another device.";
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.morning + '66',
      padding: space.md, marginBottom: space.md, gap: space.sm,
    }}>
      <Text style={{ color: colors.text }}>
        {phase === 'bedtime' ? "You didn't fill in last night's bedtime." : "You didn't fill in this morning."} Fill it in
        while you still remember.
      </Text>
      {syncNote && <Muted>{syncNote}</Muted>}
      {skipLabel && (
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={{ color: colors.night, fontWeight: '600' }}>{skipLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SaveLine({ status, dirty, error, onRetry }: { status: SaveStatus; dirty: boolean; error: string | null; onRetry: () => void }) {
  const sync = useSyncText(); // "Last synced …", when a Google Sheet is connected
  if (status === 'error') {
    return (
      <Pressable onPress={onRetry} style={{ alignItems: 'center', marginBottom: space.md }}>
        <Text style={{ color: colors.danger }}>Couldn't save: {error}. Tap to retry.</Text>
      </Pressable>
    );
  }
  const text = joinStatus(status === 'saving' || dirty ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Changes save automatically', sync);
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
function summary(phase: Phase, e: Entry | null, combine: Combine) {
  if (phase === 'bedtime') {
    if (!e?.inBedAt && !e?.triedSleepAt) return 'Fill this before going to sleep';
    return [
      e?.inBedAt && `in bed ${formatClock(e.inBedAt)}`,
      !combine.bed && e?.triedSleepAt && `trying ${formatClock(e.triedSleepAt)}`,
    ].filter(Boolean).join(' · ');
  }
  if (!e?.wokeAt && e?.rested == null) return 'Fill this in when you wake up';
  return [
    e?.wokeAt && `woke ${formatClock(e.wokeAt)}`,
    e?.rested != null && RESTED_LABELS[e.rested - 1],
    e?.sleepLatencyMin != null && `${formatDuration(e.sleepLatencyMin)} to fall asleep`,
  ].filter(Boolean).join(' · ');
}
