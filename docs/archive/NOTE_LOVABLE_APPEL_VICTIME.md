# Note technique — Appel urgentiste → victime (Supabase + app mobile)

**Destinataire :** Lovable / équipe backend Supabase — **Contexte :** ajouter la possibilité d’**appeler la victime** depuis l’app urgentiste (`eb-urgentiste`), avec la contrainte **uniquement pendant une mission en cours**.

---

## 1. Ce que l’application fait aujourd’hui (vérifié dans le code)

### 1.1 Numéro de téléphone et signalement / mission

- Les missions actives sont chargées via la table **`dispatches`** jointe à **`incidents`** (`MissionContext.tsx`).
- Le téléphone de l’appelant / victime provient de **`incidents.caller_phone`**, exposé côté UI comme `activeMission.caller.phone`.
- Si `caller_phone` est absent en base, l’app affiche **`'-'`** et considère qu’il n’y a **pas de numéro utilisable** pour un appel PSTN.

**Champs incidents utilisés pour l’appelant :** `caller_name`, `caller_phone` (select explicite dans la requête `dispatches` → `incidents`).

### 1.2 « Mission en cours » côté mobile

- Une **mission active** = au moins un dispatch pour l’`unit_id` du secouriste avec un statut dans :  
  `dispatched`, `en_route`, `on_scene`, `en_route_hospital`, `arrived_hospital`, `mission_end` (voir requête dans `MissionContext`).
- L’écran **`MissionActiveScreen`** n’affiche le détail mission (dont le bouton d’appel victime) que si **`activeMission` est non nul**. Sinon l’utilisateur est renvoyé en arrière (« Aucune mission active »).

### 1.3 Appel téléphonique classique (déjà implémenté)

- Sur **`MissionActiveScreen`**, la fonction **`callVictim`** ouvre le composeur téléphonique natif :  
  `Linking.openURL(\`tel:${activeMission.caller.phone}\`)` **uniquement si** le numéro existe et est différent de `'-'`.

Donc aujourd’hui : **appel PSTN vers le numéro saisi côté incident**, **seulement** sur l’écran mission active (donc **mission en cours** au sens dispatch assigné à l’unité).

### 1.4 Ce qui n’existe pas encore

- **Appel applicatif** (Agora / même logique que `rescuer-call-citizen` vers l’**app citoyen**) : **non implémenté** dans ce dépôt. Aucun `supabase.functions.invoke('rescuer-call-citizen')` ni équivalent.
- L’app ne charge **pas** actuellement l’**UUID Auth du citoyen** (`auth.users.id`) dans le modèle `Mission` — seulement `caller_phone` / `caller_name`. Pour un appel **in-app** vers le mobile citoyen, il faut en général ce **`citizen_id`** (ou équivalent) côté `incidents` / API.

---

## 2. Travail attendu côté Supabase (Lovable)

Objectif : permettre au secouriste d’**initier un appel média** (VoIP) vers la victime qui utilise l’app citoyen, en alignement avec **`CALL_SYSTEM_ANALYSIS.md`** / Edge **`rescuer-call-citizen`**.

### 2.1 Données

- S’assurer que **`incidents`** expose de façon fiable l’identité Auth du citoyen **quand il existe** (ex. `citizen_id` UUID = `auth.users.id` du citoyen — **pas** `users_directory.id` si la doc projet dit le contraire).
- Pour les appels **PSTN uniquement**, le numéro reste `caller_phone` ; pour l’app **citoyen**, le routage Realtime / Agora repose sur **`citizen_id`**.

### 2.2 Edge Function `rescuer-call-citizen` (ou équivalent)

- **Input attendu** (cf. doc interne) : au minimum `{ incident_id, citizen_id, call_type? }`.
- **Effet** : `INSERT` dans **`call_history`** avec `status` adapté (ex. `ringing`), `citizen_id` = UUID du citoyen cible, canal Agora / token si prévu.
- **RLS** : autoriser le secouriste authentifié à invoquer la fonction et à insérer/mettre à jour les lignes nécessaires selon les règles métier.

### 2.3 Cohérence avec l’app mobile

