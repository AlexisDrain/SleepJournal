import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

let webQueue: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` in a transaction (all of it is saved, or none of it).
 * Phones: an exclusive transaction, so only fn's queries are part of it.
 * Web: expo-sqlite has no exclusive transactions there, so a regular one, and transactions are
 * queued one after another so two never overlap.
 */
export function transaction(db: SQLiteDatabase, fn: (tx: SQLiteDatabase) => Promise<void>): Promise<void> {
  if (Platform.OS !== 'web') return db.withExclusiveTransactionAsync(fn);
  const run = webQueue.then(() => db.withTransactionAsync(() => fn(db)));
  webQueue = run.catch(() => {});
  return run;
}
