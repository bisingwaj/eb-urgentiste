import { supabase } from './supabase';

export type AgoraTokenPayload = {
  channelName: string;
  uid?: number;
  role?: 'publisher' | 'subscriber';
  expireTime?: number;
};

export type AgoraTokenResult = {
  token: string;
  appId?: string;
  channelName?: string;
  uid?: number;
};

/**
 * Token RTC Agora — toujours via Edge Function `agora-token` (certificat jamais côté client).
 */
export async function fetchAgoraToken(params: AgoraTokenPayload): Promise<AgoraTokenResult> {
  const { data, error } = await supabase.functions.invoke('agora-token', {
    body: {
      channelName: params.channelName,
      uid: params.uid ?? 0,
      role: params.role ?? 'publisher',
      expireTime: params.expireTime ?? 3600,
    },
  });

  if (error) {
    console.error('[Agora] agora-token error:', error);
    throw new Error(error.message ?? 'Erreur agora-token');
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload.token !== 'string') {
    console.error('[Agora] agora-token réponse invalide:', data);
    throw new Error('Réponse agora-token invalide (token manquant)');
  }

  return {
    token: payload.token,
    appId: typeof payload.appId === 'string' ? payload.appId : undefined,
    channelName: typeof payload.channelName === 'string' ? payload.channelName : undefined,
    uid: typeof payload.uid === 'number' ? payload.uid : undefined,
  };
}

export function getAgoraAppIdFromEnv(): string {
  const id = process.env.EXPO_PUBLIC_AGORA_APP_ID;
  if (!id || !id.trim()) {
    throw new Error(
      'EXPO_PUBLIC_AGORA_APP_ID manquant. Définissez-le dans .local.env (voir .local.env.example).'
    );
  }
  return id.trim();
}
