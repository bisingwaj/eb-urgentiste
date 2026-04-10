/** Fusion partielle de `hospital_data` (ex. vitaux seuls) sans écraser les clés imbriquées de `vitals`. */
export function mergeHospitalDataPartial(
  existing: Record<string, unknown> | null | undefined,
  partial: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(existing || {}) };
  for (const key of Object.keys(partial)) {
    const pv = partial[key];
    if (key === 'vitals' && pv != null && typeof pv === 'object' && !Array.isArray(pv)) {
      const prev = base.vitals;
      base.vitals = {
        ...(prev != null && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}),
        ...(pv as Record<string, unknown>),
      };
    } else {
      base[key] = pv;
    }
  }
  return base;
}