- Exposer une **policy** ou **vue** permettant au mobile urgentiste de **lire** `citizen_id` pour l’incident de la mission active (pour passer l’argument à l’Edge Function).
- Optionnel : **trigger** ou logique pour refuser l’appel si le dispatch n’est pas dans un statut « mission ouverte » (aligné sur les statuts côté app listés au §1.2).

### 2.4 Notifications

- Si vous utilisez **`send-call-push`** (FCM) pour réveiller l’app citoyen, documenter le payload attendu par l’app Flutter / citoyen.

---

## 3. Travail attendu dans l’application urgentiste (React Native)

- **Ne pas** proposer l’appel victime (PSTN **et** futur app in-app) hors contexte mission :  
  - UI : boutons sur **`MissionActiveScreen`** (et éventuellement **`SignalementScreen`** uniquement quand une mission est déjà liée au flux, selon UX) — **pas** sur l’accueil sans `activeMission`.
- **PSTN** : déjà conditionné au numéro ; garder la même règle.
- **Nouveau — App in-app** :
  - Bouton du type « Appel vidéo / audio victime (app) » visible seulement si `activeMission` existe **et** si le backend fournit un **`citizen_id`** utilisable **et** (optionnel) statut dispatch dans une liste autorisée.
  - Appeler **`rescuer-call-citizen`** avec `incident_id` + `citizen_id`, puis enchaîner sur le flux Agora (comme documenté pour le citoyen : token dans `call_history`, etc.).
- Étendre le **fetch mission** pour inclure `citizen_id` (ou le nom de colonne retenu) depuis `incidents` si le backend l’ajoute.

---

## 4. Synthèse des règles métier

| Règle | Détail |
|--------|--------|
| Téléphone présent ? | Vient de **`incidents.caller_phone`** ; sinon `'-'` → pas d’appel PSTN. |
| Mission en cours ? | Oui = **`activeMission`** non nul (dispatch actif pour l’unité). L’appel PSTN victime n’est proposé que sur **`MissionActiveScreen`**. |
| Appel in-app victime | **Implémenté côté app** : boutons Audio / Vidéo sur `MissionActiveScreen` si `incidents.citizen_id` est présent → `rescuer-call-citizen` puis `CallCenter` avec token préchargé. Dépend toujours du **backend** (fonction corrigée + validation dispatch + push FCM). |
| Appel centrale | Inchangé : flux **`CallCenterScreen`** / `call_type: internal` (hors périmètre de cette note). |

---

## 5. Fichiers de référence dans ce dépôt

- `src/contexts/MissionContext.tsx` — chargement `caller_phone` / `caller_name` / **`citizen_id`** depuis `incidents`.
- `src/screens/urgentiste/MissionActiveScreen.tsx` — `callVictim` (PSTN) + **VoIP** (`rescuer-call-citizen` → `navigationRef.navigate('CallCenter', { … prefetchedToken })`).
- `src/services/agoraRtc.ts` — `joinAgoraChannel` accepte un token RTC déjà fourni par l’Edge Function.
- `src/navigation/navigationRef.ts` — `prefetchedToken` / `prefetchedAppId` / `prefetchedRtcUid` sur la route `CallCenter`.
- `CALL_SYSTEM_ANALYSIS.md` — architecture appels dont **secouriste → citoyen** et **`rescuer-call-citizen`**.
- `docs/APPELS_MOBILE_ET_DASHBOARD.md` — état d’implémentation mobile vs dashboard.

---

## 6. Alignement avec le plan Lovable (backend)

À traiter **côté Supabase** (hors dépôt mobile) :

- Corriger **`rescuer-call-citizen`** : `getUser()` au lieu de `getClaims()`, validation **dispatch actif** pour l’`incident_id`, option **`send-call-push`**, rôles explicites secouriste / volontaire.
- Le mobile envoie `{ incident_id, citizen_id, call_type: 'audio' | 'video' }` et attend une réponse avec au minimum **`call_id`** (ou `callId`), **`channel_name`**, **`token`**, et optionnellement **`app_id`**, **`uid`**.

---

*Document rédigé pour cadrage Lovable + évolutions mobile — à ajuster si les noms de colonnes ou d’Edge Functions diffèrent sur votre instance Supabase.*
