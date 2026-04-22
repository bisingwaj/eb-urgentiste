# 🚑 Liste des structures de santé pour mission — Intégration Urgentiste

> **Audience** : Équipe **React Native** — Application Urgentiste
> **Backend** : Lovable Cloud (Supabase) — projet `npucuhlvoalcbwdfedae`
> **Date** : Avril 2026
> **Statut** : ✅ Backend prêt — à intégrer côté mobile
> **Compagnon de** : `URGENTISTE_APP_HOSPITAL_SELECTION.md` (vue générique) — ce document décrit la version **alignée mission** utilisée par l'opérateur du dashboard.

---

## 1. Contexte fonctionnel

Lorsqu'un opérateur du **dashboard Centrale** assigne un signalement / incident, il voit dans le module **Dispatch** une liste de structures sanitaires triée automatiquement par un moteur de scoring (proximité + capacité + type). Il peut soit :
- assigner lui-même la structure (l'urgentiste la voit alors pré-sélectionnée),
- soit laisser le choix à l'urgentiste sur le terrain.

**Objectif de cette intégration** : afficher dans l'**application Urgentiste**, pour la mission active, **exactement la même liste classée** que celle de l'opérateur — afin d'éviter toute incohérence entre la décision en centrale et la décision terrain.

> 🔁 Le scoring DOIT rester strictement aligné sur le hook `useDispatchRecommendation.ts` du dashboard (voir §4). Toute évolution de l'algorithme côté dashboard doit être répercutée ici.

---

## 2. Sources de données

### 2.1 Mission de l'urgentiste — table `dispatches`

L'urgentiste connecté ne voit que **ses** missions actives :

```sql
SELECT
  id, incident_id, unit_id, rescuer_id, status,
  assigned_structure_id, assigned_structure_name,
  assigned_structure_lat, assigned_structure_lng,
  assigned_structure_phone, assigned_structure_address,
  assigned_structure_type,
  hospital_status, hospital_notes, hospital_responded_at,
  dispatched_at, arrived_at, completed_at
FROM dispatches
WHERE rescuer_id = auth.uid()
  AND status IN ('dispatched','en_route','on_scene','en_route_hospital','arrived_hospital');
```

### 2.2 Contexte incident — table `incidents`

```sql
SELECT id, reference, type, priority, urgency_category,
       location_lat, location_lng, location_address,
       commune, description, caller_name, caller_phone
FROM incidents
WHERE id = :incident_id;
```

Le champ `urgency_category` (ou à défaut `type`) est utilisé pour matcher la spécialité de la structure.

### 2.3 Structures sanitaires — table `health_structures`

| Champ | Type | Description |
|---|---|---|
| `id` | `uuid` | Identifiant |
| `name` / `official_name` | `text` | Nom court / officiel |
| `type` | `text` | `hopital`, `centre_sante`, `maternite`, `pharmacie`, … |
| `address`, `commune` | `text` | Adresse postale |
| `lat`, `lng` | `double precision` | Coordonnées WGS84 |
| `phone` | `text` | Contact |
| `is_open` | `boolean` | Ouvert maintenant (mis à jour par l'app Hôpital) |
| `available_beds` | `integer` | Lits disponibles |
| `capacity` | `integer` | Capacité totale |
| `specialties` | `text[]` | `cardiaque`, `traumatisme`, `brulure`, `obstetrique`, `pediatrie`, `intoxication`, `psychiatrie`, `accident_route`, `agression`, `incendie`, `general` |
| `equipment` | `text[]` | Équipements (scanner, bloc op, réa…) |
| `linked_user_id` | `uuid` | Compte hôpital lié |

### 2.4 Filtres obligatoires

1. `type IN ('hopital','centre_sante','maternite')` — exclure pharmacie, police, pompier.
2. `is_open = true`.
3. `available_beds IS NULL OR available_beds > 0` (NULL = info non gérée → garder).
4. `lat IS NOT NULL AND lng IS NOT NULL`.
5. *(Optionnel)* Match spécialité si `urgency_category` fourni : `urgency_category = ANY(specialties) OR 'general' = ANY(specialties)`.

---

## 3. Point de référence GPS

Par ordre de priorité :
1. **`incidents.location_lat / location_lng`** — adresse de prise en charge (cas nominal).
2. **Position GPS courante de l'urgentiste** (fallback).
3. Si les deux sont nulles → bloquer avec message « Position requise ».

---

## 4. Algorithme de scoring — aligné dashboard

> ⚠️ Reproduction **fidèle** du hook `src/hooks/useDispatchRecommendation.ts` (dashboard). Ne pas dévier.

### 4.1 Distance — Haversine

```ts
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### 4.2 ETA

```ts
const etaMin = Math.round(distanceKm * 4 + 3); // 4 min/km + 3 min de prise en charge
```

### 4.3 Score (identique dashboard)

```ts
// Distance score (40%)
const distScore = Math.max(0, 1 - distanceKm / 30);

// Capacity score (30%)
const beds = s.available_beds ?? 0;
const capacity = s.capacity || 1;
const occupancyRate = 1 - beds / capacity;
const capacityScore = beds > 0 ? Math.min(1, beds / 10) : 0;

// Type match (30%)
const typeScore =
  s.type === 'hopital'      ? 1.0 :
  s.type === 'centre_sante' ? 0.8 :
  s.type === 'maternite'    ? 0.6 : 0.3;

const score = distScore * 0.4 + capacityScore * 0.3 + typeScore * 0.3;
const isSaturated = occupancyRate > 0.9 || beds === 0;
```

### 4.4 Tri & sélection

```ts
const sorted = scored.sort((a, b) => b.score - a.score);
const top = sorted.slice(0, 5);
const recommended = top[0];                       // n°1
const alternative = top.find(s => s.id !== recommended.id && !s.isSaturated);
```

Si la structure n°1 est **saturée** (`isSaturated = true`) → marquer `rejection = "Capacité faible"` et mettre en avant l'alternative.

---

## 5. Implémentation React Native

### 5.1 Client Supabase

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://npucuhlvoalcbwdfedae.supabase.co',
  '<SUPABASE_ANON_KEY>',
);
```

### 5.2 Types

```ts
export type MissionHospital = {
  id: string;
  name: string;
  officialName: string | null;
  type: 'hopital' | 'centre_sante' | 'maternite' | string;
  address: string | null;
  commune: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  availableBeds: number | null;
  capacity: number | null;
  specialties: string[];
  equipment: string[];

  // calculés
  distanceKm: number;
  etaMin: number;
  score: number;
  isSaturated: boolean;
  rejection?: 'Capacité faible';
  isMatchingSpecialty: boolean;
  isCentralePick: boolean; // déjà choisi par l'opérateur ?
};
```

### 5.3 Hook `useMissionHospitals`

```ts
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

export function useMissionHospitals(dispatchId: string, fallbackGps?: { lat: number; lng: number }) {
  const [hospitals, setHospitals]   = useState<MissionHospital[]>([]);
  const [recommended, setRecommended] = useState<MissionHospital | null>(null);
  const [alternative, setAlternative] = useState<MissionHospital | null>(null);
  const [centralePickId, setCentralePickId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Dispatch + incident
      const { data: dispatch, error: dErr } = await supabase
        .from('dispatches')
        .select(`
          id, incident_id, assigned_structure_id, hospital_status,
          incidents:incident_id ( id, urgency_category, type, location_lat, location_lng )
        `)
        .eq('id', dispatchId)
        .single();
      if (dErr) throw dErr;

      const incident = (dispatch as any).incidents;
      const refLat = incident?.location_lat ?? fallbackGps?.lat ?? null;
      const refLng = incident?.location_lng ?? fallbackGps?.lng ?? null;
      if (refLat == null || refLng == null) {
        throw new Error('Position requise (incident sans GPS et urgentiste non géolocalisé).');
      }

      const urgency: string | undefined = incident?.urgency_category ?? incident?.type;
      setCentralePickId(dispatch.assigned_structure_id ?? null);

      // 2. Structures filtrées
      const { data: rawStructures, error: sErr } = await supabase
        .from('health_structures')
        .select(`
          id, name, official_name, type, address, commune, phone,
          lat, lng, available_beds, capacity, specialties, equipment, is_open
        `)
        .in('type', ['hopital', 'centre_sante', 'maternite'])
        .eq('is_open', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      if (sErr) throw sErr;

      // 3. Score + tri
      const scored: MissionHospital[] = (rawStructures ?? [])
        .filter(s => (s.available_beds ?? 1) > 0)
        .filter(s =>
          !urgency
            ? true
            : (s.specialties ?? []).includes(urgency) ||
              (s.specialties ?? []).includes('general'),
        )
        .map(s => {
          const distanceKm = haversineKm(refLat, refLng, s.lat as number, s.lng as number);
          const etaMin = Math.round(distanceKm * 4 + 3);
          const beds = s.available_beds ?? 0;
          const capacity = s.capacity || 1;
          const occupancy = 1 - beds / capacity;
          const distScore = Math.max(0, 1 - distanceKm / 30);
          const capacityScore = beds > 0 ? Math.min(1, beds / 10) : 0;
          const typeScore =
            s.type === 'hopital'      ? 1.0 :
            s.type === 'centre_sante' ? 0.8 :
            s.type === 'maternite'    ? 0.6 : 0.3;
          const score = distScore * 0.4 + capacityScore * 0.3 + typeScore * 0.3;
          const isSaturated = occupancy > 0.9 || beds === 0;
          const isMatchingSpecialty = !!urgency && (s.specialties ?? []).includes(urgency);

          return {
            id: s.id,
            name: s.name,
            officialName: s.official_name,
            type: s.type,
            address: s.address,
            commune: s.commune,
            phone: s.phone,
            lat: s.lat as number,
            lng: s.lng as number,
            availableBeds: s.available_beds,
            capacity: s.capacity,
            specialties: s.specialties ?? [],
            equipment: s.equipment ?? [],
            distanceKm: Math.round(distanceKm * 10) / 10,
            etaMin,
            score: Math.round(score * 100) / 100,
            isSaturated,
            rejection: isSaturated ? ('Capacité faible' as const) : undefined,
            isMatchingSpecialty,
            isCentralePick: dispatch.assigned_structure_id === s.id,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      setHospitals(scored);
      setRecommended(scored[0] ?? null);
      setAlternative(
        scored.find(s => s.id !== scored[0]?.id && !s.isSaturated) ?? null,
      );
    } catch (e: any) {
      setError(e.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [dispatchId, fallbackGps?.lat, fallbackGps?.lng]);

  useEffect(() => { refetch(); }, [refetch]);

  return { hospitals, recommended, alternative, centralePickId, loading, error, refetch };
}
```

---

## 6. Realtime — rafraîchissement automatique

### 6.1 Mises à jour structures (lits / ouverture)

```ts
useEffect(() => {
  let timer: any;
  const channel = supabase
    .channel('mission_hospitals_health_structures')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'health_structures' },
      () => {
        clearTimeout(timer);
        timer = setTimeout(refetch, 5000); // debounce 5 s pour la batterie
      })
    .subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}, [refetch]);
```

### 6.2 Réponse hôpital sur le dispatch

```ts
useEffect(() => {
  const channel = supabase
    .channel(`dispatch_${dispatchId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'dispatches', filter: `id=eq.${dispatchId}` },
      payload => {
        const next: any = payload.new;
        // hospital_status: pending → accepted | refused
        onHospitalResponse?.(next.hospital_status, next.hospital_notes);
        // si refusé, retirer cette structure de la liste affichée et resélectionner
        refetch();
      })
    .subscribe();
  return () => supabase.removeChannel(channel);
}, [dispatchId, refetch]);
```

---

## 7. UI recommandée

### 7.1 En-tête de la liste

> **Top 5 structures pour cette mission**
> Triées par pertinence (distance + capacité + type) — alignées avec la centrale.

### 7.2 Carte d'une structure

Chaque carte doit afficher :

- **Nom** + **type** (badge).
- Badges contextuels :
  - 🟢 **Recommandée** sur le n°1 si non saturé,
  - 🟠 **Capacité faible** si `isSaturated`,
  - 🔵 **Alternative** sur l'item alternatif,
  - 🟣 **Choisie par centrale** si `isCentralePick`.
- **Distance** (`X.X km`) + **ETA** (`~X min`).
- **Lits dispo** (`available_beds / capacity`) — vert > 5, orange 1–5, rouge 0.
- **Spécialités** (chips). Chip de la spécialité matchée (`isMatchingSpecialty`) surlignée.
- **Adresse** + bouton **Appeler** (utilise `phone`).
- **Score** (debug / power-users) : facultatif.
- **Bouton primaire** : **« Choisir cet hôpital »** → §8.

### 7.3 Pré-sélection centrale

Si `centralePickId` est défini, faire remonter cette structure en tête (au-dessus du Top 5 si elle n'y est pas) avec le badge **« Choisie par centrale »** et présélectionner le bouton (action confirmable).

---

## 8. Écriture de la sélection — table `dispatches`

Quand l'urgentiste valide une structure, écrire **strictement** les mêmes champs que le dashboard (cf. `DispatchModule.tsx`) :

```ts
await supabase
  .from('dispatches')
  .update({
    assigned_structure_id:      hospital.id,
    assigned_structure_name:    hospital.name,
    assigned_structure_lat:     hospital.lat,
    assigned_structure_lng:     hospital.lng,
    assigned_structure_phone:   hospital.phone,
    assigned_structure_address: hospital.address ?? null,
    assigned_structure_type:    hospital.type ?? null,
    hospital_status:            'pending',
    hospital_notes:             null,
    updated_at:                 new Date().toISOString(),
  })
  .eq('id', dispatchId);
