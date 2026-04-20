import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mission } from '../types/mission';
import { fetchMissionHistoryForUnit } from '../lib/missionHistoryRemote';
import {
  readMissionHistoryCache,
  writeMissionHistoryCache,
} from '../lib/localAppCache';
import { APP_FOREGROUND_SYNC } from '../lib/syncEvents';

export function useMissionHistory() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHistory = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const unitId = profile?.assigned_unit_id;
      if (!unitId) {
        setIsLoading(false);
        setHistory([]);
        return;
      }

      try {
        if (!silent) setIsLoading(true);
        const { missions, error: err } = await fetchMissionHistoryForUnit(unitId);
        if (err) {
          setError(err);
          return;
        }
        setError(null);
        setHistory(missions);
        await writeMissionHistoryCache(unitId, missions);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[useMissionHistory] Fetch error:', msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [profile?.assigned_unit_id],
  );

  const scheduleSilentRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void fetchHistory({ silent: true });
    }, 400);
  }, [fetchHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unitId = profile?.assigned_unit_id;
      if (!unitId) {
        setHistory([]);
        setIsLoading(false);
        return;
      }

      const cached = await readMissionHistoryCache(unitId);
      if (cancelled) return;
      if (cached !== null) {
        setHistory(cached);
        setIsLoading(false);
      }
      await fetchHistory({ silent: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.assigned_unit_id, fetchHistory]);

  useEffect(() => {
    const unitId = profile?.assigned_unit_id;
    if (!unitId) return;

    const channel = supabase
      .channel(`mission-history-${unitId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispatches',
          filter: `unit_id=eq.${unitId}`,
        },
        (payload: { new?: { status?: string } }) => {
          if (payload.new?.status === 'completed') {
            scheduleSilentRefetch();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.assigned_unit_id, scheduleSilentRefetch]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(APP_FOREGROUND_SYNC, () => {
      void fetchHistory({ silent: true });
    });
    return () => sub.remove();
  }, [fetchHistory]);

  return { history, isLoading, error, refresh: () => fetchHistory({ silent: true }) };
}
