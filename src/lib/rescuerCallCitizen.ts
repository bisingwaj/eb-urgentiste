import { Alert } from 'react-native';
import { supabase } from './supabase';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Edge `rescuer-call-citizen` puis ouverture de CallCenter avec token serveur.
 */
export async function startRescuerToCitizenVoipCall(params: {
  incidentId: string;
  citizenId: string;
  callType: 'audio' | 'video';
  patientName?: string;
}): Promise<void> {
  const { incidentId, citizenId, callType, patientName } = params;

  const { data, error } = await supabase.functions.invoke('rescuer-call-citizen', {
    body: {
      incident_id: incidentId,
      citizen_id: citizenId,
      call_type: callType,
    },
  });

  if (error) {
    let msg = error.message ?? 'Erreur réseau';
    try {
      const ctx = error as { context?: { json?: () => Promise<unknown> } };
      if (ctx.context && typeof ctx.context.json === 'function') {
        const body = (await ctx.context.json()) as { error?: string; message?: string };
        msg = body?.error || body?.message || msg;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const d = (data ?? {}) as Record<string, unknown>;
  if (d.error != null && String(d.error).length > 0) {
    throw new Error(String(d.error));
  }

  const callId = (d.call_id ?? d.callId) as string | undefined;
  const channelName = (d.channel_name ?? d.channelName) as string | undefined;
  const token = d.token as string | undefined;
  const appId = (d.app_id ?? d.appId) as string | undefined;
  const rawUid = d.uid;
  const uid =
    typeof rawUid === 'number'
      ? rawUid
      : typeof rawUid === 'string' && rawUid !== ''
        ? parseInt(rawUid, 10)
        : undefined;
  const hasVideo =
    callType === 'video' || String(d.call_type ?? d.callType ?? '').toLowerCase() === 'video';

  if (!callId || !channelName || !token) {
    throw new Error('Réponse serveur incomplète. Réessayez.');
  }

  navigationRef.navigate('CallCenter', {
    incoming: true,
    callId,
    channelName,
    hasVideo,
    prefetchedToken: token,
    prefetchedAppId: typeof appId === 'string' && appId.length > 0 ? appId : undefined,
    ...(uid != null && !Number.isNaN(uid) ? { prefetchedRtcUid: uid } : {}),
    target: 'patient',
    patientName,
  });
}

export function alertVoipError(err: unknown): void {
  const msg = err instanceof Error ? err.message : 'Erreur réseau';
  Alert.alert('Appel (application)', msg);
}
