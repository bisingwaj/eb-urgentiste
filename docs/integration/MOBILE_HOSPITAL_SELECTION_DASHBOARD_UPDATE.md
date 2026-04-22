# 📱 Note aux équipes mobiles — Alignement Dashboard sur la sélection hôpital par l'urgentiste

> **Date** : Avril 2026
> **Audience** : Équipes Flutter (App Urgentiste, App Hôpital)
> **Réf.** : `lovable_hospital_selection.md` (sélection manuelle de l'hôpital côté mobile)
> **Statut** : ✅ Déployé côté Dashboard opérateur

---

## 1. Contexte

Suite à la mise en place de la **sélection manuelle de l'hôpital par l'urgentiste depuis l'application mobile** (cf. `lovable_hospital_selection.md`), le **Dashboard opérateur** a été aligné pour respecter ce nouveau flux. L'opérateur n'affecte plus de structure sanitaire — c'est désormais l'urgentiste sur le terrain qui prend la décision.

Cette note décrit **ce qui a changé côté Dashboard** afin que les équipes mobile sachent à quoi s'attendre dans le contrat d'intégration, et puissent **conserver leur logique en l'état** (aucun changement requis côté mobile).

---

## 2. Ce qui a changé côté Dashboard

### 2.1 Module Dispatch (`DispatchModule`)
- ❌ **Supprimé** : bouton **« Assigner & Envoyer »** sur les structures sanitaires.
- ✅ **Ajouté** : bandeau d'information indiquant que la sélection de l'hôpital est **déléguée à l'urgentiste sur le terrain** durant la phase de transport.
- ✅ Pour chaque structure listée, libellé : *« Sélection par l'urgentiste sur le terrain »*.
- ✅ L'opérateur conserve la **visibilité** sur la structure choisie une fois que l'urgentiste l'a sélectionnée (lecture du `assigned_structure_*` dans `dispatches`).

### 2.2 Module Structures Sanitaires (`StructuresModule`)
L'opérateur passe en **lecture seule** sur ce module :

| Action | Avant | Après |
|---|---|---|
| Voir la liste & la carte | ✅ | ✅ |
| Voir les détails (lits, équipements, GPS, contact) | ✅ | ✅ |
| Créer une nouvelle structure | ✅ | ❌ Réservé Admin |
| Modifier une structure | ✅ | ❌ Réservé Admin |
| Supprimer une structure | ✅ | ❌ Réservé Admin |
| Générer / réinitialiser les accès application | ✅ | ❌ Réservé Admin |

Affichage : badge **« Lecture seule »** en lieu et place du bouton « Nouvelle Structure ».

> ℹ️ La gestion des comptes hôpital (création, accès, PIN) reste pilotée par les rôles **admin** / **superviseur**, pas par l'opérateur de la centrale.

---

## 3. Contrat d'intégration — inchangé pour le mobile

Le mobile **continue d'écrire** dans `dispatches` exactement comme décrit dans `lovable_hospital_selection.md`. Aucun champ n'a été déplacé ou renommé.

### 3.1 Côté App Urgentiste (Flutter)
Le flux reste **strictement identique** :

1. Récupérer la liste des structures où `is_open = true` dans `health_structures`.
2. Calculer la distance (Haversine) depuis la position GPS de l'urgentiste.
3. Lors de la sélection, mettre à jour la ligne `dispatches` avec :
   - `assigned_structure_id`
   - `assigned_structure_name` (snapshot)
   - `assigned_structure_lat` / `assigned_structure_lng`
   - `assigned_structure_phone`
   - `hospital_status = 'pending'`
   - `hospital_notes = NULL`
   - `updated_at = NOW()`
4. Écouter via **Supabase Realtime** la transition `pending → accepted | refused`.

➡️ **Aucune modification requise côté App Urgentiste.**

### 3.2 Côté App Hôpital (Flutter)
- L'hôpital reçoit la demande quand `hospital_status = 'pending'` sur un dispatch dont `assigned_structure_id` correspond à sa structure liée.
- L'hôpital répond via `hospital_status = 'accepted' | 'refused'` (avec `hospital_notes` en cas de refus).
- La fiche structure reste éditable selon les règles décrites dans `HOSPITAL_APP_UPDATE_STRUCTURE.md` (champs administratifs verrouillés, champs opérationnels éditables : `is_open`, `available_beds`, `capacity`, `specialties`, `equipment`, etc.).

➡️ **Aucune modification requise côté App Hôpital.**

---

## 4. Synchronisation Realtime — confirmation

Le Dashboard reste abonné à `dispatches` et reflète en temps réel les changements opérés depuis le mobile :

| Événement mobile | Effet visible côté Dashboard |
|---|---|
| Urgentiste sélectionne un hôpital (`pending`) | Apparition de la structure choisie dans la fiche dispatch (badge orange « En attente d'acceptation ») |
| Hôpital accepte (`accepted`) | Badge vert « Acceptée » + structure verrouillée sur la timeline |
| Hôpital refuse (`refused`) | Badge rouge avec `hospital_notes` ; l'urgentiste peut re-sélectionner |
| Urgentiste change d'avis avant `accepted` | Mise à jour transparente côté Dashboard |

---

## 5. Recommandation auto (Dashboard) — usage informatif

Le Dashboard affiche désormais une **recommandation automatique** d'unité + structure dans le dossier d'appel (composant `DispatchRecommendationCard`, scoring `useDispatchRecommendation`). Cette recommandation est :

- **Purement indicative** pour l'opérateur (aide à la décision en pré-dispatch).
- **N'écrit rien** dans `dispatches`.
- **N'interfère pas** avec la sélection finale faite par l'urgentiste sur le terrain.

➡️ **Aucun impact sur le mobile.** La structure réellement assignée reste celle choisie par l'urgentiste.

---

## 6. Checklist mobile — rien à faire ✅

- [x] Flux de sélection hôpital côté urgentiste : **inchangé**
- [x] Schéma `dispatches` : **inchangé**
- [x] Schéma `health_structures` : **inchangé**
- [x] Realtime sur `dispatches` : **inchangé**
- [x] Workflow `pending → accepted | refused` : **inchangé**
- [x] Édition fiche hôpital (App Hôpital) : **inchangé** (cf. `HOSPITAL_APP_UPDATE_STRUCTURE.md`)

> 🟢 **Aucune action requise côté mobile.** Cette note sert uniquement de confirmation que le Dashboard est désormais aligné sur le nouveau flux mobile.

---

## 7. Contact

Pour toute question sur l'alignement Dashboard ↔ Mobile :
- Référent Dashboard : Équipe PABX Étoile Bleue
- Documents liés :
  - `lovable_hospital_selection.md` (flux mobile original)
  - `HOSPITAL_APP_UPDATE_STRUCTURE.md` (édition fiche hôpital)
  - `DASHBOARD_TO_MOBILE_CALLS.md` (appels centrale → mobile)
