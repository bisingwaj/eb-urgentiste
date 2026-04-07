import type { Mission } from "../hooks/useActiveMission";

/**
 * Adresse lisible : rue si présente, sinon commune · ville · province, puis géocodage / fallback.
 */
export function formatMissionAddress(
  location: Mission["location"] | null | undefined,
  resolvedFallback?: string | null
): string {
  if (!location) {
    return resolvedFallback?.trim() || "Adresse inconnue";
  }
  const direct = location.address?.trim();
  if (direct) return direct;

  const parts = [location.commune, location.ville, location.province]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean);

  const uniq: string[] = [];
  for (const p of parts) {
    if (!uniq.includes(p)) uniq.push(p);
  }
  if (uniq.length) return uniq.join(" · ");

  if (resolvedFallback?.trim()) return resolvedFallback.trim();
  return "Recherche de l'adresse...";
}
