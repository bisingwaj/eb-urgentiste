# 🚀 Plan d'Action — Migration Backend Étoile Bleue (Flutter → React Native)

> **Objectif** : Connecter l'application React Native (Expo) au backend Supabase existant en répliquant 100% des intégrations décrites dans le Guide d'Intégration Mobile.
> **Date** : 1er Avril 2026

---

## 📊 État Actuel du Projet

### Ce qui existe déjà (UI Mock — ✅ Terminé)

| Écran | Fichier | Statut |
|---|---|---|
| Login (Identifiant + PIN) | `src/screens/LoginPage.tsx` | ✅ UI Mock |
| Radar / Garde | `src/screens/RadarTab.tsx` | ✅ UI Mock |
| Télémétrie / Carte | `src/screens/LiveMapTab.tsx` | ✅ UI Mock |
| Historique | `src/screens/HistoryTab.tsx` | ✅ UI Mock |
| Profil | `src/screens/ProfileTab.tsx` | ✅ UI Mock |
| Mission Active | `src/screens/MissionActiveScreen.tsx` | ✅ UI Mock |

### Ce qui manque (Backend — ❌ À faire)

| Fonctionnalité | Priorité | Complexité |
|---|---|---|
| Client Supabase (init + auth) | 🔴 Critique | Faible |
| Authentification (Email/Password secouriste) | 🔴 Critique | Moyenne |
| Authentification (SMS OTP citoyen) | 🟡 Haute | Moyenne |
| GPS temps réel (transmission position) | 🔴 Critique | Haute |
| Realtime (dispatches, appels, incidents) | 🔴 Critique | Haute |
| Mapbox (tuiles dark, marqueurs dynamiques) | 🟡 Haute | Moyenne |
| Agora RTC (audio/vidéo appels) | 🟡 Haute | Très haute |
| Push Notifications (FCM) | 🟡 Haute | Haute |
| Storage (upload avatars, médias incidents) | 🟢 Moyenne | Faible |
| Messagerie temps réel | 🟢 Moyenne | Moyenne |
| Signalements | 🟢 Moyenne | Moyenne |

---

## 🏗️ Architecture Cible

```
src/
├── config/
│   └── supabase.ts              # Client Supabase initialisé
│
├── services/
│   ├── authService.ts            # Login email/password + SMS OTP
│   ├── gpsService.ts             # Transmission GPS (10s secouriste)
│   ├── heartbeatService.ts       # Heartbeat présence (30s)
│   ├── realtimeService.ts        # Listeners Supabase Realtime
│   ├── agoraService.ts           # Agora RTC engine
│   ├── notificationService.ts    # FCM push notifications
│   ├── storageService.ts         # Upload fichiers (avatars, médias)
│   └── messagingService.ts       # Messagerie opérationnelle
│
├── context/
│   ├── AuthContext.tsx            # State auth global (remplace Riverpod)
│   ├── DutyContext.tsx            # État de garde (on/off duty)
│   └── MissionContext.tsx         # Mission en cours + dispatches
│
├── hooks/
│   ├── useAuth.ts                # Hook d'authentification
│   ├── useRealtime.ts            # Hook écoute Realtime
│   ├── useLocation.ts            # Hook GPS
│   └── useMission.ts             # Hook gestion mission
│
├── types/
│   └── database.ts               # Types TypeScript (générés via Supabase)
│
├── screens/                      # (Existant — à connecter)
│   ├── LoginPage.tsx
│   ├── RadarTab.tsx
│   ├── LiveMapTab.tsx
│   ├── HistoryTab.tsx
│   ├── ProfileTab.tsx
│   └── MissionActiveScreen.tsx
│
└── theme/
    └── colors.ts                 # (Existant)
```

---

## 📋 Phases d'Implémentation

---

### 🔵 PHASE 1 — Fondations (Jour 1-2)

> Objectif : Avoir un client Supabase fonctionnel et l'authentification qui marche.

#### 1.1 — Installer les dépendances

```bash
npx expo install @supabase/supabase-js expo-secure-store @react-native-async-storage/async-storage
```

| Package | Rôle | Équivalent Flutter |
|---|---|---|
| `@supabase/supabase-js` | Client Supabase complet | `supabase_flutter` |
| `expo-secure-store` | Stockage sécurisé des tokens | `flutter_secure_storage` |
| `@react-native-async-storage/async-storage` | Stockage persistant | `shared_preferences` |

#### 1.2 — Créer le client Supabase (`src/config/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important pour React Native
  },
});
```

> **Clés depuis `.local.env`** :
> - `EXPO_PUBLIC_SUPABASE_URL` = `https://npucuhlvoalcbwdfedae.supabase.co`
> - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = (déjà défini dans .local.env)

#### 1.3 — Authentification Secouriste (`src/services/authService.ts`)

