# Architecture Technique — Gestion des Missions (Dispatches)

## 1. Schéma Database

### Table `incidents` (enum `incident_status`)

| Colonne | Type | Nullable | Default | Description |
|---------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `reference` | text | NO | — | Channel name / identifiant unique |
| `type` | text | NO | — | Catégorie d'urgence |
| `priority` | `incident_priority` (enum) | NO | `'medium'` | `medium`, `high`, `critical` |
| `status` | `incident_status` (enum) | NO | `'new'` | Voir statuts ci-dessous |
| `title` | text | NO | — | |
| `description` | text | YES | — | |
| `caller_name` | text | YES | — | |
| `caller_phone` | text | YES | — | |
| `location_address` | text | YES | — | |
| `location_lat` | double | YES | — | |
| `location_lng` | double | YES | — | |
| `assigned_operator_id` | uuid | YES | — | Opérateur qui a pris l'appel |
| `citizen_id` | uuid | YES | — | Citoyen lié (auth_user_id) |
| `commune` | text | YES | — | Auto-déterminé par trigger |
| `ville` | text | YES | `'Kinshasa'` | |
| `province` | text | YES | `'Kinshasa'` | |
| `media_urls` | text[] | YES | `'{}'` | Photos/vidéos |
| `media_type` | text | YES | `'photo'` | |
| `notes` | text | YES | — | |
| `ended_by` | text | YES | — | Qui a clos (`operator`, `system`, `rescuer`) |
| `incident_at` | timestamptz | YES | — | Auto-set par trigger |
| `resolved_at` | timestamptz | YES | — | Auto-set quand `status → resolved/archived` |
| `archived_at` | timestamptz | YES | — | |
| `caller_realtime_lat/lng` | double | YES | — | Position temps réel du citoyen |
| `caller_realtime_updated_at` | timestamptz | YES | — | |
| `device_model` | text | YES | — | |
| `battery_level` | text | YES | — | |
| `network_state` | text | YES | — | |
| `recommended_actions` | text | YES | — | Rempli par l'IA de triage |
| `recommended_facility` | text | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Auto-trigger |

#### Valeurs enum `incident_status`

```
new → pending → in_progress → dispatched → en_route → arrived → investigating
                                         → en_route_hospital → arrived_hospital
                                         → ended → resolved → archived → declasse
```

---

### Table `dispatches`

| Colonne | Type | Nullable | Default | Description |
|---------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `incident_id` | uuid | NO | — | **FK → incidents(id) ON DELETE CASCADE** |
| `unit_id` | uuid | NO | — | **FK → units(id)** |
| `dispatched_by` | uuid | YES | — | Opérateur qui a dispatché |
| `rescuer_id` | uuid | YES | — | Secouriste principal assigné |
| `status` | text | NO | `'dispatched'` | Statut libre (voir flux ci-dessous) |
| `dispatched_at` | timestamptz | NO | `now()` | |
| `arrived_at` | timestamptz | YES | — | |
| `completed_at` | timestamptz | YES | — | |
| `notes` | text | YES | — | |
| **Colonnes hôpital** | | | | |
| `assigned_structure_id` | uuid | YES | — | ID de la structure sanitaire assignée |
| `assigned_structure_name` | text | YES | — | Dénormalisé pour performance |
| `assigned_structure_lat` | double | YES | — | |
| `assigned_structure_lng` | double | YES | — | |
| `assigned_structure_phone` | text | YES | — | |
| `assigned_structure_address` | text | YES | — | |
| `assigned_structure_type` | text | YES | — | |
| `hospital_status` | text | YES | `'pending'` | `pending → accepted → refused` |
| `hospital_responded_at` | timestamptz | YES | — | |
| `hospital_notes` | text | YES | — | |
| `hospital_data` | jsonb | YES | `'{}'` | Données supplémentaires de l'hôpital |
| `admission_recorded_at` | timestamptz | YES | — | Quand l'hôpital a enregistré l'admission |
| `admission_recorded_by` | uuid | YES | — | Qui a enregistré l'admission |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Auto-trigger |

#### Foreign Keys `dispatches`

