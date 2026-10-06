// Web only. In a browser the journal's database file can be open in one tab at a time, and some
// private-browsing modes don't allow it at all. Without these checks the database library fails
// with messages like "Invalid VFS state", which tell the user nothing.
import { Platform } from 'react-native';

const LOCK_NAME = 'sleep-journal-database';
let claimed = false;

/**
 * Makes this tab the one that owns the database, for as long as it stays open.
 * Throws a plain-language error if another tab or window of this browser already owns it.
 */
export async function claimWebDatabase(): Promise<void> {
  if (Platform.OS !== 'web' || claimed) return;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return; // very old browser: skip the check and let the open itself decide

  const got = await new Promise<boolean>((resolve) => {
    locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Keep holding the lock until the tab closes: the returned promise never settles.
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(true));
  });
  if (!got) {
    throw new Error(
      'Sleep Journal is already open in another tab or window of this browser. Close the other one, then reload this page.',
    );
  }
  claimed = true;
}

/** Turns the database library's storage errors into something a person can act on. */
export function explainStorageError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (Platform.OS !== 'web') return e instanceof Error ? e : new Error(message);
  if (/another tab or window/.test(message)) return new Error(message);
  if (/VFS|AccessHandle|NoModificationAllowed|SecurityError|getDirectory|storage/i.test(message)) {
    return new Error(
      "This browser couldn't open the journal's storage. Private windows in Firefox and Safari don't allow it, " +
      'so use a normal window. If this is a normal window, close other tabs showing Sleep Journal and reload. ' +
      `(Details: ${message})`,
    );
  }
  return e instanceof Error ? e : new Error(message);
}
