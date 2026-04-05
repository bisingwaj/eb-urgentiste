function getMapboxToken(): string {
  const t = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!t) {
    throw new Error('EXPO_PUBLIC_MAPBOX_TOKEN manquant (.local.env ou secrets EAS).');
  }
  return t;
}

/** Au-delà de ce seuil (m), on appelle Directions ; en dessous, tracé ligne droite uniquement. */
export const SHORT_ROUTE_THRESHOLD_M = 100;

export type DirectionsProfile = 'driving' | 'driving-traffic';

export type RouteCriterion = 'fastest' | 'shortest';

export interface DirectionsOptions {
  /** Profil Mapbox Directions (trafic si supporté par le compte). */
  profile?: DirectionsProfile;
  /** Demander des itinéraires alternatifs (défaut : true pour getRouteWithAlternatives). */
  alternatives?: boolean;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  /** Point de départ de l’étape (lng, lat) pour le guidage par distance. */
  coordinate?: [number, number];
}

export interface RouteResult {
  geometry: GeoJSON.LineString;
  duration: number;
  distance: number;
  steps: RouteStep[];
  /** Tracé simplifié sans appel API (très courte distance). */
  isStraightLine?: boolean;
}

export interface RoutesResult {
  primary: RouteResult;
  alternatives: RouteResult[];
  /** Toutes les routes dans l’ordre renvoyé par l’API (routes[0] = recommandation Mapbox). */
  routes: RouteResult[];
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function pickBestRoute(routes: RouteResult[], criterion: RouteCriterion): number {
  if (routes.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < routes.length; i++) {
    if (criterion === 'shortest') {
      if (routes[i].distance < routes[best].distance) best = i;
    } else {
      if (routes[i].duration < routes[best].duration) best = i;
    }
  }
  return best;
}

function parseStepsFromRoute(raw: any): RouteStep[] {
  const out: RouteStep[] = [];
  for (const leg of raw.legs || []) {
    for (const step of leg.steps || []) {
      const m = step.maneuver || {};
      let instruction =
        typeof m.instruction === 'string' && m.instruction.trim()
          ? m.instruction.trim()
          : '';
      if (!instruction && step.name) {
        instruction = `Continuer sur ${step.name}`;
      }
      if (!instruction) {
        instruction =
          m.type === 'arrive' ? 'Vous êtes arrivé' : m.type === 'depart' ? 'Départ' : 'Continuer tout droit';
      }
      const loc = m.location as [number, number] | undefined;
      const firstCoord = step.geometry?.coordinates?.[0] as [number, number] | undefined;
      out.push({
        instruction,
        distance: step.distance ?? 0,
        duration: step.duration ?? 0,
        coordinate: firstCoord || loc,
      });
    }
  }
  return out;
}

function mapRawRoute(raw: any): RouteResult {
  return {
    geometry: raw.geometry as GeoJSON.LineString,
    duration: raw.duration,
    distance: raw.distance,
    steps: parseStepsFromRoute(raw),
  };
}

function straightLineRoute(origin: [number, number], dest: [number, number], distM: number): RouteResult {
  return {
    geometry: {
      type: 'LineString',
      coordinates: [origin, dest],
    },
    duration: 0,
    distance: distM,
    steps: [
      {
        instruction: 'Destination à proximité — suivez la ligne à l’écran.',
        distance: distM,
        duration: 0,
        coordinate: origin,
      },
    ],
    isStraightLine: true,
  };
}

function buildDirectionsUrl(
  origin: [number, number],
  destination: [number, number],
  profile: DirectionsProfile,
  alternatives: boolean,
): string {
  const path = `mapbox/${profile}`;
  const alt = alternatives ? '&alternatives=true' : '';
  return (
    `https://api.mapbox.com/directions/v5/${path}/` +
    `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` +
    `?geometries=geojson&overview=full&continue_straight=true&language=fr${alt}` +
    `&access_token=${getMapboxToken()}`
  );
}

async function fetchDirections(
  origin: [number, number],
  destination: [number, number],
  profile: DirectionsProfile,
  alternatives: boolean,
): Promise<any | null> {
  const url = buildDirectionsUrl(origin, destination, profile, alternatives);
  const res = await fetch(url);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) return null;
  return data;
}

/**
 * Itinéraires avec étapes (TTS). Essaie `driving-traffic`, puis `driving` en repli.
 */
export async function getRouteWithAlternatives(
  origin: [number, number],
  destination: [number, number],
  options?: DirectionsOptions,
): Promise<RoutesResult | null> {
  const alternatives = options?.alternatives !== false;
  const preferredProfile = options?.profile ?? 'driving-traffic';

  const dist = haversineMeters(origin, destination);
  if (dist < SHORT_ROUTE_THRESHOLD_M) {
    const line = straightLineRoute(origin, destination, dist);
    return {
      primary: line,
      alternatives: [],
      routes: [line],
    };
  }

  let data = await fetchDirections(origin, destination, preferredProfile, alternatives);
  if (!data && preferredProfile === 'driving-traffic') {
    data = await fetchDirections(origin, destination, 'driving', alternatives);
  }
  if (!data) return null;

  const routes: RouteResult[] = data.routes.map(mapRawRoute);

  return {
    primary: routes[0],
    alternatives: routes.slice(1),
    routes,
  };
}

export async function getRoute(
  origin: [number, number],
  destination: [number, number],
  options?: DirectionsOptions,
): Promise<RouteResult | null> {
  const dist = haversineMeters(origin, destination);
  if (dist < SHORT_ROUTE_THRESHOLD_M) {
    return straightLineRoute(origin, destination, dist);
  }

  const preferredProfile = options?.profile ?? 'driving-traffic';
  let data = await fetchDirections(origin, destination, preferredProfile, false);
  if (!data && preferredProfile === 'driving-traffic') {
    data = await fetchDirections(origin, destination, 'driving', false);
  }
  if (!data) return null;
  return mapRawRoute(data.routes[0]);
}

export function buildRouteFeature(geometry: GeoJSON.LineString): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry,
      },
    ],
  };
}

/** Bornes caméra Mapbox à partir d’une LineString (padding homogène). */
export function geometryToCameraBounds(
  geometry: GeoJSON.LineString,
  padding: number,
): {
  ne: [number, number];
  sw: [number, number];
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
} {
  const coords = geometry.coordinates;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const c of coords) {
    minLng = Math.min(minLng, c[0]);
    maxLng = Math.max(maxLng, c[0]);
    minLat = Math.min(minLat, c[1]);
    maxLat = Math.max(maxLat, c[1]);
  }
  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
    paddingTop: padding,
    paddingBottom: padding,
    paddingLeft: padding,
    paddingRight: padding,
  };
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationSeconds(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} h ${mm} min` : `${h} h`;
}