Le guide (Section 4.2) indique que les secouristes se connectent par **email + mot de passe** :

```typescript
// Login secouriste
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'agent@etoilebleue.cd',
  password: 'motDePasse',
});

// Vérifier must_change_password dans users_directory
const { data: profile } = await supabase
  .from('users_directory')
  .select('*')
  .eq('auth_user_id', data.user.id)
  .single();

if (profile.must_change_password) {
  // Forcer le changement de mot de passe
}
```

**Mapping Flutter → React Native pour LoginPage.tsx** :

| Flutter (login_page.dart) | React Native (LoginPage.tsx) |
|---|---|
| `agent_login_id` (6 chiffres) | Rechercher dans `users_directory` par `agent_login_id` |
| `pin_code` (6 chiffres) | Vérifier `pin_code` dans `users_directory` |
| `supabase.auth.signInWithPassword()` | `supabase.auth.signInWithPassword()` |
| `Riverpod` state | `AuthContext` + `useAuth()` hook |

#### 1.4 — Contexte Auth Global (`src/context/AuthContext.tsx`)

Remplace le `Riverpod` de Flutter :

```typescript
// Fournit : user, profile, isAuthenticated, login(), logout()
// Écoute : supabase.auth.onAuthStateChange()
// Stocke : session persistée via AsyncStorage
```

#### 1.5 — Heartbeat Présence (Section 4.3 du guide)

```typescript
// Timer toutes les 30 secondes
setInterval(async () => {
  await supabase.from('users_directory')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('auth_user_id', userId);
}, 30000);
```

#### 1.6 — Déconnexion Propre (Section 4.4)

```typescript
// 1. Mettre le statut offline
await supabase.from('users_directory')
  .update({ status: 'offline', is_on_call: false })
  .eq('auth_user_id', userId);

// 2. Supprimer de active_rescuers
await supabase.from('active_rescuers')
  .delete()
  .eq('user_id', userId);

// 3. Déconnecter
await supabase.auth.signOut();
```

---

### 🟢 PHASE 2 — GPS & Carte Temps Réel (Jour 3-4)

> Objectif : Afficher la carte Mapbox avec position live du secouriste.

#### 2.1 — Installer les dépendances GPS

```bash
npx expo install expo-location
```

| Package | Rôle | Équivalent Flutter |
|---|---|---|
| `expo-location` | Géolocalisation foreground + background | `geolocator` |

#### 2.2 — Transmission GPS (`src/services/gpsService.ts`)

D'après le guide (Section 8.1), le secouriste transmet sa position toutes les **10 secondes** :

```typescript
// Upsert dans active_rescuers toutes les 10s
await supabase.from('active_rescuers').upsert({
  user_id: userId,
  lat: location.coords.latitude,
  lng: location.coords.longitude,
  accuracy: location.coords.accuracy,
  heading: location.coords.heading,
  speed: location.coords.speed,
  battery: batteryLevel,
  status: 'active',
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id' });
```

#### 2.3 — Mapbox Dark Tiles (Section 9)

Depuis le `.local.env` :
- Token Mapbox : `EXPO_PUBLIC_MAPBOX_TOKEN`
- Style : `mapbox://styles/mapbox/dark-v11`
- Centre Kinshasa : `lat: -4.325, lng: 15.3`
- Zoom : `12`

**Implémentation** via `UrlTile` de `react-native-maps` (déjà en place) :

```typescript
<UrlTile
  urlTemplate={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`}
  maximumZ={19}
/>
```

#### 2.4 — Position de l'unité (Section 12.4)

```typescript
await supabase.from('units').update({
  location_lat: position.latitude,
  location_lng: position.longitude,
  heading: Math.round(position.heading),
  battery: batteryLevel,
  network: networkType,
  last_location_update: new Date().toISOString(),
}).eq('id', unitId);
```

---

### 🟡 PHASE 3 — Realtime & Dispatches (Jour 5-7)

> Objectif : Recevoir les dispatches et incidents en temps réel.

#### 3.1 — Tables Realtime à écouter (Section 7.1)

| Table | Événement | Usage Mobile (Secouriste) |
|---|---|---|
| `dispatches` | INSERT, UPDATE | 🔴 Réception de missions |
| `incidents` | INSERT, UPDATE | 🔴 Suivi incident en cours |
| `messages` | INSERT | 🟡 Messagerie opérationnelle |
| `notifications` | INSERT | 🟡 Alertes système |
| `call_history` | INSERT, UPDATE | 🟡 Appels (si mode citoyen) |
| `operator_calls` | INSERT, UPDATE | 🟢 Appels inter-opérateurs |

#### 3.2 — Écouter les Dispatches (Section 7.3)

```typescript
supabase
  .channel('my-dispatches')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'dispatches',
    filter: `unit_id=eq.${unitId}`,
  }, (payload) => {
    const dispatch = payload.new;
    // Afficher notification + charger l'incident
    loadIncident(dispatch.incident_id);
  })
  .subscribe();
