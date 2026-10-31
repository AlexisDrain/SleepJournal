// Web only: closing a tab kills the database worker, so an edit still waiting to be saved would be
// lost. Each one is also kept in localStorage, which is written at once and survives closing; the
// next launch finishes the save (see getDb). Phones have no localStorage, so this does nothing there.
import type { EntryPatch } from './types';

const KEY = 'sleepjournal.pendingEdits.v1';
type Pending = Record<string, { nightOf: string; patch: EntryPatch }>;

function box(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked site data, private window
  }
}

function read(): Pending {
  try {
    return JSON.parse(box()?.getItem(KEY) ?? '{}') as Pending;
  } catch {
    return {};
  }
}

function write(p: Pending) {
  try {
    if (Object.keys(p).length) box()?.setItem(KEY, JSON.stringify(p));
    else box()?.removeItem(KEY);
  } catch {
    // no room or blocked: the normal save still runs
  }
}

/** `source` keeps the Journal's and Routines' waiting edits apart. */
export function rememberEdits(source: string, nightOf: string, patch: EntryPatch) {
  if (box()) write({ ...read(), [`${source}:${nightOf}`]: { nightOf, patch } });
}

export function forgetEdits(source: string, nightOf: string) {
  if (!box()) return;
  const p = read();
  delete p[`${source}:${nightOf}`];
  write(p);
}

export const waitingEdits = () => Object.values(read());
export const clearWaitingEdits = () => write({});
