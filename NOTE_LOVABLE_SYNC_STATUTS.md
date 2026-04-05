# 📝 Note pour Lovable — Synchronisation Statuts Dashboard ↔ Mobile

> Modifications requises côté Dashboard Web pour assurer la synchronisation complète avec l'app mobile Étoile Bleue.

---

## Contexte

L'app mobile va désormais écrire les **statuts intermédiaires hospitaliers** dans Supabase :
- `en_route_hospital` (quand l'urgentiste choisit le véhicule et part vers l'hôpital)
- `arrived_hospital` (quand il arrive à l'hôpital)

Avant, le mobile sautait directement de `on_scene` à `completed`. Maintenant le flow complet est respecté.

---

## ⛔ 0. BLOQUANT — Contrainte CHECK sur `dispatches.status`

**Le mobile ne peut PAS écrire `en_route_hospital` ni `arrived_hospital` dans `dispatches`.**

Erreur reçue :
```
new row for relation "dispatches" violates check constraint "dispatches_status_check"
```

La table `dispatches` a une contrainte CHECK qui limite les valeurs acceptées pour le champ `status`. Il faut la modifier pour ajouter les nouveaux statuts.

### Migration SQL à exécuter :

```sql
-- 1. Voir la contrainte actuelle
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.dispatches'::regclass AND contype = 'c';

-- 2. Supprimer l'ancienne contrainte
ALTER TABLE public.dispatches DROP CONSTRAINT dispatches_status_check;

-- 3. Recréer avec tous les statuts
ALTER TABLE public.dispatches ADD CONSTRAINT dispatches_status_check 
CHECK (status IN ('dispatched', 'en_route', 'on_scene', 'en_route_hospital', 'arrived_hospital', 'mission_end', 'completed'));
```

> ⚠️ **SANS cette migration, tout le flow hospitalier est bloqué côté mobile.**

---

## 1. Points à vérifier dans le DispatchModule

### 1.1 — Le mapping Realtime `dispatches → phase` doit inclure tous les statuts

Vérifier que ce mapping existe bien dans votre code Realtime :

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

> Si `en_route_hospital` et `arrived_hospital` ne sont pas dans ce mapping, le dashboard ne réagira pas quand le mobile écrit ces statuts.

### 1.2 — Le mapping Realtime `incidents → phase` doit couvrir les mêmes cas

```typescript
const incidentToPhase = {
  dispatched: "deployed",
  en_route: "en_route",
  arrived: "on_scene",
  in_progress: "on_scene",
  en_route_hospital: "en_route_hospital",
  arrived_hospital: "arrived_hospital",
  ended: "mission_end",
  resolved: "resolved",
};
```

---

## 2. Vérification du `handleAdvancePhase`

Quand l'**opérateur web** avance manuellement la phase, vérifier que chaque phase écrit les bons statuts dans les 3 tables :

| Phase Dashboard | `dispatches.status` | `incidents.status` | `units.status` |
|---|---|---|---|
| `en_route_hospital` | `en_route_hospital` | `en_route_hospital` | `en_route` |
| `arrived_hospital` | `arrived_hospital` | `arrived_hospital` | `on_scene` |
| `mission_end` | `completed` + `completed_at` | `ended` | `available` |
| `resolved` | `completed` + `completed_at` | `resolved` + `resolved_at` | `available` |

> **Point d'attention** : `en_route_hospital` remet `units.status` à `en_route` (pas un nouveau statut), et `arrived_hospital` remet à `on_scene`.

---

## 3. Trigger Supabase à mettre à jour (si possible)

### `sync_rescuer_to_unit` — Ne gère pas `en_route_hospital`

Le trigger actuel :
```sql
'active'           → 'available'
'en_intervention'  → 'dispatched'
'en_route'         → 'en_route'
'on_scene'         → 'on_scene'
'offline'          → 'offline'
```

**Problème** : Il n'y a pas de distinction entre :
- `en_route` vers la victime
- `en_route` vers l'hôpital (c'est le même statut `en_route` dans `active_rescuers`)

