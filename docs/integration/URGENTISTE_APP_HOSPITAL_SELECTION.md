# 🚑 Sélection d'hôpital côté Urgentiste — Spécification d'intégration

> **Audience** : Équipe **React Native** — Application Urgentiste
> **Backend** : Lovable Cloud (Supabase) — projet `npucuhlvoalcbwdfedae`
> **Date** : Avril 2026
> **Statut** : ✅ Backend prêt — à intégrer côté mobile

---

## 1. Contexte fonctionnel

Lorsqu'un urgentiste prend en charge un patient sur le terrain et doit décider vers **quel hôpital** l'évacuer, l'application doit lui proposer une **liste courte des 5 hôpitaux les plus pertinents** :

- **Proches** de la position de l'alerte (incident) ou de la position GPS courante de l'urgentiste,
- **Disponibles** (ouverts, avec lits libres),
- **Cohérents** avec le type d'urgence (spécialité requise) si renseigné.

L'urgentiste sélectionne **manuellement** un hôpital dans cette liste. La sélection est ensuite écrite dans la table `dispatches` (cf. `lovable_hospital_selection.md`) et l'hôpital est notifié pour acceptation/refus.

---

## 2. Source de données — table `health_structures`

Toutes les structures sanitaires (hôpitaux, centres de santé, maternités) sont dans la table `public.health_structures`.

### Champs utiles côté mobile

| Champ | Type | Description |
|---|---|---|
| `id` | `uuid` | Identifiant unique |
| `name` | `text` | Nom court affiché |
| `official_name` | `text` | Nom officiel complet |
| `type` | `text` | `hopital`, `centre_sante`, `maternite`, `pharmacie`, … |
| `address` | `text` | Adresse postale |
| `commune` | `text` | Commune (Kinshasa) |
| `lat` | `double precision` | Latitude WGS84 |
| `lng` | `double precision` | Longitude WGS84 |
| `phone` | `text` | Numéro de contact |
| `is_open` | `boolean` | **Ouvert maintenant** (mis à jour par l'app Hôpital) |
| `available_beds` | `integer` | **Lits disponibles** |
| `capacity` | `integer` | Capacité totale |
| `specialties` | `text[]` | Spécialités : `cardiaque`, `traumatisme`, `brulure`, `obstetrique`, `pediatrie`, `intoxication`, `psychiatrie`, `accident_route`, `agression`, `incendie`, `general` |
| `equipment` | `text[]` | Équipements (scanner, bloc op, réa, etc.) |
| `operating_hours` | `text` | Horaires (informatif) |
| `linked_user_id` | `uuid` | Compte hôpital lié (utile pour Realtime côté hôpital) |

### Règles de filtrage à appliquer

1. `type IN ('hopital', 'centre_sante', 'maternite')` — exclure pharmacie / police / pompier.
2. `is_open = true` — l'hôpital est en service maintenant.
3. `available_beds IS NULL OR available_beds > 0` — éviter les saturés (NULL = info non gérée → on garde).
4. *(Optionnel)* Si l'incident a une `urgency_category` : `urgency_category = ANY(specialties)` OU `'general' = ANY(specialties)`.

---

## 3. Algorithme de sélection — Top 5

### 3.1 Point de référence

Par ordre de priorité :
1. **Coordonnées de l'incident** (`incidents.location_lat`, `incidents.location_lng`) — c'est l'adresse où le patient a été pris en charge.
2. **Position GPS courante de l'urgentiste** (fallback si l'incident n'a pas de GPS).

### 3.2 Calcul de distance — Haversine

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

### 3.3 ETA estimé

```ts
const etaMin = Math.round(distanceKm * 4 + 3); // 4 min/km + 3 min de prise en charge
```

> Pour un calcul plus fin, utiliser **Mapbox Directions API** côté mobile (déjà utilisé sur le dashboard).

### 3.4 Score de pertinence (recommandé)

Trier sur un score combiné — pas uniquement la distance brute :

```ts
score =
    (1 / (distanceKm + 1)) * 50          // Proximité (poids fort)
  + (availableBeds > 5 ? 20 : availableBeds * 4)  // Capacité
  + (matchesSpecialty ? 30 : 0);         // Adéquation spécialité
```

Puis `ORDER BY score DESC LIMIT 5`.

Un tri **distance ASC LIMIT 5** reste acceptable en V1.

---

## 4. Implémentation côté React Native

### 4.1 Client Supabase

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://npucuhlvoalcbwdfedae.supabase.co',
  '<SUPABASE_ANON_KEY>'
);
```

### 4.2 Fetch + filtrage + tri (V1 simple)

```ts
type HospitalSuggestion = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  available_beds: number | null;
  capacity: number | null;
  specialties: string[];
  equipment: string[];
  distanceKm: number;
  etaMin: number;
};

