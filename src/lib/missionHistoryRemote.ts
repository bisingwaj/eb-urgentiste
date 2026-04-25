import { supabase } from './supabase';
import type { Mission } from "../types/mission";

/**
 * Charge l’historique des missions terminées pour une unité (même logique que useMissionHistory).
 * Utilisable hors composant React (bootstrap, prefetch).
 */
export async function fetchMissionHistoryForUnit(
  unitId: string,
): Promise<{ missions: Mission[]; error: string | null }> {
  try {
    const { data, error: dispatchError } = await supabase
      .from('dispatches')
      .select(
        `
          id,
          status,
          incident_id,
          notes,
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
            commune,
            ville,
            province,
            caller_name,
            caller_phone,
            citizen_id,
            caller_realtime_lat,
            caller_realtime_lng,
            caller_realtime_updated_at,
            recommended_facility,
            recommended_actions,
            notes,
            incident_at,
            media_urls,
            media_type,
            battery_level,
            network_state,
            created_at,
            updated_at
          )
        `.trim(),
      )
      .eq('unit_id', unitId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (dispatchError) {
      return { missions: [], error: dispatchError.message };
    }

    const rows = (data || []) as any[];
    const incidentIds = [
      ...new Set(
        rows
          .map((d: any) => d.incidents?.id)
          .filter((id: unknown): id is string => typeof id === 'string'),
      ),
    ];

    let sosByIncident: Record<string, any[]> = {};
    if (incidentIds.length > 0) {
      const { data: sosRows, error: sosErr } = await supabase
        .from('sos_responses')
        .select('incident_id, question_key, question_text, answer, answered_at')
        .in('incident_id', incidentIds);
      if (sosErr) {
        if (__DEV__) console.warn('[missionHistoryRemote] sos_responses:', sosErr.message);
      } else if (sosRows) {
        sosByIncident = sosRows.reduce(
          (acc: Record<string, any[]>, row: any) => {
            const iid = row.incident_id;
            if (!iid) return acc;
            if (!acc[iid]) acc[iid] = [];
            acc[iid].push(row);
            return acc;
          },
          {},
        );
      }
    }

    const missions: Mission[] = rows.map((dispatch: any) => {
      const incident = dispatch.incidents;
      const sosRaw = incident?.id ? sosByIncident[incident.id] : undefined;
      const sos_responses = Array.isArray(sosRaw)
        ? sosRaw.map((r: any) => ({
            question_key: String(r.question_key ?? ''),
            question_text: r.question_text ?? null,
            answer: r.answer ?? null,
            answered_at: r.answered_at,
          }))
        : [];

      return {
        id: dispatch.id,
        incident_id: incident.id,
        citizen_id: incident.citizen_id != null ? String(incident.citizen_id) : null,
        reference: incident.reference,
        type: incident.type,
        title: incident.title,
        description: incident.description,
        priority: incident.priority,
        incident_status: incident.status,
        dispatch_status: dispatch.status,
        location: {
          lat: incident.location_lat ?? null,
          lng: incident.location_lng ?? null,
          address: incident.location_address ?? null,
          commune: incident.commune ?? null,
          ville: incident.ville ?? null,
          province: incident.province ?? null,
        },
        caller: {
          name: incident.caller_name || 'Anonyme',
          phone: incident.caller_phone || '-',
        },
        destination: incident.recommended_facility,
        created_at: incident.created_at,
        dispatched_at: dispatch.dispatched_at ?? dispatch.created_at,
        arrived_at: dispatch.arrived_at ?? undefined,
        completed_at: dispatch.completed_at ?? undefined,
        dispatch_notes: dispatch.notes ?? null,
        incident_notes: incident.notes ?? null,
        recommended_actions: incident.recommended_actions ?? null,
        incident_at: incident.incident_at ?? null,
        caller_realtime_lat: incident.caller_realtime_lat ?? null,
        caller_realtime_lng: incident.caller_realtime_lng ?? null,
        caller_realtime_updated_at: incident.caller_realtime_updated_at ?? null,
        sos_responses,
        media_urls: incident.media_urls ?? null,
        battery_level: incident.battery_level ?? null,
        network_state: incident.network_state ?? null,
        incident_updated_at: incident.updated_at ?? null,
      };
    });

    return { missions, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { missions: [], error: msg };
  }
}
