# Note Lovable — Admission (3 champs) + prise en charge (PEC)

> **Destinataire :** équipe **Lovable / Supabase** (dashboard + schéma)  
> **App mobile de référence :** `eb-urgentiste` (React Native / Expo)  
> **Date :** avril 2026  
> **Documents complémentaires :** [`LOVABLE_INTEGRATION_ADMISSION.md`](LOVABLE_INTEGRATION_ADMISSION.md), [`PROMPT_CURSOR_INTEGRATION_HOSPITAL_DATA.md`](PROMPT_CURSOR_INTEGRATION_HOSPITAL_DATA.md)

---

## 1. Objectif de cette note

**Section A — Admission :** l’app collecte **trois choix obligatoires** (mode d’arrivée, état global, orientation) avant validation. Ces valeurs sont écrites dans **`dispatches.hospital_data`** (JSON fusionné) ; **`dispatches.status`** passe à **`arrived_hospital`** et **`hospital_data.status`** à **`admis`** (`HospitalContext.updateCaseStatus`).

**Section B — Prise en charge :** l’écran `HospitalPriseEnChargeScreen` synchronise **`hospital_data.status`** = **`prise_en_charge`** avec des tableaux JSON **`observations`**, **`exams`**, **`treatments`**, **`timeline`**, plus les champs résumés **`treatment`** et **`notes`** (spec Lovable / dashboard). Le dashboard doit pouvoir les lire tels quels.

**Section C — Monitoring :** l’écran `HospitalMonitoringScreen` appelle **`updateCaseStatus`** avec **`hospital_data.status`** = **`monitoring`** et les clés **`monitoringStatus`** (`amelioration` \| `stable` \| `degradation`), **`monitoringNotes`**, **`transferTarget`** (string ou `null`). `dispatches.status` reste **`arrived_hospital`**. Flux : PEC → bouton « Passer au monitoring patient » → enregistrement → clôture. Contrat détaillé : [`PROMPT_CURSOR_HOSPITAL_PEC_MONITORING.md`](PROMPT_CURSOR_HOSPITAL_PEC_MONITORING.md).

**Ce que nous attendons de Lovable :**

1. **Valider** que le schéma Supabase et le dashboard exposent bien ces trois dimensions (libellés, filtres, exports).
2. **Ajouter** ce qui manque côté base (contraintes, index, vues matérialisées, champs dérivés) si le produit l’exige.
3. **Nous renvoyer un Markdown** (contrat de retour) décrivant : migrations finales, éventuels `CHECK` / enums Postgres, mapping dashboard, et tout changement de nom de clés JSON — pour qu’on aligne le mobile si nécessaire.

---

## 2. Les trois dimensions (contrat exact côté mobile)

Toutes les clés ci-dessous sont **stables** : à ne pas renommer côté backend sans nous prévenir.

### 2.1 Étape 1 — Mode d’arrivée (`arrivalMode`)

Aligné sur le module partagé [`src/lib/transportMode.ts`](src/lib/transportMode.ts) (même logique que le mode de transport côté urgentiste).

| Clé JSON | Libellé UI |
|----------|------------|
| `AMBULANCE` | Ambulance standard |
| `SMUR` | Unité SMUR / Réa |
| `MOTO` | Moto intervention |
| `PERSONNEL` | Transport perso |

**Normalisation à l’import** (données anciennes) : `ambulance` → `AMBULANCE`, `transport_prive` → `PERSONNEL` (`normalizeLegacyTransportMode`).

### 2.2 Étape 2 — État global à l’entrée (`arrivalState`)

| Clé JSON | Libellé UI |
|----------|------------|
| `stable` | Stable |
| `critique` | Critique |
| `inconscient` | Inconscient |

### 2.3 Étape 3 — Orientation / service d’accueil (`admissionService`)

| Clé JSON | Libellé UI |
|----------|------------|
| `urgence_generale` | Urgence générale |
| `trauma` | Traumatologie |
| `pediatrie` | Pédiatrie |

### 2.4 Heure affichée (`arrivalTime`)

- Type actuel : chaîne **`HH:mm`** (locale appareil).
- Colonnes optionnelles déjà prévues côté app : `admission_recorded_at` (UTC), `admission_recorded_by` sur `dispatches` — si vous les exposez, le mobile les remplit à la validation admission.

---

## 3. Payload écrit dans `hospital_data` à la validation

Exemple minimal après fusion :

```json
{
  "status": "admis",
  "arrivalTime": "14:32",
  "arrivalMode": "AMBULANCE",
  "arrivalState": "stable",
  "admissionService": "urgence_generale"
}
```

**Règle :** toujours **fusionner** avec le JSON existant (triage, PEC, etc.), jamais remplacer tout l’objet.

---

## 4. Cohérence avec `dispatches.status`

| Événement | `hospital_data.status` (interne) | `dispatches.status` (terrain) |
|-----------|-----------------------------------|-------------------------------|
| Admission validée | `admis` | `arrived_hospital` |

---

## 5. Prise en charge — clés JSON écrites par le mobile