```
dispatches.incident_id → incidents.id (ON DELETE CASCADE)
dispatches.unit_id     → units.id
```

⚠️ **Pas de FK explicite** pour `assigned_structure_id → health_structures.id` (lien logique seulement).

---

### Table `health_structures`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `name` | text | Nom complet |
| `official_name` | text | Nom officiel |
| `short_name` | text | Abréviation |
| `type` | text | `hopital`, `clinique`, `pharmacie`, `maternite`, `centre_sante` |
| `lat/lng` | double | Coordonnées GPS |
| `address` | text | |
| `phone` | text | |
| `email` | text | |
| `capacity` | int | Capacité totale en lits |
| `available_beds` | int | Lits disponibles |
| `specialties` | text[] | Ex: `['urgences', 'pédiatrie']` |
| `equipment` | text[] | |
| `operating_hours` | text | Default `'24h/24'` |
| `is_open` | boolean | |
| `rating` | int | |
| `contact_person` | text | |
| `linked_user_id` | uuid | **Lien vers `users_directory.id`** (compte hôpital) |

---

### Tables satellites

| Table | FK vers | Description |
|-------|---------|-------------|
| `dispatch_timeline` | `dispatches.id`, `incidents.id` | Événements horodatés de la mission |
| `incident_assessments` | `dispatches.id`, `incidents.id` | Évaluation médicale terrain |
| `hospital_reports` | `dispatches.id`, `incidents.id`, `health_structures.id` | Rapport d'admission |
| `hospital_constraints` | `health_structures.id` | Contraintes actives (rupture, surcharge) |

---

## 2. Triggers SQL sur `dispatches`

### 2.1 `trg_dispatch_status_push` (AFTER UPDATE)

```sql
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION notify_citizen_dispatch_status()
```

**Effet** : À chaque changement de `dispatches.status`, envoie une notification push FCM au citoyen via l'Edge Function `send-dispatch-push`. Statuts écoutés : `dispatched`, `en_route`, `on_scene`, `en_route_hospital`, `arrived_hospital`, `mission_end`, `completed`.

### 2.2 `trg_notify_on_dispatch` (AFTER INSERT)

```sql
EXECUTE FUNCTION notify_dispatch_created()
```

**Effet** : 
1. Crée une notification in-app dans la table `notifications` pour le premier secouriste de l'unité.
2. Envoie un push FCM via `send-dispatch-unit-push` pour réveiller l'app mobile.

### 2.3 `update_dispatches_updated_at` (BEFORE UPDATE)

```sql
EXECUTE FUNCTION update_updated_at_column()
```

**Effet** : Met à jour `updated_at = now()` automatiquement.

---

## 3. Triggers SQL sur `incidents`

### 3.1 `trg_auto_enrich_incident` (BEFORE INSERT)

Auto-set `incident_at`, auto-détermine `commune` depuis GPS via `commune_bounds`, fallback `location_address`.

### 3.2 `trg_deduplicate_incident` (BEFORE INSERT)

Bloque les doublons : même `citizen_id` avec incident `in_progress` existant, ou `new` dans les 30s, ou `ended` dans les 10s.

### 3.3 `trg_incident_resolved` (AFTER UPDATE)

```sql
EXECUTE FUNCTION on_incident_resolved()
```

**Logique clé** :
```
SI status passe à (resolved | archived | ended | declasse)
  → Auto-set resolved_at = now() (si null et status = resolved/archived)
  → Ferme les call_queue en cours (status → completed)
```

### 3.4 `trg_incident_to_queue` (AFTER INSERT)

Quand un incident `new` est créé → insère dans `call_queue` → appelle `auto_assign_queue()`.

### 3.5 Trigger via `on_call_history_status_change`

Quand un appel passe à `completed/missed` :
```
→ Ferme le call_queue associé
→ Ferme l'incident UNIQUEMENT si AUCUN dispatch actif n'existe
  (protection : si un dispatch existe, l'incident vit indépendamment de l'appel)
```

---

## 4. Flux de Statuts — Transfert Hospitalier

### Chemin nominal complet