```

#### 3.3 — Cycle de vie d'un dispatch (Section 12.3)

```
dispatched → en_route → arrived → completed
```

Le secouriste met à jour le statut à chaque étape :

```typescript
// Accepter le dispatch
await supabase.from('dispatches')
  .update({ status: 'en_route' })
  .eq('id', dispatchId);

// Arrivée sur site
await supabase.from('dispatches')
  .update({ status: 'arrived', arrived_at: new Date().toISOString() })
  .eq('id', dispatchId);

// Mission terminée
await supabase.from('dispatches')
  .update({ status: 'completed', completed_at: new Date().toISOString() })
  .eq('id', dispatchId);
```

#### 3.4 — Cycle de vie des incidents (Section 12.1)

```
new → dispatched → in_progress → resolved → archived
                       │
                       ├── en_route
                       ├── arrived
                       ├── investigating
                       └── ended
```

---

### 🔴 PHASE 4 — Agora RTC (Jour 8-10)

> Objectif : Audio/vidéo bidirectionnel avec le centre d'appels.

#### 4.1 — Installer le SDK

```bash
npx expo install react-native-agora
```

| Paramètre | Valeur (Section 6.1) |
|---|---|
| **App ID** | `e2e0e5a6ef0d4ce3b2ab9efad48d62cf` (dans `.local.env`) |
| **Token** | Généré via Edge Function `agora-token` |
| **App Certificate** | ⚠️ Côté serveur uniquement |

#### 4.2 — Obtenir un token (Section 5.3)

```typescript
const { data } = await supabase.functions.invoke('agora-token', {
  body: {
    channelName: channelName,
    uid: 0,
    role: 'publisher',
  },
});
// data = { token, appId, channelName, uid, expiresAt }
```

#### 4.3 — Convention de nommage des canaux (Section 6.4)

| Type | Format | Exemple |
|---|---|---|
| SOS citoyen | `SOS-{userId_8chars}-{timestamp}` | `SOS-a1b2c3d4-1711900000` |
| Appel sortant | `outbound-{callHistoryId}` | `outbound-550e8400-e29b...` |
| Inter-opérateurs | `op-call-{operatorCallId}` | `op-call-123e4567-e89b...` |

#### 4.4 — Service Agora (`src/services/agoraService.ts`)

```typescript
// Remplace lib/core/services/agora_rescuer_service.dart
// Fonctions : initialize(), joinChannel(), leaveChannel(), toggleMute()
```

---

### 🟣 PHASE 5 — Notifications Push (Jour 11-12)

> Objectif : Recevoir les alertes FCM même app fermée.

#### 5.1 — Installer

```bash
npx expo install expo-notifications expo-device
```

#### 5.2 — Enregistrer le token FCM (Section 11.2)

```typescript
const token = await Notifications.getExpoPushTokenAsync();
await supabase.from('users_directory')
  .update({ fcm_token: token.data })
  .eq('auth_user_id', userId);
```

#### 5.3 — Traiter les notifications d'appels (Section 11.4)

```typescript
// Data message type = 'incoming_call'
// → Afficher l'interface d'appel entrant
// → Déclencher joinChannel Agora
```

---

### ⚪ PHASE 6 — Fonctionnalités Complémentaires (Jour 13-15)

#### 6.1 — Storage / Upload (Section 10)

| Bucket | Public | Usage |
|---|---|---|
| `avatars` | ✅ | Photos de profil |
| `incidents` | ✅ | Photos/vidéos/audio incidents |

```typescript
// Upload avatar
const { data } = await supabase.storage
  .from('avatars')
  .upload(`${userId}.jpg`, file, { upsert: true });
```

#### 6.2 — Messagerie (Section 13)

```typescript
// Envoyer un message
await supabase.from('messages').insert({
  sender_id: userId,
  recipient_id: recipientId,
  recipient_type: 'operator', // ou 'unit' / 'group'
  content: messageText,
  type: 'text',
});

