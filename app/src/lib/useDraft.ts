import { useEffect, useState } from 'react';
import type { Entry, EntryPatch, RoutineValue } from './types';

/**
 * Unsaved edits layered over the saved entry. `get` reads the edit if there is one,
 * otherwise the saved value. `patch` is exactly what autosave writes.
 */
export function useDraft(entry: Entry | null, nightOf: string) {
  const [patch, setPatch] = useState<EntryPatch>({});
  // Callers flush pending edits before switching nights, so a new night starts clean.
  useEffect(() => setPatch({}), [nightOf]);

  function get<K extends keyof EntryPatch>(key: K): Entry[K] | null {
    if (key in patch) return patch[key] ?? null;
    return entry?.[key] ?? null;
  }
  function set<K extends keyof EntryPatch>(key: K, value: EntryPatch[K]) {
    setPatch((p) => ({ ...p, [key]: value }));
  }
  function setRoutine(id: number, value: RoutineValue) {
    setPatch((p) => ({ ...p, routine: { ...p.routine, [id]: value } }));
  }

  /** Drop the edits that were just saved, but keep any made again while the save was running. */
  function markSaved(sent: EntryPatch) {
    setPatch((p) => {
      const next: EntryPatch = { ...p };
      for (const k of Object.keys(sent) as (keyof EntryPatch)[]) {
        if (k !== 'routine' && Object.is(next[k], sent[k])) delete next[k];
      }
      if (sent.routine && next.routine) {
        const routine = { ...next.routine };
        for (const [id, v] of Object.entries(sent.routine)) if (Object.is(routine[id], v)) delete routine[id];
        if (Object.keys(routine).length) next.routine = routine;
        else delete next.routine;
      }
      return next;
    });
  }

  const routineValues: Record<string, RoutineValue> = { ...entry?.routine, ...patch.routine };
  const dirty = Object.keys(patch).length > 0;

  return { patch, get, set, setRoutine, routineValues, dirty, markSaved };
}