```

Puis attendre via Realtime la transition `hospital_status: pending → accepted | refused` (cf. §6.2).

> 🔔 Les notifications push hôpital (`send-patient-hospital-push`) sont déclenchées automatiquement par trigger côté backend — **rien à faire côté mobile**.

---

## 9. Cas limites

| Cas | Comportement attendu |
|---|---|
| Aucune structure ne matche | Relâcher le filtre `urgency_category` (fallback `general`), puis tout type confondu avec un avertissement « Filtre spécialité levé ». |
| Position GPS de l'incident absente | Fallback sur position urgentiste. Si les deux NULL → bloquer + message. |
| `available_beds` NULL | Ne pas exclure (l'hôpital n'utilise pas ce champ). |
| Hôpital refuse | Retirer cette structure de la sélection courante, ré-afficher la liste, reset `assigned_structure_*` puis nouvelle UPDATE quand l'urgentiste choisit. |
| Top 5 vide (rare) | Élargir : retirer le filtre `is_open`, signaler à la centrale via `hospital_notes`. |
| Centrale a déjà choisi | Pré-sélectionner et badger « Choisie par centrale » — l'urgentiste peut toujours en choisir une autre. |
| Spécialité inconnue | Ignorer le filtre spécialité (équivalent à pas de match). |

---

## 10. Checklist d'intégration React Native ✅

- [ ] Installer `@supabase/supabase-js` et configurer le client.
- [ ] Implémenter `haversineKm` et le scoring identique au dashboard (§4).
- [ ] Créer le hook `useMissionHospitals(dispatchId, fallbackGps)`.
- [ ] Écran « Choix de l'hôpital pour la mission » avec Top 5 + alternative.
- [ ] Badges : Recommandée / Capacité faible / Alternative / Choisie par centrale.
- [ ] Action « Choisir » → UPDATE `dispatches` (cf. §8).
- [ ] Realtime sur `health_structures` (debounce 5 s).
- [ ] Realtime sur `dispatches` (réponse hôpital).
- [ ] Permission GPS + fallback sur la position de l'incident.
- [ ] Gestion des cas limites (§9).

---

## 11. Documents liés

- `URGENTISTE_APP_HOSPITAL_SELECTION.md` — version générique « hôpitaux à proximité » (sans logique mission).
- `MOBILE_HOSPITAL_SELECTION_DASHBOARD_UPDATE.md` — alignement Dashboard.
- `HOSPITAL_APP_UPDATE_STRUCTURE.md` — édition fiche hôpital côté App Hôpital.
- `PROMPT_CURSOR_HOSPITAL_PEC_MONITORING.md` — suivi PEC côté hôpital.
- Source du scoring (référence) : `src/hooks/useDispatchRecommendation.ts`.
- Écriture côté dashboard (référence) : `src/components/dashboard/DispatchModule.tsx` (action « Assigner & Envoyer »).

---

**Contact** : Équipe Dashboard PABX Étoile Bleue.
