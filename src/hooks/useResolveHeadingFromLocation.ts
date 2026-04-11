import { useEffect, useRef, useState } from 'react';
import type * as Location from 'expo-location';
import { resolveHeadingDeg } from '../lib/mapHeading';

/**
 * Cap stable pour la pastille « ma position » (GPS + repli bearing + dernier cap).
 */
export function useResolveHeadingFromLocation(loc: Location.LocationObject | null): number {
  const [heading, setHeading] = useState(0);
  const prevRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastResolvedRef = useRef(0);

  useEffect(() => {
    if (!loc) return;
    const { latitude, longitude, heading: h, speed } = loc.coords;
    const next = resolveHeadingDeg({
      lat: latitude,
      lng: longitude,
      headingFromGps: h ?? undefined,
      speedMps: speed ?? undefined,
      prevLat: prevRef.current?.lat,
      prevLng: prevRef.current?.lng,
      lastResolvedDeg: lastResolvedRef.current,
    });
    lastResolvedRef.current = next;
    prevRef.current = { lat: latitude, lng: longitude };
    setHeading(next);
  }, [loc?.coords.latitude, loc?.coords.longitude, loc?.coords.heading, loc?.coords.speed]);

  return heading;
}

export type RemotePosition = {
  lat: number | null;
  lng: number | null;
  /** Depuis `active_rescuers.heading` ou équivalent (degrés). */
  headingFromServer?: number | null;
  /** m/s */
  speedMps?: number | null;
};

/**
 * Même logique pour un suivi distant (ex. hôpital qui lit l’ambulance).
 */
export function useResolveHeadingFromRemotePosition(pos: RemotePosition): number {
  const [heading, setHeading] = useState(0);
  const prevRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastResolvedRef = useRef(0);

  useEffect(() => {
    if (pos.lat == null || pos.lng == null || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) {
      return;
    }
    const next = resolveHeadingDeg({
      lat: pos.lat,
      lng: pos.lng,
      headingFromGps: pos.headingFromServer,
      speedMps: pos.speedMps,
      prevLat: prevRef.current?.lat,
      prevLng: prevRef.current?.lng,
      lastResolvedDeg: lastResolvedRef.current,
    });
    lastResolvedRef.current = next;
    prevRef.current = { lat: pos.lat, lng: pos.lng };
    setHeading(next);
  }, [pos.lat, pos.lng, pos.headingFromServer, pos.speedMps]);

  return heading;
}
