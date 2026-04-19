import type { UserProfile } from '../types/userProfile';
import { fetchMissionHistoryForUnit } from './missionHistoryRemote';
import { writeMissionHistoryCache } from './localAppCache';

/**
 * Préchargement non bloquant après profil disponible (urgentiste avec unité).
 * Alimente le cache historique avant ouverture de l’onglet Historique.
 */
export async function runSessionBootstrap(profile: UserProfile): Promise<void> {
  if (profile.role === 'hopital') return;
  const unitId = profile.assigned_unit_id;
  if (!unitId) return;

  try {
    const { missions, error } = await fetchMissionHistoryForUnit(unitId);
    if (error) {
      if (__DEV__) console.warn('[sessionBootstrap] mission history:', error);
      return;
    }
    await writeMissionHistoryCache(unitId, missions);
  } catch (e) {
    if (__DEV__) console.warn('[sessionBootstrap]', e);
  }
}