```
┌─────────────┐
│  INCIDENT   │   new → in_progress → dispatched → en_route → on_scene
│  (status)   │                                                   │
└─────────────┘                                                   ▼
                                                          en_route_hospital
                                                                  │
                                                                  ▼
                                                          arrived_hospital
                                                                  │
                                        ┌─────────────────────────┤
                                        ▼                         ▼
                                    resolved                  archived
```

### Dispatch + Hospital Status

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  dispatch    │     │  dispatch             │     │  dispatch        │
│  .status     │     │  .hospital_status     │     │  .hospital_data  │
├─────────────┤     ├──────────────────────┤     ├──────────────────┤
│ dispatched   │     │ (pas encore assigné)  │     │ {}               │
│ en_route     │     │ (pas encore assigné)  │     │ {}               │
│ on_scene     │     │ pending               │     │ {}               │
│ en_route_    │     │ accepted ✅           │     │ { beds, ward..}  │
│  hospital    │     │                       │     │                  │
│ arrived_     │     │ accepted              │     │ { admission..}   │
│  hospital    │     │                       │     │                  │
│ completed    │     │ accepted              │     │ { final report } │
└─────────────┘     └──────────────────────┘     └──────────────────┘
```

### Détail du flux hospitalier

1. **Assignation structure** : L'opérateur assigne une `health_structure` au dispatch → `assigned_structure_*` remplis, `hospital_status = 'pending'`
2. **Acceptation** : L'hôpital (via son app) met `hospital_status = 'accepted'` + `hospital_responded_at`
3. **En route** : Le secouriste passe `dispatch.status = 'en_route_hospital'` + `incident.status = 'en_route_hospital'`
4. **Arrivée** : `dispatch.status = 'arrived_hospital'` + `incident.status = 'arrived_hospital'`
5. **Admission** : L'hôpital enregistre l'admission → `admission_recorded_at`, `admission_recorded_by` remplis
6. **Fin de mission secouriste** : Voir section 5

---

## 5. Séparation des responsabilités : Secouriste vs Hôpital

### Problème

Le secouriste doit pouvoir se "libérer" (rendre son unité disponible) sans clore l'incident pour l'hôpital.

### Solution actuelle : `dispatch.status = 'completed'` ≠ `incident.status = 'resolved'`

```
┌────────────────────────────────────────────────────────────┐
│                    TIMELINE                                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Secouriste :  dispatched → en_route → on_scene           │
│                → en_route_hospital → arrived_hospital      │
│                → completed ← LE SECOURISTE SE LIBÈRE ICI   │
│                                                            │
│  Incident :   dispatched → ... → arrived_hospital          │
│               (reste en arrived_hospital tant que           │
│                l'hôpital n'a pas clos)                      │
│                                                            │
│  Hôpital :    hospital_status: pending → accepted          │
│               admission_recorded_at: ← ADMISSION           │
│               → L'opérateur central passe l'incident       │
│                 à resolved/archived                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Statuts intermédiaires existants

| Statut | Qui le set | Signification |
|--------|-----------|---------------|
| `arrived_hospital` | Secouriste | Le patient est physiquement à l'hôpital |
| `dispatch.status = 'completed'` | Secouriste | **Le secouriste a terminé sa mission** — l'unité redevient `available` |
| `incident.status = 'arrived_hospital'` | Système | L'incident reste ouvert, en attente de l'hôpital |
| `admission_recorded_at` | Hôpital | L'hôpital a pris en charge le patient |
| `incident.status = 'resolved'` | Opérateur central | Clôture finale après confirmation hôpital |

### Flux recommandé pour l'app urgentiste

```dart
// 1. Le secouriste arrive à l'hôpital
await supabase.from('dispatches').update({
  'status': 'arrived_hospital',
  'arrived_at': DateTime.now().toIso8601String(),
}).eq('id', dispatchId);

await supabase.from('incidents').update({
  'status': 'arrived_hospital',
}).eq('id', incidentId);

// 2. Le secouriste se libère (FIN DE MISSION)
await supabase.from('dispatches').update({
  'status': 'completed',
  'completed_at': DateTime.now().toIso8601String(),
}).eq('id', dispatchId);

// ⚠️ NE PAS toucher à incident.status ici !
// L'incident reste en 'arrived_hospital' pour l'hôpital.
// L'unité redevient automatiquement 'available'.
```

