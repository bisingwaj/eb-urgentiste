# Handoff Lovable — Colonne `units.phone` absente (warning HospitalContext)

**Destinataire :** Lovable / équipe backend Supabase  
**Dépôt client :** `eb-urgentiste` (React Native / Expo)  
**Objectif :** supprimer l’erreur Postgres `column units_1.phone does not exist` **et** documenter la décision (schéma vs app) pour un retour MD de correction.

---

## 1. Symptôme observé (logs mobile)

```
WARN [HospitalContext] dispatches select retry with simpler units embed: column units_1.phone does not exist
```

- Ce n’est **pas** un crash : l’app **réessaie** avec une sélection `units` plus petite et charge quand même les dispatches.
- Le message apparaît à **chaque** `fetchCases` (chargement / refresh / realtime).

---

## 2. Comportement actuel dans le code (référence)

**Fichier :** `src/contexts/HospitalContext.tsx`

1. La requête charge `dispatches` avec une jointure **`units`**.
2. Deux variantes sont essayées **dans l’ordre** :
   - **`UNITS_SELECT_FULL`** — inclut notamment **`phone`** sur `units`.
   - **`UNITS_SELECT_MINIMAL`** — sans `phone` (et sans plusieurs autres colonnes).

Si la première échoue (colonne inexistante), un `console.warn` est émis puis la seconde variante est utilisée.

**Extrait conceptuel :**

```ts
const UNITS_SELECT_FULL = `units (
  id, callsign, type, status, location_lat, location_lng,
  vehicle_type, vehicle_plate, agent_name, battery, heading,
  last_location_update,
  phone   // ← provoque l’erreur si absent en base
)`;
```

---

## 3. Utilisation métier du téléphone « unité » côté app hôpital

**Fichier :** `src/lib/hospitalCaseMapping.ts`

- Le mapping lit d’abord **`d.units.phone`** (embed `units` sur le dispatch).
- **Sinon**, il utilise un **fallback** construit dans `HospitalContext` : requête séparée sur **`users_directory`** avec `select('phone, assigned_unit_id')` filtré par les `unit_id` des dispatches, puis dictionnaire `unitPhoneByUnitId`.

Donc **même sans** `units.phone` dans l’embed, le numéro peut encore être rempli **via les secouristes** (`users_directory.phone` + `assigned_unit_id`), si les données existent.

Champs impactés sur le modèle `EmergencyCase` : entre autres `urgentistePhone`, `unitPhone`.

---

## 4. Travail attendu côté Lovable (à choisir explicitement)

Merci de **répondre dans un fichier Markdown** (ex. `FIX_UNITS_PHONE.md`) avec :

1. **Décision retenue** (une seule des options ci-dessous, ou variante documentée).
2. **Migration SQL** ou **modification schéma** Supabase si applicable.
3. **Impact** : colonnes exposées en RLS / API ; pas de régression sur les jointures `dispatches → units`.
4. **Alignement** : si le nom réel du champ n’est pas `phone` (ex. `contact_phone`), indiquer le nom exact pour mise à jour éventuelle du client.

### Option A — Aligner la base sur l’app (recommandée si le métier veut un téléphone au niveau **unité**)

- Ajouter sur la table **`public.units`** une colonne **`phone`** (type adapté, ex. `text`), nullable ou avec défaut selon règles.
- Renseigner / synchroniser si une source existe déjà ailleurs.
- **Effet attendu :** la première requête (`UNITS_SELECT_FULL`) **réussit**, plus de retry ni de warning pour cette cause.

### Option B — Ne pas ajouter `phone` sur `units` (téléphone uniquement via `users_directory` ou autre table)

- Confirmer par écrit que **`units.phone` n’existera pas**.
- **Côté dépôt mobile** (hors périmètre Lovable sauf accès au même repo) : retirer `phone` de `UNITS_SELECT_FULL` pour éviter le double appel et le bruit de logs — **à faire dans le MD de retour** si Lovable ne modifie pas le client.

### Option C — Nom de colonne différent en base

- Si le téléphone unité existe déjà sous un autre nom (ex. `radio`, `gsm`, `contact_phone`), indiquer le nom exact.
- Soit **vues** / **computed** côté DB, soit **mise à jour du select** côté app pour utiliser ce nom (coordination client).

---

## 5. Critères de validation après correctif

- [ ] Plus de log `column units_1.phone does not exist` au démarrage / refresh hôpital.
- [ ] Les dispatches pour la structure (`assigned_structure_id`) se chargent toujours.
- [ ] Affichage contact unité cohérent (selon stratégie A ou B) sur l’écran détail cas hôpital si applicable.

---

## 6. Informations à renvoyer dans le MD de fix (template)

Lovable peut remplir les sections suivantes :

```markdown
## Décision
(A / B / C + brève justification)

## Changements Supabase
- Migration : ...
- RLS / policies : ...

## Changements client (si applicable)
- Fichiers : ...
- Diff résumé : ...

## Tests effectués
- ...

## Rollback
- ...
```

---

## 7. Contexte Postgres utile

- L’alias `units_1` dans le message d’erreur est l’alias interne PostgREST pour la relation **`units`** dans le `select` imbriqué sur `dispatches`.
- L’erreur **`42703`** (undefined_column) confirme une **incompatibilité schéma / requête**, pas un problème réseau.

---

*Document généré pour handoff Lovable — `eb-urgentiste` — HospitalContext / jointure `dispatches.units`.*
