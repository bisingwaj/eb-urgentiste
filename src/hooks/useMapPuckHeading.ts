import { useMemo } from 'react';
import type * as Location from 'expo-location';
import { useDeviceCompassHeadingDeg } from './useDeviceCompassHeading';
import { useResolveHeadingFromLocation } from './useResolveHeadingFromLocation';

/**
 * Flèche « ma position » : **boussole (magnétomètre)** = suit la rotation du téléphone ;
 * repli sur cap GPS / trajet si capteur indisponible (simulateur, etc.).
 */
export function useMapPuckHeading(loc: Location.LocationObject | null): number {
  const compassDeg = useDeviceCompassHeadingDeg();
  const gpsFallbackDeg = useResolveHeadingFromLocation(loc);
  return useMemo(
    () => (compassDeg != null ? compassDeg : gpsFallbackDeg),
    [compassDeg, gpsFallbackDeg],
  );
}