// Écouter en temps réel
supabase.channel('messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, callback)
  .subscribe();
```

#### 6.3 — Signalements (Section 14)

```typescript
// Créer un signalement avec médias
const reference = `SIG-${Date.now()}`;
await supabase.from('signalements').insert({
  reference,
  category: 'infrastructure',
  title: 'Route endommagée',
  // ...
});
```

---

## 🗂️ Mapping Complet Flutter → React Native

| Concept Flutter | Équivalent React Native |
|---|---|
| `supabase_flutter` | `@supabase/supabase-js` |
| `Riverpod` (state management) | `React Context` + `useReducer` |
| `go_router` (navigation) | `@react-navigation/native-stack` ✅ |
| `geolocator` (GPS) | `expo-location` |
| `agora_rtc_engine` | `react-native-agora` |
| `firebase_messaging` (FCM) | `expo-notifications` |
| `google_maps_flutter` | `react-native-maps` ✅ |
| `mapbox_maps_flutter` | `UrlTile` Mapbox via `react-native-maps` ✅ |
| `flutter_secure_storage` | `expo-secure-store` |
| `shared_preferences` | `@react-native-async-storage` |
| `url_launcher` | `expo-linking` |
| `battery_plus` | `expo-battery` |
| `Timer.periodic()` | `setInterval()` / `useEffect()` |
| `StreamBuilder` | `useEffect` + `useState` + Realtime |
| `ConsumerStatefulWidget` | `functional component` + hooks |

---

## 🔑 Référence Rapide des Enums (Section 15)

| Enum | Valeurs |
|---|---|
| `call_status` | `ringing` → `active` → `completed` / `missed` / `failed` |
| `call_type` | `incoming` / `outgoing` / `internal` |
| `incident_priority` | `critical` / `high` / `medium` / `low` |
| `incident_status` | `new` / `dispatched` / `in_progress` / `resolved` / `archived` / `pending` / `en_route` / `arrived` / `investigating` / `ended` |
| `unit_status` | `available` / `dispatched` / `en_route` / `on_scene` / `returning` / `offline` |
| `user_role` | `citoyen` / `secouriste` / `call_center` / `hopital` / `volontaire` / `superviseur` / `admin` |

---

## ✅ Checklist Globale

### Phase 1 — Fondations
- [ ] Installer `@supabase/supabase-js`, `expo-secure-store`, `async-storage`
- [ ] Créer `src/config/supabase.ts` (client initialisé)
- [ ] Créer `src/context/AuthContext.tsx` (state auth global)
- [ ] Créer `src/services/authService.ts` (login email/password)
- [ ] Connecter `LoginPage.tsx` au vrai auth Supabase
- [ ] Implémenter le heartbeat (30s)
- [ ] Implémenter la déconnexion propre (statut offline)
- [ ] Générer les types TypeScript via `supabase gen types`

### Phase 2 — GPS & Carte
- [ ] Installer `expo-location`
- [ ] Créer `src/services/gpsService.ts` (transmission 10s)
- [ ] Créer `src/hooks/useLocation.ts`
- [ ] Connecter `LiveMapTab.tsx` à la position réelle
- [ ] Connecter `MissionActiveScreen.tsx` au GPS + distance réelle
- [ ] Implémenter auto-arrivée (distance < 50m)

### Phase 3 — Realtime & Dispatches
- [ ] Créer `src/services/realtimeService.ts`
- [ ] Écouter `dispatches` (INSERT) pour réception missions
- [ ] Écouter `incidents` (UPDATE) pour suivi statut
- [ ] Connecter `RadarTab.tsx` au toggle duty réel
- [ ] Connecter `HistoryTab.tsx` aux vrais historiques
- [ ] Implémenter le cycle de vie dispatch dans `MissionActiveScreen`

### Phase 4 — Agora RTC
- [ ] Installer `react-native-agora`
- [ ] Créer `src/services/agoraService.ts`
- [ ] Obtenir token via Edge Function `agora-token`
- [ ] Implémenter joinChannel / leaveChannel / toggleMute
- [ ] Connecter les boutons audio/vidéo de `MissionActiveScreen`

### Phase 5 — Notifications Push
- [ ] Installer `expo-notifications`, `expo-device`
- [ ] Enregistrer le token FCM dans `users_directory`
- [ ] Traiter les Data Messages (type `incoming_call`)
- [ ] Afficher l'UI d'appel entrant

### Phase 6 — Compléments
- [ ] Upload avatar (bucket `avatars`)
- [ ] Upload médias incidents (bucket `incidents`)
- [ ] Messagerie temps réel (table `messages`)
- [ ] Signalements avec médias (table `signalements`)
- [ ] Connecter `ProfileTab.tsx` aux vrais données utilisateur

---

## ⚠️ Points d'Attention Critiques

1. **`citizen_id`** doit toujours être `auth.users.id` (UUID Auth), **PAS** `users_directory.id`
2. **Le `.local.env` ne doit JAMAIS être commité** sur GitHub (`.gitignore` ✅ configuré)
3. **`REPLICA IDENTITY FULL`** est requis sur `call_history` pour le filtrage Realtime
4. **Les Edge Functions** sont appelées via `supabase.functions.invoke()`, pas des appels HTTP directs
5. **Nettoyage obligatoire** à la déconnexion : mettre offline + supprimer `active_rescuers`

---

*Plan d'action généré le 1er Avril 2026 — Projet Étoile Bleue*


