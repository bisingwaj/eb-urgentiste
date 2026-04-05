# Gestion des Statuts — Cycle de Vie d'une Intervention

> Document de référence pour la synchronisation entre le Dashboard Web et l'Application Mobile (Flutter)

---

## 1. Vue d'ensemble — 3 tables impliquées

Chaque intervention touche **3 tables** dont les statuts doivent rester synchronisés :

| Table | Rôle | Qui écrit |
|---|---|---|
| `incidents` | Dossier global de l'urgence | Web (opérateur) + Mobile (secouriste via RLS) |
| `dispatches` | Mission assignée à une unité | Web (opérateur) + Mobile (secouriste via RLS) |
| `units` | État opérationnel de l'unité/véhicule | Web (opérateur) + Trigger `sync_rescuer_to_unit` |

---

## 2. Enums PostgreSQL actuels

### `incident_status`
```
new → pending → dispatched → en_route → arrived → investigating → in_progress
                                                                       ↓
                                              en_route_hospital → arrived_hospital
                                                                       ↓
                                                                    ended → resolved → archived
```

Valeurs : `new`, `pending`, `dispatched`, `en_route`, `arrived`, `investigating`, `in_progress`, `en_route_hospital`, `arrived_hospital`, `ended`, `resolved`, `archived`

### `unit_status`
```
available → dispatched → en_route → on_scene → returning → offline
```

Valeurs : `available`, `dispatched`, `en_route`, `on_scene`, `returning`, `offline`

### `dispatches.status` (TEXT, pas d'enum)
Valeurs utilisées dans le code : `dispatched`, `en_route`, `on_scene`, `en_route_hospital`, `arrived_hospital`, `mission_end`, `completed`

---

## 3. Phases d'intervention côté Dashboard Web

Le `DispatchModule.tsx` utilise un type local `InterventionPhase` :

```
idle → selecting → deployed → en_route → on_scene
                                            ↓
                                    ┌───────┴────────┐
                                    │                │
                              resolved         en_route_hospital
                          (traité sur place)         ↓
                                            arrived_hospital
                                                 ↓
                                             mission_end
                                                 ↓
                                              resolved
```

### Parcours 1 : Traitement sur place
```
selecting → deployed → en_route → on_scene → resolved
```

### Parcours 2 : Transfert hospitalier
```
selecting → deployed → en_route → on_scene → en_route_hospital → arrived_hospital → mission_end → resolved
```

---

## 4. Correspondance exacte des statuts (Web → DB)

Quand l'opérateur avance une phase (`handleAdvancePhase`), voici ce qui est écrit dans chaque table :

| Phase UI | `dispatches.status` | `incidents.status` | `units.status` |
|---|---|---|---|
| `deployed` | `dispatched` | `dispatched` | `dispatched` |
| `en_route` | `en_route` | `en_route` | `en_route` |
| `on_scene` | `on_scene` + `arrived_at=now()` | `arrived` | `on_scene` |
| `en_route_hospital` | `en_route_hospital` | `en_route_hospital` | `en_route` |
| `arrived_hospital` | `arrived_hospital` | `arrived_hospital` | `on_scene` |
| `mission_end` | `completed` + `completed_at=now()` | `ended` | `available` |
| `resolved` | `completed` + `completed_at=now()` | `resolved` + `resolved_at=now()` | `available` |

### Points d'attention critiques :
1. **`on_scene`** met `arrived_at` sur le dispatch
2. **`mission_end` ET `resolved`** écrivent tous les deux `completed` dans dispatches — pas de distinction
3. **`en_route_hospital`** remet `units.status` à `en_route` (pas un nouveau statut)
4. **`arrived_hospital`** remet `units.status` à `on_scene`

---

## 5. Synchronisation Realtime (Mobile → Web)

Le dashboard écoute les changements en temps réel via 2 canaux Supabase Realtime :

### Canal : `dispatches` (filtré par `incident_id`)
```typescript
const dispatchStatusToPhase = {
  dispatched: "deployed",
  en_route: "en_route",
  on_scene: "on_scene",
  en_route_hospital: "en_route_hospital",
  arrived_hospital: "arrived_hospital",
  mission_end: "mission_end",
  completed: "resolved",
};
```

