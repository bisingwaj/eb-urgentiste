import { Linking, Platform } from 'react-native';

/**
 * Ouvre l’app cartes (Google Maps / Apple Plans) vers une destination.
 */
export function openExternalDirections(
  latitude: number,
  longitude: number,
  _label?: string,
): void {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  const apple = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;

  const url = Platform.select({
    ios: apple,
    android: google,
    default: google,
  });

  Linking.openURL(url).catch((e) => console.warn('[navigation] openURL', e));
}

/** Waze (si installé, sinon navigateur peut proposer le store) */
export function openWazeDirections(latitude: number, longitude: number): void {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  Linking.openURL(waze).catch(() => openExternalDirections(lat, lng));
}