**Recommandation optionnelle** : Si on veut que le trigger distingue les deux phases, il faudrait soit :
1. Ajouter un statut `en_route_hospital` dans `active_rescuers` (et l'enum)
2. Ou accepter que les deux soient mappées à `en_route` dans `units` (c'est le comportement actuel du dashboard, donc OK)

→ **Verdict : pas de changement requis sur le trigger**, le comportement actuel est cohérent avec ce que fait le `handleAdvancePhase`.

---

## 4. RLS (Row Level Security) — S'assurer que le mobile peut écrire

Le mobile écrit dans 3 tables. Vérifier que les policies RLS autorisent :

### Table `dispatches`
```sql
-- Le secouriste peut UPDATE son dispatch si unit_id = son assigned_unit_id
UPDATE dispatches SET status = 'en_route_hospital' WHERE unit_id = <rescuer_unit_id>
UPDATE dispatches SET status = 'arrived_hospital' WHERE unit_id = <rescuer_unit_id>
```
> Normalement OK si la policy vérifie `unit_id = auth.user().assigned_unit_id` pour tous les statuts sans restriction de valeur.

### Table `incidents`
```sql
-- Le secouriste peut UPDATE l'incident lié à son dispatch
UPDATE incidents SET status = 'en_route_hospital' WHERE id = <incident_id>
UPDATE incidents SET status = 'arrived_hospital' WHERE id = <incident_id>
```
> Vérifier que la policy ne filtre pas les valeurs de `status` autorisées. Si elle ne permet que certains statuts, il faut ajouter `en_route_hospital` et `arrived_hospital` à la whitelist.

### Table `active_rescuers`
> Pas de changement — le mobile écrit déjà `en_route` et `on_scene` qui sont les mêmes valeurs pour les phases hospitalières.

---

## 5. Enum PostgreSQL `incident_status` — Vérifier les valeurs

L'enum doit contenir ces valeurs (vérifier que rien ne manque) :

```sql
-- Valeurs requises :
'new', 'pending', 'dispatched', 'en_route', 'arrived', 'investigating', 
'in_progress', 'en_route_hospital', 'arrived_hospital', 'ended', 'resolved', 'archived'
```

Si `en_route_hospital` ou `arrived_hospital` ne sont pas dans l'enum, le mobile recevra une erreur PostgreSQL quand il essaiera d'écrire ces statuts.

**Vérification SQL** :
```sql
SELECT enum_range(NULL::incident_status);
```

---

## 6. Enum / valeurs `dispatches.status` — Vérifier

Le champ `dispatches.status` est de type TEXT (pas enum), mais vérifier que le code du dashboard accepte bien :

```
'dispatched', 'en_route', 'on_scene', 'en_route_hospital', 'arrived_hospital', 'mission_end', 'completed'
```

---

## 7. Test de synchronisation bidirectionnelle

### Scénario A : Le mobile avance les statuts
1. L'urgentiste accepte → mobile écrit `en_route` dans dispatches + incidents
2. L'urgentiste arrive → `on_scene` + `arrived`
3. L'urgentiste choisit "Transport" → passe par assessment/aid/decision
4. L'urgentiste choisit le véhicule → mobile écrit `en_route_hospital`
5. → **Le dashboard doit passer en phase `en_route_hospital` automatiquement via Realtime**
6. L'urgentiste arrive à l'hôpital → mobile écrit `arrived_hospital` puis `completed`
7. → **Le dashboard doit passer en phase `arrived_hospital` puis `resolved`**

### Scénario B : L'opérateur avance les statuts
1. L'opérateur clique "En route hôpital" sur le dashboard
2. → **L'app mobile doit recevoir le changement via Realtime et passer à l'étape `transport`**
3. L'opérateur clique "Arrivé hôpital"
4. → **L'app mobile doit recevoir et passer à l'étape `closure`**

---

## Résumé des actions pour Lovable

| # | Action | Priorité | Effort |
|---|---|---|---|
| 0 | ⛔ **Modifier la contrainte CHECK `dispatches_status_check`** pour ajouter `en_route_hospital`, `arrived_hospital`, `mission_end` | 🔴 BLOQUANT | 1 min |
| 1 | Vérifier le mapping Realtime `dispatchStatusToPhase` inclut `en_route_hospital` et `arrived_hospital` | 🔴 Critique | 2 min |
| 2 | Vérifier le mapping Realtime `incidentToPhase` inclut les mêmes | 🔴 Critique | 2 min |
| 3 | Vérifier que `handleAdvancePhase` écrit correctement pour phases `en_route_hospital` et `arrived_hospital` | 🟡 Important | 5 min |
| 4 | Vérifier les RLS pour les nouveaux statuts | 🟡 Important | 5 min |
| 5 | Vérifier l'enum `incident_status` contient `en_route_hospital` et `arrived_hospital` | 🔴 Critique | 1 min |
| 6 | Test Realtime bidirectionnel | 🟡 Important | 15 min |
