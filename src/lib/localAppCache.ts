import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mission } from '../hooks/useActiveMission';
import type { EmergencyCase } from '../screens/hospital/HospitalDashboardTab';
import type { UserProfile } from '../types/userProfile';

const PREFIX = '@eb_urgentiste/v1';

/**
 * Clés AsyncStorage (préfixe PREFIX) :
 * - mission/{unitId} — mission active
 * - missionHistory/{unitId} — historique missions terminées (schemaVersion 1)
 * - hospitalCases/{structureId}
 * - userProfile/{authUserId}
 * - notifications/{userId}
 * Purge : clearLocalAppCacheForSession (déconnexion).
 */

export type CachedMissionPayload = {
  cachedAt: string;
  mission: Mission | null;
};

export type CachedMissionHistoryPayload = {
  schemaVersion: 1;
  cachedAt: string;
  missions: Mission[];
};

export type CachedHospitalCasesPayload = {
  cachedAt: string;
  cases: EmergencyCase[];
};

export type CachedUserProfilePayload = {
  cachedAt: string;
  profile: UserProfile;
};

export type CachedNotificationsPayload = {
  cachedAt: string;
  notifications: import('../hooks/useNotifications').Notification[];
};

function missionKey(unitId: string): string {
  return `${PREFIX}/mission/${unitId}`;
}

function missionHistoryKey(unitId: string): string {
  return `${PREFIX}/missionHistory/${unitId}`;
}

function hospitalCasesKey(structureId: string): string {
  return `${PREFIX}/hospitalCases/${structureId}`;
}

function userProfileKey(authUserId: string): string {
  return `${PREFIX}/userProfile/${authUserId}`;
}

function notificationsKey(userId: string): string {
  return `${PREFIX}/notifications/${userId}`;
}

export async function readMissionCache(unitId: string): Promise<Mission | null> {
  try {
    const raw = await AsyncStorage.getItem(missionKey(unitId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMissionPayload;
    return parsed.mission ?? null;
  } catch {
    return null;
  }
}

export async function writeMissionCache(unitId: string, mission: Mission | null): Promise<void> {
  const payload: CachedMissionPayload = {
    cachedAt: new Date().toISOString(),
    mission,
  };
  await AsyncStorage.setItem(missionKey(unitId), JSON.stringify(payload));
}

export async function readMissionHistoryCache(unitId: string): Promise<Mission[] | null> {
  try {
    const raw = await AsyncStorage.getItem(missionHistoryKey(unitId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMissionHistoryPayload;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.missions)) return null;
    return parsed.missions;
  } catch {
    return null;
  }
}

export async function writeMissionHistoryCache(unitId: string, missions: Mission[]): Promise<void> {
  const payload: CachedMissionHistoryPayload = {
    schemaVersion: 1,
    cachedAt: new Date().toISOString(),
    missions,
  };
  await AsyncStorage.setItem(missionHistoryKey(unitId), JSON.stringify(payload));
}

export async function readHospitalCasesCache(structureId: string): Promise<EmergencyCase[] | null> {
  try {
    const raw = await AsyncStorage.getItem(hospitalCasesKey(structureId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHospitalCasesPayload;
    return Array.isArray(parsed.cases) ? parsed.cases : null;
  } catch {
    return null;
  }
}

export async function writeHospitalCasesCache(structureId: string, cases: EmergencyCase[]): Promise<void> {
  const payload: CachedHospitalCasesPayload = {
    cachedAt: new Date().toISOString(),
    cases,
  };
  await AsyncStorage.setItem(hospitalCasesKey(structureId), JSON.stringify(payload));
}

export async function readUserProfileCache(authUserId: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(userProfileKey(authUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUserProfilePayload;
    return parsed.profile ?? null;
  } catch {
    return null;
  }
}

export async function writeUserProfileCache(authUserId: string, profile: UserProfile): Promise<void> {
  const payload: CachedUserProfilePayload = {
    cachedAt: new Date().toISOString(),
    profile,
  };
  await AsyncStorage.setItem(userProfileKey(authUserId), JSON.stringify(payload));
}

export async function readNotificationsCache(userId: string): Promise<{
  notifications: import('../hooks/useNotifications').Notification[];
  unreadCount: number;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(notificationsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedNotificationsPayload & { unreadCount?: number };
    const list = Array.isArray(parsed.notifications) ? parsed.notifications : [];
    const unread =
      typeof parsed.unreadCount === 'number'
        ? parsed.unreadCount
        : list.filter((n) => !n.is_read).length;
    return { notifications: list, unreadCount: unread };
  } catch {
    return null;
  }
}

export async function writeNotificationsCache(
  userId: string,
  notifications: import('../hooks/useNotifications').Notification[],
): Promise<void> {
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const payload = {
    cachedAt: new Date().toISOString(),
    notifications,
    unreadCount,
  };
  await AsyncStorage.setItem(notificationsKey(userId), JSON.stringify(payload));
}

/** À appeler à la déconnexion : évite de mélanger les données entre comptes. */
export async function clearLocalAppCacheForSession(opts: {
  authUserId: string;
  unitId?: string | null;
  structureId?: string | null;
}): Promise<void> {
  const keys: string[] = [userProfileKey(opts.authUserId), notificationsKey(opts.authUserId)];
  if (opts.unitId) {
    keys.push(missionKey(opts.unitId));
    keys.push(missionHistoryKey(opts.unitId));
  }
  if (opts.structureId) keys.push(hospitalCasesKey(opts.structureId));
  await AsyncStorage.multiRemove(keys);
}
