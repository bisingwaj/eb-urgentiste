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

/**
 * Transforme une clé snake_case de type d'incident (ex. `urgence_medicale`)
 * en libellé lisible (ex. `Urgence médicale`).
 */
export function formatIncidentType(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Urgence médicale";
  return raw.trim().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
