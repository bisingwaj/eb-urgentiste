import { haversineMeters } from './mapbox';

/** Expo / iOS : heading souvent `-1` si inconnu. */
export function isHeadingValid(h: number | null | undefined): boolean {
  if (h == null || Number.isNaN(Number(h))) return false;
  if (h < 0) return false;
  return true;
}

function normalizeDeg360(d: number): number {
  return ((d % 360) + 360) % 360;
}

/**
 * Cap géographique (0° = nord, sens horaire) entre deux points WGS84.
 */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return normalizeDeg360((θ * 180) / Math.PI);
}

const MIN_SPEED_MPS = 1.2;
const MIN_MOVE_M = 4;

export type ResolveHeadingInput = {
  lat: number;
  lng: number;
  headingFromGps?: number | null;
  /** m/s (expo-location `coords.speed`) */
  speedMps?: number | null;
  prevLat?: number | null;
  prevLng?: number | null;
  /** Dernier cap affiché (évite saut à 0°). */
  lastResolvedDeg?: number | null;
};

/**
 * Priorité : heading GPS valide ; sinon cap entre deux positions si vitesse + déplacement suffisants ;
 * sinon dernier cap connu ; sinon 0.
 */
export function resolveHeadingDeg(input: ResolveHeadingInput): number {
  if (isHeadingValid(input.headingFromGps)) {
    return normalizeDeg360(Number(input.headingFromGps));
  }

  const speed = input.speedMps ?? 0;
  const pl = input.prevLat;
  const pg = input.prevLng;
  if (
    speed >= MIN_SPEED_MPS &&
    pl != null &&
    pg != null &&
    Number.isFinite(pl) &&
    Number.isFinite(pg)
  ) {
    const d = haversineMeters([pg, pl], [input.lng, input.lat]);
    if (d >= MIN_MOVE_M) {
      return bearingDeg(pl, pg, input.lat, input.lng);
    }
  }

  if (input.lastResolvedDeg != null && Number.isFinite(input.lastResolvedDeg)) {
    return normalizeDeg360(input.lastResolvedDeg);
  }

  return 0;
}