### Canal : `incidents` (filtré par `id`)
```typescript
const incidentToPhase = {
  dispatched: "deployed",
  en_route: "en_route",
  arrived: "on_scene",        // ⚠️ "arrived" dans incidents = "on_scene" en phase
  in_progress: "on_scene",    // ⚠️ "in_progress" aussi = "on_scene"
  en_route_hospital: "en_route_hospital",
  arrived_hospital: "arrived_hospital",
  ended: "mission_end",       // ⚠️ "ended" dans incidents = "mission_end" en phase
  resolved: "resolved",
};
```

### Règle de progression : **Forward-only**
```typescript
setPhase(prev => PHASE_ORDER.indexOf(mappedPhase) > PHASE_ORDER.indexOf(prev) ? mappedPhase : prev);
```
Le statut ne peut que progresser vers l'avant, jamais reculer.

---

## 6. Trigger `sync_rescuer_to_unit`

Quand l'app mobile met à jour `active_rescuers`, le trigger propage vers `units` :

```sql
-- Mapping rescuer status → unit status
'active'           → 'available'
'en_intervention'  → 'dispatched'
'en_route'         → 'en_route'
'on_scene'         → 'on_scene'
'offline'          → 'offline'
```

**Champs propagés** : `location_lat`, `location_lng`, `battery`, `heading`, `last_location_update`

---

## 7. Ce que l'app mobile DOIT écrire

### Table `dispatches` — UPDATE (autorisé par RLS si `unit_id` = assigned_unit du secouriste)

| Action mobile | `dispatches.status` | Champs additionnels |
|---|---|---|
| Accepter la mission | `en_route` | — |
| Arriver sur zone | `on_scene` | `arrived_at = now()` |
| Départ vers hôpital | `en_route_hospital` | — |
| Arrivée à l'hôpital | `arrived_hospital` | — |
| Fin de mission | `mission_end` | `completed_at = now()` |
| Clôturer | `completed` | `completed_at = now()` (si pas déjà set) |

### Table `incidents` — UPDATE (autorisé par RLS si dispatch lié à l'unité du secouriste)

| Action mobile | `incidents.status` | Champs additionnels |
|---|---|---|
| En route | `en_route` | — |
| Arrivé sur zone | `arrived` | — |
| Départ vers hôpital | `en_route_hospital` | — |
| Arrivée à l'hôpital | `arrived_hospital` | — |
| Fin de mission | `ended` | — |
| Résolu | `resolved` | `resolved_at = now()` |

### Table `active_rescuers` — UPSERT (GPS continu)

| Champ | Source |
|---|---|
| `lat`, `lng` | GPS device |
| `accuracy` | GPS |
| `heading`, `speed` | GPS |
| `battery` | Device API |
| `status` | `active`, `en_route`, `on_scene`, `en_intervention`, `offline` |

Le trigger `sync_rescuer_to_unit` propage automatiquement vers `units`.

---

## 8. Triggers automatiques côté serveur

### `on_incident_created` (INSERT sur `incidents`)
- Vérifie si le citoyen est bloqué (`is_citizen_blocked`)
- Si non bloqué : insère dans `call_queue` (status: `waiting`)
- Lance `auto_assign_queue()` pour distribuer aux opérateurs

### `on_call_history_status_change` (UPDATE sur `call_history`)
- Quand `call_history.status` → `completed` ou `missed` :
  - Ferme l'entrée `call_queue` correspondante
  - Passe `incidents.status` de `new` → `ended` si encore `new`
  - Relance `auto_assign_queue()`

### `on_incident_resolved` (UPDATE sur `incidents`)
- Quand `incidents.status` → `resolved`, `archived` ou `ended` :
  - Met `resolved_at = now()` si null
  - Ferme les entrées `call_queue` liées (→ `completed`)

### `notify_dispatch_created` (INSERT sur `dispatches`)
- Crée une notification pour le secouriste assigné à l'unité

---

## 9. Diagramme de flux complet

