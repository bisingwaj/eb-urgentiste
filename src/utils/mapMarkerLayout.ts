/**
 * Décale visuellement les marqueurs dont les coordonnées tombent dans la même
 * cellule (grille), pour limiter le chevauchement sur la carte.
 * Les coordonnées d'origine des données ne sont pas modifiées : seules les
 * coordonnées d'affichage `displayCoord` sont renvoyées.
 */

export type MarkerDisplay<T> = {
  item: T;
  /** [longitude, latitude] pour Mapbox */
  displayCoord: [number, number];
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function stableId<T>(item: T, index: number): string {
  const any = item as { id?: unknown };
  if (any?.id != null && any.id !== "") return String(any.id);
  return `i:${index}`;
}

export function spreadOverlappingMarkers<T>(
  items: T[],
  getLngLat: (t: T) => [number, number] | null,
  options?: {
    /** Taille de cellule pour regrouper les points proches (degrés). ~1e-5 ≈ 1,1 m. */
    gridDeg?: number;
    /** Pas de rayon en spirale (degrés). */
    radiusStepDeg?: number;
  },
): MarkerDisplay<T>[] {
  const gridDeg = options?.gridDeg ?? 1e-5;
  const radiusStepDeg = options?.radiusStepDeg ?? 1.2e-5;

  type Row = { item: T; lng: number; lat: number; key: string; sortKey: string };
  const rows: Row[] = [];
  items.forEach((item, index) => {
    const c = getLngLat(item);
    if (!c) return;
    const [lng, lat] = c;
    const key = `${Math.round(lat / gridDeg)}_${Math.round(lng / gridDeg)}`;
    rows.push({ item, lng, lat, key, sortKey: stableId(item, index) });
  });

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const g = groups.get(row.key) ?? [];
    g.push(row);
    groups.set(row.key, g);
  }

  const result: MarkerDisplay<T>[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const { item, lng, lat } = group[0];
      result.push({ item, displayCoord: [lng, lat] });
      continue;
    }
    const sorted = [...group].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    sorted.forEach((row, i) => {
      const angle = i * GOLDEN_ANGLE;
      const r = radiusStepDeg * (0.5 + i);
      const latRad = (row.lat * Math.PI) / 180;
      const cosLat = Math.max(Math.cos(latRad), 0.15);
      const dLat = r * Math.sin(angle);
      const dLng = (r * Math.cos(angle)) / cosLat;
      result.push({
        item: row.item,
        displayCoord: [row.lng + dLng, row.lat + dLat],
      });
    });
  }
  return result;
}
