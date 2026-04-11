# Documentation — applications mobiles « Étoile Bleue » (eb-urgentiste)

Application **React Native / Expo** pour la régulation sanitaire : **urgentistes** (unités mobiles) et **structures hospitalières**. Elle s’appuie sur **Supabase** (données, auth, temps réel, stockage, Edge Functions) et sur des services tiers (Mapbox, Agora, FCM).

---

## Table des matières

1. [Vue d’ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Prérequis](#3-prérequis)
4. [Installation et configuration](#4-installation-et-configuration)
5. [Scripts npm](#5-scripts-npm)
6. [Architecture applicative](#6-architecture-applicative)
7. [Rôles et navigation](#7-rôles-et-navigation)
8. [Fonctionnalités par domaine](#8-fonctionnalités-par-domaine)
9. [Backend et données (Supabase)](#9-backend-et-données-supabase)
10. [Build natif et EAS](#10-build-natif-et-eas)
11. [Points d’attention Android / iOS](#11-points-dattention-android--ios)
12. [Structure du dépôt (`src/`)](#12-structure-du-dépôt-src)
13. [Dépannage](#13-dépannage)

---

## 1. Vue d’ensemble

| Élément | Description |
|--------|-------------|
| **Nom package** | `apps-v2` (slug Expo : `apps-v2`) |
| **Identifiants natifs** | `com.eburgentiste.app` (Android & iOS) |
| **UI** | Thème **sombre** imposé (Appearance + System UI) |
| **New Architecture** | Activée (`newArchEnabled`: true) |
| **Point d’entrée JS** | `index.ts` → enregistre les tâches push / Notifee, puis `App.tsx` |

Sans variables **`EXPO_PUBLIC_SUPABASE_URL`** et **`EXPO_PUBLIC_SUPABASE_ANON_KEY`**, l’application affiche un écran **« Configuration manquante »** au lieu de planter silencieusement.

---

## 2. Stack technique

| Domaine | Technologie |
|--------|-------------|
| Framework | **Expo SDK ~54**, **React 19**, **React Native 0.81** |
| Navigation | **@react-navigation** (stack + onglets) |
| Backend | **Supabase** (`@supabase/supabase-js`) — auth, Postgres, Realtime, Storage |
| Cartes | **@rnmapbox/maps** (token `EXPO_PUBLIC_MAPBOX_TOKEN`) |
| Appels audio/vidéo | **react-native-agora** (`EXPO_PUBLIC_AGORA_APP_ID`) |
| Notifications | **expo-notifications**, **@notifee/react-native** (Android : plein écran, canaux) |
| Push entrants | **FCM** — enregistrement token via `usePushTokenRegistration` |
| Stockage local tokens | **expo-secure-store** |
| Polices | **Marianne** (OTF embarqués) |
| Patchs npm | **patch-package** (postinstall) |

---

## 3. Prérequis

- **Node.js** (LTS recommandé)
- **npm**
- Compte **Expo** / **EAS** pour les builds cloud
- Pour Android en local : **Android Studio**, SDK, **NDK 26** (voir [§11](#11-points-dattention-android--ios))
- Pour iOS en local : **Xcode** (macOS)
- Fichier **`.local.env`** (voir [§4](#4-installation-et-configuration)) pour le développement local

---

## 4. Installation et configuration

### 4.1 Cloner et installer

```bash
npm install
```

### 4.2 Variables d’environnement

1. Copier le modèle :

   ```bash
   cp .local.env.example .local.env
   ```

2. Renseigner **`.local.env`** (non versionné) :

| Variable | Rôle |
|----------|------|
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme (client) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Jeton Mapbox (cartes, itinéraires) |
| `EXPO_PUBLIC_AGORA_APP_ID` | Identifiant Agora (appels) |
| `EXPO_PUBLIC_INCIDENT_MEDIA_BUCKET` | *(Optionnel)* Nom du bucket Storage pour les photos terrain (défaut : `incident-media`) |

Le chargement est assuré par **`env-bootstrap.js`** et **`app.config.js`** (Metro / config Expo dynamique).

### 4.3 Builds EAS (cloud)

Le fichier **`.local.env` n’est pas uploadé** sur EAS. Définir les mêmes **`EXPO_PUBLIC_*`** dans le tableau de bord Expo : **Projet → Environment variables** (par profil : preview, production, etc.).

### 4.4 Firebase Android (push)

Pour **`getDevicePushTokenAsync`** et l’enregistrement côté backend, fournir **`google-services.json`** à la racine ou via la config Expo (`android.googleServicesFile`), puis rebuild natif.

---

## 5. Scripts npm

| Script | Usage |
|--------|--------|
| `npm start` | Démarre Metro (Expo) |
| `npm run android` | `expo run:android` — build/run natif Android |
| `npm run ios` | `expo run:ios` |
| `npm run web` | Variante web (limitée pour ce projet) |
| `npm run prebuild:android` | `expo prebuild --platform android --clean` |
| `npm run prebuild:check` | `expo doctor` + `tsc --noEmit` |
| `npm run build:android:preview` | EAS build Android (profil `preview`) |

---

## 6. Architecture applicative

### 6.1 Point d’entrée (`index.ts`)

- Import des modules **push** : `incomingCallBackgroundTask`, `notifeeBackgroundHandler`
- `registerRootComponent(App)`

### 6.2 Hiérarchie des providers (`App.tsx`)

Ordre approximatif (extérieur → intérieur) :

1. **`AuthProvider`** — session Supabase, profil utilisateur, rôle
2. **`MissionProvider`** — mission / dispatch active (urgentiste)
3. **`HospitalProvider`** — contexte hôpital
4. **`AppLockProvider`** — verrouillage app (PIN / biométrie)
5. **`NavigationContainer`**
6. **`CallSessionProvider`** — session d’appel (Agora, etc.)

Composants globaux montés au même niveau que la navigation :

- **`PushTokenRegistration`** — enregistre le token FCM pour les push « appel entrant »
- **`FloatingCallBar`** — barre d’appel flottante
- **`IncomingCallSubscriber`** — logique d’abonnement aux appels
- **`IncomingCallNotificationHandler`** — liaison avec Notifee / notifications
- **`GlobalAlert`** — alertes transverses
- **`AlertAlarmManager`** — alarme mission (urgentiste)
- **`HospitalAlertManager`** — alertes côté hôpital

### 6.3 Navigation

- **Non authentifié** : `RoleSelection` → `Login`
- **Authentifié** :
  - **`hopital`** → `HospitalTabs` (onglets Urgences, Admissions, Paramètres/More, Profil)
  - **autre rôle (urgentiste)** → `MainTabs` (Accueil, Carte, Historique, Profil)

Un **`Stack`** global expose les écrans modaux / secondaires (Signalement, Call Center, détail mission, flux hôpital, etc.) — voir `App.tsx` pour la liste exhaustive des `Stack.Screen`.

---

## 7. Rôles et navigation

| Rôle (profil) | Navigator principal | Contenu typique |
|---------------|---------------------|-----------------|
| Urgentiste | `MainTabs` | Accueil mission, carte live, historique, profil ; accès Signalement, appels, notifications |
| Hôpital | `HospitalTabs` | Tableau de bord urgences, admissions, réglages, profil ; stacks détail cas, triage, etc. |

La distinction est faite dans **`RootNavigator`** selon `profile?.role === 'hopital'`.

---

## 8. Fonctionnalités par domaine

### 8.1 Missions urgentiste (`MissionContext`, `useActiveMission`)

- Chargement du **dispatch** actif pour l’**unité** (`assigned_unit_id` du profil)
- Jointure **`dispatches`** + **`incidents`**
- Mise à jour des statuts : **`updateDispatchStatus`** (table `dispatches`, alignement `incidents`, synchro **`active_rescuers`**)
- **Realtime** sur `dispatches` et `incidents` (position victime, hôpital, médias)
- **`updateMissionDetails`** — notamment évaluation concaténée dans `incidents.description` (comportement actuel)

### 8.2 Écran « Signalement » (mission terrain) — `SignalementScreen`

- Workflow par étapes (réception, route, évaluation, soins, décision, affectation hôpital, transport, clôture)
- Carte Mapbox, itinéraires (Mapbox Directions via `src/lib/mapbox.ts`)
- **Photos terrain** : upload vers Storage bucket (`incident-media` par défaut), URLs stockées dans **`incidents.media_urls`** ; lecture fichier locale via **`expo-file-system/legacy`** (compatibilité Android `content://`)
- Timeline / checklist : stockage local **AsyncStorage** (pas synchronisé comme modèle métier centralisé)

### 8.3 Rapport logistique (panne / incident matériel) — `SignalerProblemeScreen`

- Insertion Supabase dans **`field_reports`** (catégorie, gravité, description, GPS, `user_id`, `unit_id`)

### 8.4 Appels

- **Call Center** / historique (`CallCenterScreen`, `CallHistoryCallsScreen`)
- **Agora** : `CallSessionContext`, services dans `src/services/agoraRtc.ts`, jetons `src/lib/agoraToken.ts`
- Appel victime (PSTN / VoIP) : `rescuerCallCitizen`, contraintes dans `missionVictimCall.ts`

### 8.5 Notifications et push

- **expo-notifications** : canaux, sons personnalisés (`assets/sounds/…`)
- **Notifee** : notifications d’appel Android (plugin custom `plugins/with-notifee-repository`)
- Handlers en tâche de fond : `src/push/notifeeBackgroundHandler.ts`, `incomingCallBackgroundTask.ts`
- Contrat FCM : `src/lib/incomingCallFcmContract.ts`, parsing `parseIncomingCallPayload.ts`

### 8.6 Hôpital

- Tableau de bord, liste admissions, détail cas, triage, prise en charge, suivi, clôture, rapport, historique, stats, paramètres, issues — écrans sous `src/screens/hospital/`
- Contexte **`HospitalContext`** pour l’état partagé côté structure

### 8.7 Sécurité applicative

- **`AppLockContext`** : verrou après ouverture (Face ID / empreinte selon plateforme)
- **`expo-local-authentication`**

---

## 9. Backend et données (Supabase)

L’app consomme notamment (liste non exhaustive, selon le code) :

| Zone | Tables / usage |
|------|----------------|
| Auth | `auth.users`, profils applicatifs liés au profil chargé dans `AuthContext` |
| Missions | `dispatches`, `incidents`, `active_rescuers`, éventuellement vues métier |
| Rapports terrain logistique | `field_reports` |
| Médias | Storage bucket **`incident-media`** (ou nom dans `EXPO_PUBLIC_INCIDENT_MEDIA_BUCKET`), colonne **`incidents.media_urls`** |
| Push | Table / edge **`users_directory`** (ex. `fcm_token`) pour enregistrement token |

Les **politiques RLS** et le schéma exact sont à maintenir côté projet Supabase (souvent gérés par l’équipe « Lovable » / backend).

---

## 10. Build natif et EAS

- Configuration **`eas.json`** : profils `development` (dev client), `preview` (APK interne, auto-incrément version), `production` (AAB)
- **`app.json`** : `version`, `versionCode` Android, plugins (Mapbox, Secure Store, Notifee, notifications, image picker, etc.)
- **`app.config.js`** : fusion avec secrets locaux ; propriété `owner` / `extra.eas.projectId` selon le compte Expo

Après modification des **plugins natifs** (Notifee, notifications, image-picker, etc.), exécuter **`expo prebuild`** ou **`expo run:android`** pour régénérer / compiler le projet natif.

---

## 11. Points d’attention Android / iOS

### Android

- **NDK** : le fichier `android/build.gradle` fixe **`ext.ndkVersion = "26.1.10909125"`** pour éviter des erreurs de lien C++ (`expo-modules-core`, New Architecture) avec **NDK 27** sous Windows.
- Permissions déclarées dans **`app.json`** / manifeste généré : caméra, micro, notifications, plein écran, wake lock, etc.
- **Notifee** : dépôt Maven local référencé dans `android/build.gradle` (`@notifee/react-native/android/libs`).

### iOS

- **Pods** : `npx pod-install` dans `ios/` après ajout de modules natifs
- **UIBackgroundModes** : audio, remote-notification (voir `app.json`)

### Photos terrain

- Sur Android, ne pas s’appuyer sur **`fetch(uri)`** seul pour les fichiers **`content://`** : le code utilise **`expo-file-system/legacy`** pour produire un **`ArrayBuffer`** avant upload Storage.

---

## 12. Structure du dépôt (`src/`)

| Dossier / fichier | Rôle |
|-------------------|------|
| `screens/` | Écrans par rôle (`urgentiste/`, `hospital/`), login, sélection de rôle |
| `navigation/` | Onglets, barre custom, ref navigation |
| `contexts/` | Auth, Mission, Hospital, AppLock, CallSession |
| `components/` | UI partagée, cartes, appels, alertes, splash |
| `hooks/` | Missions, historique, notifications, localisation, push token |
| `lib/` | Supabase, Mapbox, Agora, appels, parsing push, upload photos incident |
| `services/` | Agora RTC, notifications, alarmes |
| `push/` | Tâches et handlers arrière-plan |
| `theme/` | Couleurs, typo, polices |
| `utils/` | Navigation externe, formatage adresses missions |

---

## 13. Dépannage

| Symptôme | Piste |
|----------|--------|
| Écran « Configuration manquante » | Ajouter `EXPO_PUBLIC_SUPABASE_*` en local ou sur EAS |
| Build Android Windows : erreurs `ld.lld` / symboles C++ | Vérifier **NDK 26** dans `android/build.gradle` |
| Photos terrain : upload échoue | Bucket Storage, RLS, colonne `media_urls`, lecture fichier (§11) |
| Push / appels entrants absents | `google-services.json`, FCM, Edge `send-call-push`, token enregistré |
| Carte vide | `EXPO_PUBLIC_MAPBOX_TOKEN` |
| Gradle Notifee | Dépôt `maven` Notifee présent après prebuild |

---

## Historique de ce document

Documentation générée pour le dépôt **eb-urgentiste** (Expo / React Native). À mettre à jour lors de changements majeurs de stack, de navigation ou de contrat Supabase.
