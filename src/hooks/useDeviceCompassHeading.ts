import { useEffect, useRef, useState } from 'react';
import { Magnetometer } from 'expo-sensors';

/** µT — en dessous, mesure trop bruitée pour un cap fiable. */
const MIN_FIELD_STRENGTH = 8;

/**
 * Cap magnétique (0–360°, nord = 0, sens horaire) à partir du champ magnétique,
 * téléphone en **portrait**, écran face à l’utilisateur — la flèche suit la rotation du téléphone.
 *
 * Formule usuelle : atan2(-x, y) pour l’axe vertical (boussole dans le plan horizontal).
 */
function magnetometerToHeadingDeg(x: number, y: number, z: number): number | null {
  const strength = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(strength) || strength < MIN_FIELD_STRENGTH) return null;

  let deg = Math.atan2(-x, y) * (180 / Math.PI);
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

/**
 * Orientation du téléphone pour la pastille « ma position » (boussole / magnétomètre).
 * Mettre à jour souvent pour que la flèche suive la rotation de l’appareil.
 */
export function useDeviceCompassHeadingDeg(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const available = await Magnetometer.isAvailableAsync();
        if (!available || cancelled) return;

        const perm = await Magnetometer.getPermissionsAsync();
        if (perm.status !== 'granted') {
          const req = await Magnetometer.requestPermissionsAsync();
          if (req.status !== 'granted' || cancelled) return;
        }

        Magnetometer.setUpdateInterval(50);
        const sub = Magnetometer.addListener((m) => {
          const h = magnetometerToHeadingDeg(m.x, m.y, m.z);
          if (h != null && !cancelled) setHeading(h);
        });
        subRef.current = sub;
      } catch {
        /* simulateur / appareil sans capteur */
      }
    })();

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, []);

  return heading;
}
