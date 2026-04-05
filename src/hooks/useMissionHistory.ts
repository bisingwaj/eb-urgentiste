import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mission } from './useActiveMission';

export function useMissionHistory() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!profile?.assigned_unit_id) {
      setIsLoading(false);
      setHistory([]);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: dispatchError } = await supabase
        .from('dispatches')
        .select(`
          id,
          status,
          incident_id,
          created_at,
          dispatched_at,
          arrived_at,
          completed_at,
          incidents (
            id,
            reference,
            type,
            title,
            description,
            priority,
            status,
            location_lat,
             location_lng,
             location_address,
             caller_name,
             caller_phone,
             recommended_facility,
             created_at
           )
         `)
        .eq('unit_id', profile.assigned_unit_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (dispatchError) throw dispatchError;

      const missions: Mission[] = (data || []).map((dispatch: any) => {
        const incident = dispatch.incidents;
        return {
          id: dispatch.id,
          incident_id: incident.id,
          reference: incident.reference,
          type: incident.type,
          title: incident.title,
          description: incident.description,
          priority: incident.priority,
          incident_status: incident.status,
          dispatch_status: dispatch.status,
          location: {
            lat: incident.location_lat,
            lng: incident.location_lng,
            address: incident.location_address,
          },
           caller: {
             name: incident.caller_name || 'Anonyme',
             phone: incident.caller_phone || '-',
           },
           destination: incident.recommended_facility,
           created_at: incident.created_at,
           dispatched_at: dispatch.created_at,
           arrived_at: dispatch.arrived_at,
           completed_at: dispatch.completed_at,
         };
      });

      setHistory(missions);
    } catch (err: any) {
      console.error('[useMissionHistory] Fetch error:', err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.assigned_unit_id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, isLoading, error, refresh: fetchHistory };
}