```
CITOYEN                    SERVEUR                     OPÉRATEUR (Web)                SECOURISTE (Mobile)
   │                          │                              │                              │
   ├─ SOS (incident créé) ──►│                              │                              │
   │                          ├─ call_queue: waiting ──────►│                              │
   │                          ├─ auto_assign_queue() ──────►│ (notification)               │
   │                          │                              │                              │
   │                          │                              ├─ Décroche l'appel            │
   │                          │                              ├─ Triage + Sélection unité    │
   │                          │                              ├─ DEPLOY ─────────────────────│
   │                          │                              │  dispatch: dispatched         │
   │                          │                              │  incident: dispatched         │
   │                          │                              │  unit: dispatched             │
   │                          │                              │                              │
   │                          │                              │                    ┌─────────┤
   │                          │                              │                    │ Accepte  │
   │                          │                              │                    │ dispatch │
   │                          │◄── dispatch: en_route ───────│────────────────────┤          │
   │                          │◄── incident: en_route ───────│                    │          │
   │                          │◄── rescuer GPS: en_route ────│                    │          │
   │                          │    (trigger → unit: en_route)│                    │          │
   │                          │                              │                    │          │
   │                          │◄── dispatch: on_scene ───────│────────────────────┤ Arrivé   │
   │                          │◄── incident: arrived ────────│                    │          │
   │                          │                              │                    │          │
   │                          │                              │           ┌────────┴────────┐ │
   │                          │                              │           │ Traité sur place │ │
   │                          │                              │           │  OU              │ │
   │                          │                              │           │ Transfert hôpital│ │
   │                          │                              │           └────────┬────────┘ │
   │                          │                              │                    │          │
   │                          │◄── dispatch: completed ──────│────────────────────┤ Fin      │
   │                          │◄── incident: resolved ───────│                    │          │
   │                          │    (trigger → call_queue:    │                    │          │
   │                          │     completed)               │                    │          │
```

---

## 10. Problèmes potentiels de synchronisation

### 10.1 — Double écriture `dispatches` + `incidents`
Le mobile DOIT mettre à jour les 2 tables. Si seule `dispatches` est mise à jour, le dashboard détectera la phase via Realtime sur `dispatches` mais l'incident restera bloqué dans un ancien statut.

### 10.2 — `mission_end` vs `completed`
- Le dashboard écrit `dispatches.status = "completed"` pour BOTH `mission_end` et `resolved`
- Le mobile doit utiliser `mission_end` comme statut intermédiaire dans `dispatches` (avant `completed`)
- Le Realtime mapping traduit `mission_end` → phase `mission_end` et `completed` → phase `resolved`

### 10.3 — `incidents.status = "arrived"` vs `dispatches.status = "on_scene"`
La terminologie diffère entre les deux tables pour le même événement :
- `dispatches` : `on_scene`
- `incidents` : `arrived`

### 10.4 — `units.status` peut être écrit par 2 sources
1. Le trigger `sync_rescuer_to_unit` (via `active_rescuers`)
2. Le `handleAdvancePhase` du dashboard (via `updateUnit.mutate`)

**Risque de conflit** : si le mobile et le dashboard écrivent simultanément un statut différent, le dernier gagne.

### 10.5 — Le trigger `sync_rescuer_to_unit` ne gère PAS `en_route_hospital`
Le mapping actuel du trigger :
```sql
'en_intervention' → 'dispatched'
'en_route'        → 'en_route'      -- Utilisé pour en_route ET en_route_hospital
'on_scene'        → 'on_scene'      -- Utilisé pour on_scene ET arrived_hospital
```
Il n'y a pas de distinction entre `en_route` (vers le patient) et `en_route` (vers l'hôpital) au niveau du trigger.

### 10.6 — Statut `pending` absent du dispatch
L'incident peut être en `pending` (dans la file d'attente) mais le dispatch n'existe pas encore. Le mobile ne doit pas essayer de créer un dispatch — c'est l'opérateur qui le fait.

---

## 11. Contrat de synchronisation recommandé

### Séquence d'écriture mobile (ordre garanti)

```
1. UPDATE dispatches SET status = '<new_status>' WHERE unit_id = my_unit_id
2. UPDATE incidents  SET status = '<mapped_status>' WHERE id = dispatch.incident_id
3. UPSERT active_rescuers SET status = '<rescuer_status>'  (continu, pas lié aux transitions)
```

### Mapping mobile à respecter strictement

| Action | `dispatches.status` | `incidents.status` | `active_rescuers.status` |
|---|---|---|---|
| Mission acceptée | `en_route` | `en_route` | `en_route` |
| Arrivé sur zone | `on_scene` | `arrived` | `on_scene` |
| Traitement en cours | — (reste `on_scene`) | `in_progress` | `en_intervention` |
| Départ hôpital | `en_route_hospital` | `en_route_hospital` | `en_route` |
| Arrivé hôpital | `arrived_hospital` | `arrived_hospital` | `on_scene` |
| Fin mission | `mission_end` | `ended` | `active` |
| Clôture complète | `completed` | `resolved` | `active` |
