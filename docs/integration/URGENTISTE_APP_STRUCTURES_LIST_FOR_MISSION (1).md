# 📋 Liste des structures de santé pour mission — App Urgentiste

> **Doc d'intégration React Native — équipe mobile**
> **Principe clé : l'app NE CALCULE RIEN. Elle LIT et AFFICHE la liste préparée par le backend, calculée au moment où l'urgentiste arrive sur zone.**

---

## 1. Contexte & moment du calcul

Le Top 5 des structures de santé est **calculé côté serveur**, **automatiquement**, au moment précis où le statut du dispatch passe à **`on_scene`** (l'urgentiste est arrivé sur la zone d'intervention).

**Position de référence utilisée** : la position GPS **actuelle de l'urgentiste** (et non celle de l'incident).
Ordre de priorité du fallback :
1. Dernière position connue dans `rescuer_locations` (ping GPS le plus récent).
2. Position de l'unité assignée (`units.location_lat/lng`).
3. Position de l'incident (dernier recours).

Le résultat est **figé** dans `dispatches.suggested_hospitals` (snapshot JSON).
Le timestamp du calcul et la position d'origine sont également stockés (`suggested_hospitals_computed_at`, `suggested_hospitals_origin_lat/lng`).

L'app Urgentiste se contente de :
1. **Lire** cette liste depuis `dispatches.suggested_hospitals`.
2. **L'afficher** telle quelle.
3. **Écouter** les mises à jour Realtime.

➡️ **Aucun scoring, aucun Haversine, aucun filtrage côté mobile.**

---

## 2. Source de données — `dispatches.suggested_hospitals`

Colonne `jsonb` (default `[]`) sur la table `dispatches`.

### Format du JSON (tableau ordonné, rang 1 = recommandée)

```json
[
  {
    "rank": 1,
    "id": "uuid-structure",
    "name": "Hôpital Général de Référence",
    "type": "hopital",
    "lat": -4.3215,
    "lng": 15.3122,
    "address": "Av. Tombalbaye, Gombe",
    "phone": "+243...",
    "capacity": 250,
    "availableBeds": 18,
    "specialties": ["traumato", "cardio"],
    "distanceKm": 3.4,
    "etaMin": 17,
    "score": 0.82,
    "isSelected": false
  },
  { "rank": 2, "...": "..." }
]
```

### Champs annexes sur `dispatches`

| Colonne | Type | Sens |
|---|---|---|
| `suggested_hospitals` | jsonb | Tableau Top 5 |
| `suggested_hospitals_origin_lat` | double precision | Latitude de l'urgentiste au moment du calcul |
| `suggested_hospitals_origin_lng` | double precision | Longitude de l'urgentiste au moment du calcul |
| `suggested_hospitals_computed_at` | timestamptz | Quand le snapshot a été figé |

| Champ JSON | Type | Sens |
|---|---|---|
| `rank` | int (1-5) | Position dans le Top 5 |
| `id` | uuid | ID de la structure |
| `name` | string | Nom affiché |
| `type` | string | `hopital` / `centre_sante` / `maternite` |
| `lat`, `lng` | number | Coordonnées GPS de la structure |
| `address` | string\|null | Adresse |
| `phone` | string\|null | Téléphone à composer |
| `capacity` | int\|null | Lits totaux |
| `availableBeds` | int\|null | Lits disponibles |
| `specialties` | string[] | Spécialités déclarées |
| `distanceKm` | number | Distance depuis la position de l'urgentiste |
| `etaMin` | int | ETA estimé |
| `score` | number | Score 0-1 |
| `isSelected` | bool | `true` si l'opérateur a confirmé |

> ⚠️ **Ne recalculez ni distance ni ETA sur mobile.**

---

## 3. Algorithme côté serveur (Edge Function `compute-mission-hospitals`)

```
distScore     = max(0, 1 - distanceKm / 30)        // 40%
capacityScore = beds > 0 ? min(1, beds/10) : 0     // 30%
typeScore     = hopital:1.0 / centre_sante:0.8 /
                maternite:0.6                       // 30%
score = distScore*0.4 + capacityScore*0.3 + typeScore*0.3
ETA   = round(distanceKm * 4 + 3) min
```

Filtres : `type ∈ {hopital, centre_sante, maternite}`, `is_open = true`, `available_beds IS NULL OR > 0`, et match `urgency_category` ∈ `specialties` si défini.

---

## 4. Quand le calcul se déclenche

