/**
 * Saisie tension type « 120/80 » : chiffres uniquement, « / » inséré par l’app.
 * Règle par défaut : slash après 2 chiffres (ex. 85/60 → 8560).
 * Exception : systolique 100–199 (premier chiffre 1) → slash après 3 chiffres (ex. 120/80).
 */

const MAX_SYSTOLIC_DIGITS = 3;
const MAX_DIASTOLIC_DIGITS = 3;

/** Extrait uniquement les chiffres (pour repartir d’une valeur affichée ou collée). */
export function digitsOnlyBloodPressure(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * À partir d’une chaîne de chiffres uniquement, produit l’affichage « NNN/NN ».
 */
export function formatBloodPressureDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, MAX_SYSTOLIC_DIGITS + MAX_DIASTOLIC_DIGITS);
  if (d.length === 0) return '';
  if (d.length === 1) return d;

  const n3 = d.length >= 3 ? parseInt(d.slice(0, 3), 10) : NaN;
  const useThreeDigitSystolic =
    d.length >= 3 && d[0] === '1' && !Number.isNaN(n3) && n3 >= 100 && n3 <= 199;

  if (useThreeDigitSystolic) {
    const sys = d.slice(0, 3);
    const dia = d.slice(3, 3 + MAX_DIASTOLIC_DIGITS);
    if (dia.length === 0) return `${sys}/`;
    return `${sys}/${dia}`;
  }

  const sys = d.slice(0, 2);
  const dia = d.slice(2, 2 + MAX_DIASTOLIC_DIGITS);
  if (d.length === 2) return `${sys}/`;
  if (dia.length === 0) return sys;
  return `${sys}/${dia}`;
}

/** Normalise la saisie utilisateur (efface, collage) vers le format affiché. */
export function normalizeBloodPressureInput(text: string): string {
  return formatBloodPressureDigits(digitsOnlyBloodPressure(text));
}