export async function getNearbyHospitals(
  refLat: number,
  refLng: number,
  urgencyCategory?: string,
  limit = 5,
): Promise<HospitalSuggestion[]> {
  const { data, error } = await supabase
    .from('health_structures')
    .select(
      'id, name, type, address, phone, lat, lng, available_beds, capacity, specialties, equipment, is_open',
    )
    .in('type', ['hopital', 'centre_sante', 'maternite'])
    .eq('is_open', true)
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  if (error) throw error;

  const enriched = (data ?? [])
    .filter(h => (h.available_beds ?? 1) > 0)
    .filter(h =>
      !urgencyCategory
        ? true
        : (h.specialties ?? []).includes(urgencyCategory) ||
          (h.specialties ?? []).includes('general'),
    )
    .map(h => {
      const distanceKm = haversineKm(refLat, refLng, h.lat, h.lng);
      return {
        ...h,
        distanceKm,
        etaMin: Math.round(distanceKm * 4 + 3),
      } as HospitalSuggestion;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return enriched;
}
```

### 4.3 Hook React Native (exemple)

```ts
import { useEffect, useState } from 'react';

export function useNearbyHospitals(
  refLat: number | null,
  refLng: number | null,
  urgencyCategory?: string,
) {
  const [hospitals, setHospitals] = useState<HospitalSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (refLat == null || refLng == null) return;
    let cancelled = false;
    setLoading(true);
    getNearbyHospitals(refLat, refLng, urgencyCategory, 5)
      .then(list => !cancelled && setHospitals(list))
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [refLat, refLng, urgencyCategory]);

  return { hospitals, loading, error };
}
```

---

## 5. Realtime — rafraîchissement automatique

Les champs `is_open` et `available_beds` sont mis à jour en temps réel par les hôpitaux depuis l'**App Hôpital**. La table `health_structures` est exposée via Supabase Realtime.

```ts
useEffect(() => {
  const channel = supabase
    .channel('health_structures_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'health_structures' },
      () => refetch(), // recharge la liste
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

> 💡 Pour économiser la batterie : ne déclencher `refetch()` que si l'UPDATE concerne un hôpital déjà dans la liste affichée, sinon debounce 5 s.

---

## 6. UI recommandée — carte d'un hôpital suggéré

Chaque item de la liste doit afficher :

- **Nom** (`name`) + badge type (`type`)
- **Distance** (`distanceKm.toFixed(1)} km`) + **ETA** (`etaMin min`)
- **Lits dispo** (`available_beds / capacity`) — badge vert si > 5, orange si 1–5, rouge si 0
- **Spécialités** (chips) — surligner celle qui matche l'urgence
- **Adresse** + **téléphone** (action « Appeler »)
- **Bouton primaire « Choisir cet hôpital »** → écrit dans `dispatches`

Indicateur global : badge **« Top 5 hôpitaux les plus proches et disponibles »** en en-tête de liste.

---

## 7. Écriture de la sélection — table `dispatches`

Une fois l'hôpital choisi par l'urgentiste, mettre à jour la ligne `dispatches` correspondante (cf. `lovable_hospital_selection.md`) :

```ts
await supabase
  .from('dispatches')
  .update({
    assigned_structure_id: hospital.id,
    assigned_structure_name: hospital.name,            // snapshot
    assigned_structure_lat: hospital.lat,
    assigned_structure_lng: hospital.lng,
    assigned_structure_phone: hospital.phone,
    hospital_status: 'pending',
    hospital_notes: null,
    updated_at: new Date().toISOString(),
  })
  .eq('id', dispatchId);
```

Puis écouter en Realtime la transition `hospital_status: pending → accepted | refused`.

---

## 8. Cas limites à gérer

| Cas | Comportement attendu |
|---|---|
| Aucun hôpital ne matche les filtres | Relâcher le filtre `urgencyCategory` (fallback `general`), puis afficher tout type confondu avec un avertissement. |
| Position GPS de l'urgentiste indisponible | Utiliser `incident.location_lat/lng`. Si les deux sont null → message « Position requise ». |
| `available_beds` non renseigné (NULL) | Ne pas exclure — l'hôpital n'utilise pas ce champ. |
| Hôpital refuse (`hospital_status = 'refused'`) | Réafficher la liste pour permettre une nouvelle sélection. |
| Liste de 0 hôpital (rare) | Élargir la zone : pas de filtre `is_open`, signaler à l'opérateur via le dispatch. |

---

## 9. Checklist d'intégration React Native ✅

- [ ] Installer `@supabase/supabase-js` et configurer le client.
- [ ] Implémenter `haversineKm` et `getNearbyHospitals`.
- [ ] Créer le hook `useNearbyHospitals(refLat, refLng, urgencyCategory)`.
- [ ] Écran « Choix de l'hôpital » avec liste de 5 cartes.
- [ ] Action « Choisir » → UPDATE `dispatches` (cf. §7).
- [ ] Écoute Realtime sur `dispatches` pour la réponse hôpital.
- [ ] Écoute Realtime sur `health_structures` pour rafraîchir la liste.
- [ ] Gérer les cas limites (§8).
- [ ] Permission GPS + fallback sur la position de l'incident.

---

## 10. Documents liés

- `lovable_hospital_selection.md` — flux de sélection côté mobile (contrat `dispatches`)
- `MOBILE_HOSPITAL_SELECTION_DASHBOARD_UPDATE.md` — alignement Dashboard
- `HOSPITAL_APP_UPDATE_STRUCTURE.md` — édition fiche hôpital côté App Hôpital
- `PATIENT_APP_STRUCTURES_PROXIMITY.md` — logique de proximité côté patient

---

**Contact** : Équipe Dashboard PABX Étoile Bleue.
