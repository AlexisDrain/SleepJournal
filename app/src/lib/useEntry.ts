import { useCallback, useEffect, useState } from 'react';
import { store } from '@/db/store';
import type { Entry, RoutineItem, Tag } from '@/lib/types';

/** Everything the Journal screen needs: the night's entry plus the user's routine and tags. */
export function useEntry(nightOf: string) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [routine, setRoutine] = useState<RoutineItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [e, r, t] = await Promise.all([store.getEntry(nightOf), store.routine.list(), store.tags.list()]);
    setEntry(e);
    setRoutine(r.filter((x) => !x.archived));
    setTags(t);
  }, [nightOf]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  /** Re-read everything quietly (no spinner), e.g. when you come back to the app. */
  const refresh = useCallback(() => fetchAll().catch((err) => setError((err as Error).message)), [fetchAll]);

  /** Re-fetch the routine items and tags (after editing them), without reloading the entry. */
  const reloadLists = useCallback(async () => {
    const [r, t] = await Promise.all([store.routine.list(), store.tags.list()]);
    setRoutine(r.filter((x) => !x.archived));
    setTags(t);
  }, []);

  return { entry, setEntry, routine, tags, loading, error, reload: load, refresh, reloadLists };
}