### Important : Trigger de protection

Le trigger `on_call_history_status_change` **ne ferme PAS** l'incident s'il existe un dispatch actif :

```sql
AND NOT EXISTS (
  SELECT 1 FROM public.dispatches d
  WHERE d.incident_id = incidents.id
    AND d.status NOT IN ('completed', 'cancelled')
);
```

---

## 6. Edge Functions liées aux missions

### `send-dispatch-push` (trigger automatique)

- **Déclencheur** : `trg_dispatch_status_push` sur `dispatches` (changement de status)
- **Action** : Envoie une notification push FCM au **citoyen** (via `incidents.citizen_id → users_directory.fcm_token`)
- **Payload** : Status traduit en message lisible (ex: "Votre ambulance est en route")

### `send-dispatch-unit-push` (trigger automatique)

- **Déclencheur** : `trg_notify_on_dispatch` sur `dispatches` (INSERT)
- **Action** : Envoie un push FCM haute priorité à **tous les membres de l'unité** assignée
- **But** : Réveiller l'app mobile même quand elle est fermée

### `cleanup_stale_queue_entries()` (fonction SQL, pas Edge)

- **Appel** : Via cron ou manuellement
- **Action** :
  - `call_queue` en `waiting/assigned` depuis > 5 min → `abandoned`
  - `call_history` en `ringing` + `internal` depuis > 60s → `missed`
  - `call_history` en `ringing` + non-internal depuis > 5 min → `missed`
  - Opérateurs `online` sans activité depuis > 2 min → `offline`

### Pas de nettoyage automatique des dispatches

⚠️ **Il n'existe actuellement AUCUN trigger/cron qui ferme automatiquement les dispatches actifs.** C'est intentionnel : les missions doivent être explicitement fermées par le secouriste (`completed`) ou annulées par l'opérateur (`cancelled`).

---

## 7. Diagramme de relations (ERD simplifié)

```
                    ┌──────────────────┐
                    │    incidents     │
                    │    (PK: id)      │
                    └────────┬─────────┘
                             │ 1:N
                    ┌────────▼─────────┐
                    │   dispatches     │──────────┐
                    │   (PK: id)       │          │ N:1
                    │   FK: incident_id│    ┌─────▼──────────┐
                    │   FK: unit_id    │    │    units        │
                    └──┬─────┬────┬────┘    └────────────────┘
                       │     │    │
              1:N      │     │    │ logique (pas FK)
     ┌─────────────────┘     │    └──────────────────┐
     ▼                       ▼                        ▼
┌────────────┐   ┌───────────────────┐   ┌──────────────────┐
│ dispatch_  │   │ incident_         │   │ health_          │
│ timeline   │   │ assessments       │   │ structures       │
│ FK:dispatch│   │ FK: dispatch_id   │   │ (assigned_       │
│ FK:incident│   │ FK: incident_id   │   │  structure_id)   │
└────────────┘   └───────────────────┘   └──────────────────┘
                                                  │ 1:N
                                         ┌────────▼─────────┐
                                         │ hospital_        │
                                         │ reports          │
                                         │ FK: dispatch_id  │
                                         │ FK: structure_id │
                                         └──────────────────┘
```

---

## 8. Résumé pour synchronisation frontend

| Action | Table à modifier | Qui peut le faire | Effet cascade |
|--------|-----------------|-------------------|---------------|
| Dispatcher une unité | `dispatches` INSERT | Opérateur | Trigger: notif in-app + push FCM unité |
| Changer statut dispatch | `dispatches` UPDATE `.status` | Secouriste / Opérateur | Trigger: push FCM citoyen |
| Arrivée hôpital | `dispatches` + `incidents` | Secouriste | Incident reste ouvert |
| Fin mission secouriste | `dispatches.status = 'completed'` | Secouriste | Unité libérée, incident intact |
| Admission hôpital | `dispatches.admission_recorded_*` | Hôpital | — |
| Résolution finale | `incidents.status = 'resolved'` | Opérateur central | Trigger: `resolved_at` auto, `call_queue` fermée |