| Événement | Action |
|---|---|
| `dispatches.status` passe à `on_scene` | Trigger DB → Edge Function → écriture `suggested_hospitals` |
| Création du dispatch | `suggested_hospitals = []` (vide tant que pas `on_scene`) |
| Re-déclenchement manuel | POST `/functions/v1/compute-mission-hospitals` avec `{ dispatch_id }` |

Tant que `suggested_hospitals.length === 0`, afficher :
> « Les structures recommandées seront proposées dès votre arrivée sur zone. »

---

## 5. Récupération de la mission

```ts
const { data } = await supabase
  .from('dispatches')
  .select(`
    id, incident_id, status, hospital_status,
    assigned_structure_id, assigned_structure_name,
    suggested_hospitals,
    suggested_hospitals_origin_lat,
    suggested_hospitals_origin_lng,
    suggested_hospitals_computed_at,
    incidents ( id, urgency_category, priority, location_lat, location_lng, description )
  `)
  .eq('rescuer_id', user.id)
  .in('status', ['dispatched', 'en_route', 'on_scene', 'en_route_hospital'])
  .order('created_at', { ascending: false });
```

---

## 6. Hook React Native conseillé

```ts
// hooks/useMissionHospitals.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type HospitalSuggestion = {
  rank: number; id: string; name: string; type: string;
  lat: number; lng: number;
  address: string | null; phone: string | null;
  capacity: number | null; availableBeds: number | null;
  specialties: string[];
  distanceKm: number; etaMin: number; score: number;
  isSelected: boolean;
};

export function useMissionHospitals(dispatchId: string) {
  const [hospitals, setHospitals] = useState<HospitalSuggestion[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dispatches')
        .select('suggested_hospitals, suggested_hospitals_computed_at')
        .eq('id', dispatchId)
        .single();
      if (!cancelled) {
        setHospitals((data?.suggested_hospitals as HospitalSuggestion[]) || []);
        setComputedAt(data?.suggested_hospitals_computed_at ?? null);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`dispatch:${dispatchId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatches', filter: `id=eq.${dispatchId}` },
        (payload) => {
          setHospitals(((payload.new as any).suggested_hospitals as HospitalSuggestion[]) || []);
          setComputedAt((payload.new as any).suggested_hospitals_computed_at ?? null);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [dispatchId]);

  return { hospitals, computedAt, loading };
}
```

---

## 7. UI recommandée

État d'attente : « 🕒 Les structures recommandées s'afficheront dès votre arrivée sur zone. »

État chargé (1 carte par structure, ordre `rank` 1 → 5) :
- Badge `rank` + `isSelected` ⇒ « Choisie par la centrale »
- Nom + type
- Distance (`distanceKm` km) + ETA (`etaMin` min)
- Lits dispo : badge couleur (`> 5` vert · `1–5` orange · `0` rouge)
- Spécialités (chip surlignée si match `urgency_category`)
- Bouton « Appeler » (compose `phone`)
- Bouton « Itinéraire » (deeplink maps)

Header : « Top 5 structures depuis votre position · calculé à HH:MM ».

---

## 8. Cas limites

| Cas | Comportement |
|---|---|
| `suggested_hospitals = []` | Afficher l'état d'attente |
| Recalcul demandé | POST Edge Function → mise à jour Realtime |
| Aucune position GPS | Edge Function 422, garder l'état d'attente |
| `assigned_structure_id` ∉ tableau | Afficher la structure assignée seule en tête + tableau en dessous |
| Hors-ligne | Cacher la dernière liste connue |

---

## 9. Checklist mobile

- [ ] Ajouter `suggested_hospitals` + `suggested_hospitals_computed_at` au `select()`.
- [ ] Créer `useMissionHospitals(dispatchId)`.
- [ ] Écran « Structures de la mission » (état d'attente + liste).
- [ ] Realtime sur `dispatches` filtré par `id`.
- [ ] Deeplinks « Appeler » + « Itinéraire ».
- [ ] Optionnel : bouton « Recalculer » → POST `/functions/v1/compute-mission-hospitals`.
- [ ] Zéro Haversine côté mobile (revue de code).

---

## 10. Documents liés

- `URGENTISTE_APP_HOSPITAL_SELECTION.md` — réponse hôpital
- `supabase/functions/compute-mission-hospitals/index.ts` — calcul serveur
- `src/hooks/useDispatchRecommendation.ts` — algo de référence (dashboard)

---

**Résumé** : à l'arrivée sur zone (`on_scene`), le serveur calcule le Top 5 depuis la position GPS de l'urgentiste et l'écrit dans `dispatches.suggested_hospitals` ; l'app mobile lit, affiche, écoute le Realtime.
