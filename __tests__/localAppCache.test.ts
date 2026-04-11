/**
 * Checklist manuelle critique (non automatisée) :
 * - Connexion réseau lent : onglet Historique affiche le cache sans spinner bloquant.
 * - Déconnexion puis autre compte : pas de missions / historique de l’unité précédente.
 * - Mission terminée côté serveur : liste historique à jour (Realtime ou retour app).
 * - Mode avion : données cache toujours visibles ; retour réseau → sync silencieuse.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalAppCacheForSession } from '../src/lib/localAppCache';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('clearLocalAppCacheForSession', () => {
  beforeEach(() => AsyncStorage.clear());

  it('supprime profil, notifications, mission, missionHistory et cas hôpital', async () => {
    await AsyncStorage.multiSet([
      ['@eb_urgentiste/v1/userProfile/auth-1', '{}'],
      ['@eb_urgentiste/v1/notifications/auth-1', '{}'],
      ['@eb_urgentiste/v1/mission/unit-1', '{}'],
      ['@eb_urgentiste/v1/missionHistory/unit-1', '{}'],
      ['@eb_urgentiste/v1/hospitalCases/struct-1', '{}'],
    ]);

    await clearLocalAppCacheForSession({
      authUserId: 'auth-1',
      unitId: 'unit-1',
      structureId: 'struct-1',
    });

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual([]);
  });
});