À chaque sync, **`hospital_data.status`** = **`prise_en_charge`** (le **`dispatches.status`** reste **`arrived_hospital`**, inchangé).

| Clé | Type | Rôle |
|-----|------|------|
| `observations` | `array` | Observations cliniques `{ id, time, text, status }` (`status` : Amélioration / Stable / Aggravation) |
| `exams` | `array` | Examens `{ id, label, status, result?, time }` |
| `treatments` | `array` | Traitements `{ id, name, time, user }` |
| `timeline` | `array` | Fil chronologique `{ id, time, action, user, type, isTreatment? }` (`type` : action, test, medication, status, alert) |
| `treatment` | `string` | Résumé concaténé des noms de traitements (pour le panneau dashboard) |
| `notes` | `string` | Résumé = texte de la **dernière** observation (pour le panneau dashboard) |

**À prévoir côté Lovable :** taille max des tableaux / JSON (les listes peuvent croître) ; indexation ou **vue** pour recherche par `dispatch_id` si besoin reporting.

---

## 6. Monitoring — persisté (aligné Lovable)

À la validation, l’écran [`HospitalMonitoringScreen.tsx`](src/screens/hospital/HospitalMonitoringScreen.tsx) fusionne dans **`hospital_data`** (via `HospitalContext.updateCaseStatus`) :

| Clé | Rôle |
|-----|------|
| `status` | `monitoring` |
| `monitoringStatus` | `amelioration` \| `stable` \| `degradation` |
| `monitoringNotes` | Notes libres |
| `transferTarget` | Libellé structure cible ou `null` si « Aucun transfert » ; saisie libre pour « Autre hôpital » |

Réhydratation : `mapRowToCase` remplit `EmergencyCase.monitoringStatus`, `monitoringNotes`, `transferTarget` pour reprise depuis la liste **Admissions**.

---

## 7. Checklist pour le retour Lovable (Markdown attendu)

Merci de nous renvoyer un fichier Markdown qui précise au minimum :

**Admission (sections 2–4)**  
- [ ] Les trois listes de valeurs sont-elles figées en **enum SQL**, **CHECK**, ou uniquement documentées côté app ?
- [ ] Le dashboard affiche-t-il **mode**, **état**, **service** depuis `hospital_data` (chemins exacts) ?
- [ ] Filtres / statistiques prévus (ex. volume par `admissionService`) : requêtes ou vues recommandées.
- [ ] **RLS** : l’utilisateur `hopital` peut-il **UPDATE** ces champs uniquement pour `assigned_structure_id` = sa structure ?
- [ ] Si vous ajoutez des **colonnes dérivées** (ex. `admission_service` en TEXT sur `dispatches`), indiquer la règle de remplissage et la synchro avec `hospital_data`.
- [ ] Tout **renommage** de clé JSON par rapport au tableau section 2 — pour mise à jour du mobile.

**Prise en charge (section 5)**  
- [ ] Le panneau « Données hôpital » affiche-t-il **`treatment`**, **`notes`**, et idéalement un **aperçu** des listes `observations` / `timeline` ?
- [ ] **Performance** : limites ou pagination recommandées si `timeline` devient très long.
- [ ] Cohérence **Realtime** : les mises à jour `hospital_data` lors des syncs PEC sont-elles bien visibles sans rechargement manuel ?

**Monitoring (section 6)**  
- [ ] Dashboard : affichage **`monitoringStatus`**, **`monitoringNotes`**, **`transferTarget`** en temps réel (Realtime `dispatches`).
- [ ] Cohérence des libellés de transfert interne (Soins intensifs / Chirurgie) avec ce que le mobile envoie.

---

## 8. Références code (équipe mobile)

| Fichier | Rôle |
|---------|------|
| [`src/screens/hospital/HospitalAdmissionScreen.tsx`](src/screens/hospital/HospitalAdmissionScreen.tsx) | UI 3 étapes admission + `updateCaseStatus` |
| [`src/screens/hospital/HospitalPriseEnChargeScreen.tsx`](src/screens/hospital/HospitalPriseEnChargeScreen.tsx) | PEC : observations, examens, traitements, timeline + résumés |
| [`src/screens/hospital/HospitalMonitoringScreen.tsx`](src/screens/hospital/HospitalMonitoringScreen.tsx) | Monitoring **persisté** (`monitoringStatus`, `monitoringNotes`, `transferTarget`, `status: monitoring`) |
| [`src/lib/transportMode.ts`](src/lib/transportMode.ts) | Codes `AMBULANCE` / `SMUR` / `MOTO` / `PERSONNEL` |
| [`src/contexts/HospitalContext.tsx`](src/contexts/HospitalContext.tsx) | `mapRowToCase` (rehydratation `observations`, `exams`, `treatments`, `timeline` depuis `hospital_data`), fusion `updateCaseStatus` |

---

*Document handoff Lovable — admission + PEC + point monitoring. Détail API global : `PROMPT_CURSOR_INTEGRATION_HOSPITAL_DATA.md`.*
