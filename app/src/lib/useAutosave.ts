import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { store } from '@/db/store';
import { forgetEdits, rememberEdits } from './pendingEdits';
import type { Entry, EntryPatch } from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Saves unsaved edits automatically, ~0.7 s after the last change. Saves are queued so two never
 * run at once, and `flush()` writes anything pending right away (before switching nights,
 * leaving the screen, or when the app goes to the background).
 */
export function useAutosave(
  nightOf: string,
  patch: EntryPatch,
  opts: {
    /** Last chance to add defaults to what gets written. */
    prepare: (p: EntryPatch) => EntryPatch;
    /** Called with the saved entry and the edits that were sent. */
    onSaved: (saved: Entry, sent: EntryPatch) => void;
  },
  delayMs = 700,
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ nightOf, patch, opts });
  latest.current = { nightOf, patch, opts };
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    queue.current = queue.current.then(async () => {
      const { nightOf: night, patch: edits, opts: o } = latest.current;
      if (Object.keys(edits).length === 0) return;
      setStatus('saving');
      try {
        const saved = await store.saveEntry(night, o.prepare(edits));
        o.onSaved(saved, edits);
        setStatus('saved');
        setError(null);
      } catch (e) {
        setStatus('error');
        setError((e as Error).message);
      }
    });
    return queue.current;
  }, []);

  // Web: kept where closing the tab can't lose it, until the save below has happened.
  // (Only forgotten once there were edits: on opening, the last session's may still be waiting.)
  const remembered = useRef(false);
  useEffect(() => {
    if (Object.keys(patch).length) {
      rememberEdits('journal', nightOf, latest.current.opts.prepare(patch));
      remembered.current = true;
    } else if (remembered.current) {
      forgetEdits('journal', nightOf);
      remembered.current = false;
    }
  }, [patch, nightOf]);

  // Debounced save after each change.
  useEffect(() => {
    if (Object.keys(patch).length === 0) return;
    const t = setTimeout(flush, delayMs);
    return () => clearTimeout(t);
  }, [patch, flush, delayMs]);

  // Never lose edits when the app is backgrounded or the screen goes away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flush();
    });
    return () => {
      sub.remove();
      flush();
    };
  }, [flush]);

  return { status, error, flush };
}
