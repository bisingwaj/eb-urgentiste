# NOTE TECHNIQUE — Architecture Complète des Appels
## Étoile Bleue · Dashboard ↔ Application Mobile Urgentiste (Flutter)

> Document de référence pour l'intégration d'Agora RTC dans l'application mobile Flutter des secouristes/urgentistes. Décrit exhaustivement la gestion des appels telle qu'implémentée côté dashboard, les contrats de données, les Edge Functions disponibles, et les patterns à reproduire côté mobile.

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble)
2. [Credentials et configuration Agora](#2-credentials-agora)
3. [Edge Functions disponibles](#3-edge-functions)
4. [Tables de données impliquées](#4-tables)
5. [Flux d'appels détaillés](#5-flux-appels)
   - 5.1 Appel SOS citoyen → Dashboard
   - 5.2 Appel interne secouriste → Dashboard
   - 5.3 Appel sortant Dashboard → Mobile
   - 5.4 Appel inter-opérateurs (Dashboard ↔ Dashboard)
   - 5.5 Transfert d'appel
6. [Signalisation Realtime](#6-signalisation)
7. [Gestion multi-lignes (useMultiCall)](#7-multi-lignes)
8. [Enregistrement cloud](#8-enregistrement)
9. [Notifications push FCM](#9-push-fcm)
10. [Sonneries et alertes audio](#10-sonneries)
11. [Qualité réseau et reconnexion](#11-resilience)
12. [Transcription temps réel](#12-transcription)
13. [Contrat d'intégration mobile Flutter](#13-contrat-mobile)
14. [Diagrammes de séquence](#14-diagrammes)

---

## 1. Vue d'ensemble

```text
┌─────────────────────────────────────────────────────────────────┐
│                        AGORA RTC CLOUD                          │
│                   (Audio/Video Channels)                         │
│                                                                  │
│   channelName = "SOS-{incidentId}-{timestamp}"                  │
│              ou "op-{callerId}-{calleeId}-{ts}"                 │
└────────┬───────────────────────────────────┬────────────────────┘
         │ WebRTC                            │ WebRTC
         │ (agora-rtc-sdk-ng)                │ (agora_rtc_engine Flutter)
         ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────┐
│   DASHBOARD WEB     │           │   APP MOBILE FLUTTER │
│   (React/Vite)      │           │   (Urgentiste)       │
│                     │           │                      │
│  useMultiCall()     │           │  AgoraService        │
│  useAgora()         │           │  (à implémenter)     │
│  useOperatorCalls() │           │                      │
│  useCallTransfer()  │           │                      │
│  useInternalCalls() │           │                      │
└────────┬────────────┘           └──────────┬───────────┘
         │                                   │
         │   Supabase Realtime (WebSocket)    │
         │   + REST API (Edge Functions)      │
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE BACKEND                             │
│                                                                  │
│  Tables:  call_history, call_queue, incidents,                  │
│           call_recordings, call_transfers, operator_calls,      │
│           call_transcriptions, call_rejections, active_rescuers │
│                                                                  │
│  Edge Functions:  agora-token, agora-recording,                 │
│                   startCloudRecording, stopCloudRecording,      │
│                   send-call-push                                │
│                                                                  │
│  Triggers:  on_incident_created → call_queue auto-insert        │
│             on_call_history_status_change → cleanup cascade     │
│             recalculate_incident_priority (SOS responses)       │
│             validate_operator_claim (anti-race condition)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Credentials et configuration Agora

| Paramètre | Valeur / Source |
|---|---|
| **App ID** (public) | `e2e0e5a6ef0d4ce3b2ab9efad48d62cf` |
| **App Certificate** | Secret serveur (`AGORA_APP_CERTIFICATE`) — jamais exposé côté client |
| **Customer Key** | Secret serveur (`AGORA_CUSTOMER_KEY`) — pour Cloud Recording REST API |
| **Customer Secret** | Secret serveur (`AGORA_CUSTOMER_SECRET`) — pour Cloud Recording REST API |
| **Codec** | VP8 (mode RTC) |
| **SDK Web** | `agora-rtc-sdk-ng` (npm) |
| **SDK Flutter** | `agora_rtc_engine` (pub.dev) — à utiliser côté mobile |
| **Log Level** | 3 (erreurs uniquement en production) |

### Obtention d'un token

Le mobile **NE DOIT JAMAIS** générer de token localement. Il doit toujours appeler l'Edge Function :

```dart
// Flutter — Obtenir un token Agora
final response = await supabase.functions.invoke('agora-token', body: {
  'channelName': channelName,
  'uid': 0,           // 0 = auto-assigné par Agora
  'role': 'publisher', // ou 'subscriber' pour écoute seule
  'expireTime': 3600,  // durée de validité en secondes
});
final token = response.data['token'] as String;
final appId = response.data['appId'] as String;
```

---

## 3. Edge Functions disponibles

### 3.1 `agora-token`

**Rôle** : Génère un token RTC temporaire signé avec le certificat Agora.

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `channelName` | string | Oui | Nom du canal Agora |
| `uid` | number | Non (défaut: 0) | UID Agora (0 = auto) |
| `role` | string | Non (défaut: "publisher") | "publisher" ou "subscriber" |
| `expireTime` | number | Non (défaut: 3600) | Durée de validité en secondes |

**Réponse** :
```json
{
  "token": "007eJx...",
  "appId": "e2e0e5a6ef0d4ce3b2ab9efad48d62cf",
  "channelName": "SOS-abc123-1711628400000",
  "uid": 0,
  "expiresAt": 1711632000
}
```

### 3.2 `agora-recording`

**Rôle** : Gère le cycle de vie de l'enregistrement cloud Agora (acquire → start → stop → query).

| Paramètre | Type | Description |
|---|---|---|
| `action` | string | `"acquire"`, `"start"`, `"stop"`, `"query"` |
| `channelName` | string | Nom du canal |
| `uid` | number | UID (défaut: 0) |
| `resourceId` | string | ID de ressource (retourné par acquire) |
| `sid` | string | Session ID (retourné par start) |
| `mode` | string | Mode d'enregistrement (défaut: "mix") |

### 3.3 `startCloudRecording`

**Rôle** : Wrapper simplifié pour le mobile — fait acquire + start en un seul appel.

```dart
final response = await supabase.functions.invoke('startCloudRecording', body: {
  'channelId': channelName,
  'uid': 0,
  // 'token': optionnel, généré auto si absent
});
final resourceId = response.data['resourceId'];
final sid = response.data['sid'];
```

### 3.4 `stopCloudRecording`

**Rôle** : Arrête l'enregistrement et sauvegarde les métadonnées dans Supabase Storage.

```dart
final response = await supabase.functions.invoke('stopCloudRecording', body: {
  'channelId': channelName,
  'uid': 0,
  'resourceId': resourceId,
  'sid': sid,
});
final fileUrl = response.data['fileUrl'];
```

### 3.5 `send-call-push`

**Rôle** : Envoie une notification push FCM (data message) pour réveiller l'app mobile.

```dart
// Appelé par le DASHBOARD quand un opérateur appelle un citoyen/secouriste
await supabase.functions.invoke('send-call-push', body: {
  'citizen_id': targetAuthUserId,
  'channel_name': channelName,
  'caller_name': 'Opérateur Centre 112',
  'call_id': callHistoryId,
});
```

**Payload FCM reçu côté mobile** :
```json
{
  "type": "incoming_call",
  "callId": "uuid-xxx",
  "channelName": "SOS-abc123-1711628400000",
  "callerName": "Opérateur Centre 112"
}
```

---

## 4. Tables de données impliquées

### 4.1 `call_history` — Journal de tous les appels

C'est la **table maîtresse**. Chaque appel (SOS, interne, sortant) crée une entrée.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `incident_id` | uuid | Lien vers l'incident associé |
| `operator_id` | uuid | Opérateur qui a pris l'appel (NULL = broadcast à tous) |
| `channel_name` | text | **Nom du canal Agora** — clé de liaison critique |
| `call_type` | enum | `incoming`, `outgoing`, `internal` |
| `status` | enum | `ringing`, `active`, `completed`, `missed`, `failed` |
| `caller_name` | text | Nom de l'appelant |
| `caller_phone` | text | Téléphone de l'appelant |
| `citizen_id` | uuid | auth.uid() de l'appelant (pour filtrage Realtime mobile) |
| `role` | text | Rôle de l'appelant (`citoyen`, `secouriste`, `hopital`...) |
| `has_video` | boolean | Appel vidéo ou audio seul |
| `started_at` | timestamp | Début de la sonnerie |
| `answered_at` | timestamp | Moment du décrochage |
| `ended_at` | timestamp | Fin de l'appel |
| `duration_seconds` | integer | Calculé par trigger (answered_at → ended_at) |
| `ended_by` | text | Qui a raccroché (`operator`, `citizen`, `timeout`, `remote_hangup`) |
| `caller_lat/lng` | float | Position GPS de l'appelant |
| `agora_token` | text | Token Agora (optionnel, pour stockage) |
| `triage_data` | jsonb | Données de triage SOS |

**IMPORTANT** : `REPLICA IDENTITY FULL` est activé sur cette table pour permettre le filtrage Realtime par `citizen_id`.

**Transitions de statut** :
```text
ringing → active     (quand l'opérateur décroche)
ringing → missed     (timeout 45s ou rejet)
active  → completed  (raccrochage normal)
active  → missed     (perte de connexion)
```

### 4.2 `call_queue` — File d'attente intelligente

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | Identifiant |
| `incident_id` | uuid | Incident lié |
| `channel_name` | text | Canal Agora |
| `caller_name/phone` | text | Appelant |
| `priority` | text | `critical`, `high`, `medium`, `low` |
| `category` | text | Type d'urgence |
| `assigned_operator_id` | uuid | Opérateur assigné (auto par trigger) |
| `status` | text | `waiting`, `assigned`, `answered`, `completed`, `abandoned` |
| `caller_lat/lng` | float | Position GPS |

**Cycle** : `waiting → assigned (auto) → answered → completed`

Le trigger `on_incident_created` insère automatiquement dans `call_queue` quand un incident est créé avec `status = 'new'`.

Le trigger `auto_assign_queue` distribue les appels aux opérateurs disponibles selon :
- Priorité de l'appel (critical d'abord)
- Charge de l'opérateur (celui avec le moins d'appels actifs)
- Ancienneté du dernier appel (round-robin)
- Maximum 5 appels simultanés par opérateur

### 4.3 `incidents` — Incidents d'urgence

Chaque appel SOS crée un incident. Le `reference` de l'incident **EST** le `channel_name` Agora.

**Format de référence** : `SOS-{incidentId}-{timestamp}` (ex: `SOS-7f3a2b-1711628400000`)

### 4.4 `call_recordings` — Enregistrements audio

| Colonne | Type | Description |
|---|---|---|
| `call_id` | uuid | Référence à call_history.id |
| `file_url` | text | URL publique dans Supabase Storage |
| `file_type` | text | `audio` |
| `duration_seconds` | integer | Durée |
| `agora_resource_id` | text | Resource ID de l'enregistrement cloud |
| `agora_sid` | text | Session ID |
| `channel_name` | text | Canal Agora |
| `incident_id` | uuid | Incident lié |
| `recorded_by` | uuid | Opérateur qui a lancé l'enregistrement |

Stockage : bucket `incidents`, chemin `recordings/{channelName}/{sid}.json` ou `recordings/{channelName}/{sid}_{fileName}`

### 4.5 `call_transfers` — Transferts d'appels

| Colonne | Type | Description |
|---|---|---|
| `from_operator_id` | uuid | Opérateur expéditeur |
| `to_operator_id` | uuid | Opérateur destinataire |
| `call_id` | text | Référence appel |
| `channel_name` | text | Canal Agora à rejoindre |
| `status` | text | `pending`, `accepted`, `rejected`, `cancelled` |
| `context_data` | jsonb | Métadonnées (nom, priorité, type incident) |

### 4.6 `operator_calls` — Appels inter-opérateurs

| Colonne | Type | Description |
|---|---|---|
| `caller_profile_id` | uuid | ID profil de l'appelant (users_directory.id) |
| `callee_profile_id` | uuid | ID profil de l'appelé |
| `channel_name` | text | Canal Agora (format: `op-{caller8}-{callee8}-{ts}`) |
| `call_type` | text | `audio` ou `video` |
| `status` | text | `ringing`, `active`, `ended`, `rejected`, `cancelled` |
| `caller_name` | text | Nom affiché |

### 4.7 `call_rejections` — Audit des rejets

Trace chaque rejet d'appel par opérateur pour supervision.

### 4.8 `call_transcriptions` — Transcription temps réel

| Colonne | Type | Description |
|---|---|---|
| `call_id` | text | Référence call_history |
| `incident_id` | uuid | Incident lié |
| `speaker` | text | `operator` ou `caller` |
| `content` | text | Texte transcrit |
| `is_final` | boolean | Segment final ou partiel |
| `timestamp_ms` | bigint | Horodatage précis |

### 4.9 `active_rescuers` — Télémétrie temps réel

Positions GPS des secouristes actifs. Le trigger `sync_rescuer_to_unit` synchronise automatiquement la position vers la table `units`.

---

## 5. Flux d'appels détaillés

### 5.1 Appel SOS : Citoyen (Mobile) → Dashboard

```text
MOBILE CITOYEN                    SUPABASE                         DASHBOARD
────────────────                  ────────                         ─────────
1. Bouton SOS pressé
2. INSERT incidents               ──→ Trigger on_incident_created
   (type, reference=channelName,       └→ INSERT call_queue (status=waiting)
    citizen_id, lat/lng)                └→ auto_assign_queue()
                                            └→ UPDATE call_queue (assigned)
3. INSERT call_history            ──→ Realtime INSERT event
   (status=ringing, channel_name,       │
    citizen_id, role='citoyen',         ▼
    call_type='incoming')         useInternalIncomingCalls détecte
                                  └→ Sonnerie sirène critique
                                  └→ Overlay d'appel entrant
4. Obtenir token Agora
   (invoke agora-token)
5. Rejoindre canal Agora
   (createClient + join)

                                                              OPÉRATEUR DÉCROCHE :
                                                              6. UPDATE call_history
                                                                 (status=active,
                                                                  operator_id=self,
                                                                  answered_at=now)
                                                              7. useMultiCall.startLine()
                                                                 └→ fetchToken()
                                                                 └→ client.join()
                                                                 └→ publish audioTrack

═══ AUDIO/VIDEO BIDIRECTIONNEL VIA AGORA ═══════════════════════════════════

RACCROCHAGE (l'un ou l'autre) :
8. UPDATE call_history
   (status=completed,
    ended_at=now,
    ended_by='operator'|'citizen')
   └→ Trigger on_call_history_status_change
       └→ UPDATE call_queue (completed)
       └→ UPDATE incidents (ended)
```

### 5.2 Appel interne : Secouriste (Mobile) → Dashboard

```text
MOBILE SECOURISTE                 SUPABASE                         DASHBOARD
──────────────────                ────────                         ─────────
1. Bouton "Appeler le centre"
2. INSERT call_history            ──→ Realtime INSERT event
   (call_type='internal',              │
    role='secouriste',                 ▼
    status='ringing',             useInternalIncomingCalls
    operator_id=NULL,             └→ BROADCAST à TOUS les opérateurs
    channel_name=unique)          └→ Sonnerie ping Sol5-Mi5
                                  └→ Overlay chez tous les opérateurs
3. Obtenir token Agora
4. Rejoindre canal                                           PREMIER OPÉRATEUR :
                                                              5. "Claiming" optimiste :
                                                                 UPDATE call_history
                                                                 WHERE status='ringing'
                                                                 SET operator_id=self,
                                                                     status='active'
                                                                 └→ SELECT id (vérifier succès)
                                                              6. Si succès : startLine()
                                                              7. Si échec : "Déjà pris"
                                                                 └→ Dismiss overlay
TIMEOUT 45s sans réponse :
└→ UPDATE call_history
   (status='missed',
    ended_by='timeout')
```

**Mécanisme de claiming** : Le trigger `validate_operator_claim` vérifie que `operator_id` correspond à `auth.uid()` pour empêcher l'usurpation.

### 5.3 Appel sortant : Dashboard → Mobile (Citoyen/Secouriste)

```text
DASHBOARD                         SUPABASE                         MOBILE
─────────                         ────────                         ──────
1. Opérateur clique "Appeler"
2. INSERT call_history
   (call_type='outgoing',
    status='ringing',
    citizen_id=target_auth_id,
    channel_name=unique)
3. invoke send-call-push          ──→ FCM Data Message
   (citizen_id, channel_name)          │    {type: "incoming_call",
                                       │     channelName, callerName}
                                       ▼
                                  4. Mobile reçoit push
                                     └→ Affiche UI d'appel entrant
                                     └→ CallKit / ConnectionService
                                  OU
                                  4b. Mobile écoute Realtime INSERT
                                      sur call_history WHERE
                                      citizen_id=self AND status='ringing'
                                      └→ Affiche UI d'appel entrant

                                                              CITOYEN DÉCROCHE :
                                                              5. UPDATE call_history
                                                                 (status='active',
                                                                  answered_at=now)
                                                              6. Obtenir token Agora
                                                              7. Rejoindre canal
═══ AUDIO BIDIRECTIONNEL ════════════════════════════════════════════════════
```

### 5.4 Appel inter-opérateurs : Dashboard ↔ Dashboard

Utilise la table `operator_calls` (PAS `call_history`) pour la signalisation.

```text
APPELANT                          SUPABASE                    APPELÉ
────────                          ────────                    ──────
1. callOperator()
2. INSERT operator_calls          ──→ Realtime INSERT
   (status='ringing',                  filter: callee_profile_id=eq.X
    channel_name=                      ▼
     'op-{a}-{b}-{ts}')          IncomingOperatorCallOverlay
                                  └→ Sonnerie arpège Do5-Mi5-Sol5

                                                          3. answerCall()
                                                             UPDATE operator_calls
                                                             (status='active')
                                                          4. Appelé : joinAudio(channelName)

5. Realtime UPDATE détecté
   (status='active')
6. Appelant : joinAudio(channelName)

═══ AUDIO/VIDEO BIDIRECTIONNEL ══════════════════════════════════════════════
```

### 5.5 Transfert d'appel

```text
OPÉRATEUR A (expéditeur)          SUPABASE                    OPÉRATEUR B (destinataire)
────────────────────────          ────────                    ────────────────────────────
1. initiateTransfer()
   └→ Met la ligne en hold
2. INSERT call_transfers          ──→ Realtime INSERT
   (status='pending',                  filter: to_operator_id=eq.B
    channel_name, context_data)        ▼
                                  IncomingTransferOverlay
                                  └→ Affiche contexte + sonnerie

                                                          3a. acceptTransfer()
                                                              UPDATE call_transfers
                                                              (status='accepted')
                                                          3b. B rejoint le canal Agora
                                                              (même channelName)
4. Realtime UPDATE détecté
   (status='accepted')
5. A quitte le canal (endLine)
   └→ Toast "Transfert accepté"

OU si refusé :
                                                          3c. rejectTransfer()
                                                              UPDATE (status='rejected')
4'. A reprend la ligne (resume)
    └→ Toast "Transfert refusé"
```

---

## 6. Signalisation Realtime

### Canaux écoutés par le Dashboard

| Canal | Table | Événement | Filtre serveur | Usage |
|---|---|---|---|---|
| `call-queue-rt-singleton` | `call_queue` | `*` | aucun | File d'attente globale (singleton partagé) |
| " | `call_history` | `UPDATE` | aucun | Détection fin d'appel (completed/missed) |
| `internal-calls-typed-{uid}` | `call_history` | `INSERT/UPDATE` | `call_type=eq.internal` | Appels internes des secouristes |
| `internal-calls-mobile-{uid}` | `call_history` | `INSERT/UPDATE` | aucun (filtré client-side par `role`) | Appels mobiles non-internal |
| `operator-calls-incoming-{uid}` | `operator_calls` | `INSERT` | `callee_profile_id=eq.{id}` | Appels inter-opérateurs entrants |
| " | `operator_calls` | `UPDATE` | aucun | Changement de statut (réponse/fin) |
| `call-transfers-all-{uid}` | `call_transfers` | `INSERT` | `to_operator_id=eq.{id}` | Transferts entrants |
| " | `call_transfers` | `UPDATE` | aucun | Réponse aux transferts |

### Canaux à écouter côté Mobile Urgentiste

```dart
// 1. Appels entrants (outgoing du dashboard vers ce secouriste)
supabase.channel('mobile-incoming-calls')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'call_history',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'citizen_id',  // = auth.uid() du secouriste
      value: myAuthUserId,
    ),
    callback: (payload) {
      final call = payload.newRecord;
      if (call['status'] == 'ringing' && call['call_type'] == 'outgoing') {
        // Afficher l'UI d'appel entrant
        showIncomingCallScreen(call);
      }
    },
  )
  .onPostgresChanges(
    event: PostgresChangeEvent.update,
    schema: 'public',
    table: 'call_history',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'citizen_id',
      value: myAuthUserId,
    ),
    callback: (payload) {
      final call = payload.newRecord;
      if (['completed', 'missed', 'failed'].contains(call['status'])) {
        // Fermer l'UI d'appel
        dismissCallScreen();
      }
    },
  )
  .subscribe();

// 2. Dispatches (nouvelles missions assignées)
supabase.channel('mobile-dispatches')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'dispatches',
    callback: (payload) {
      final dispatch = payload.newRecord;
      if (dispatch['unit_id'] == myUnitId) {
        showNewMissionNotification(dispatch);
      }
    },
  )
  .subscribe();
```

---

## 7. Gestion multi-lignes (useMultiCall)

Le dashboard supporte **jusqu'à 3 appels simultanés** par opérateur.

### Architecture

- Chaque ligne possède un `IAgoraRTCClient` **indépendant** (pas un client partagé)
- Un seul appel est "active" (audio non muté) à la fois
- Les autres sont automatiquement mis en "on_hold" (audioTrack.setEnabled(false))

### Catégories d'appels

| Catégorie | Description | Format channelName |
|---|---|---|
| `sos` | Appels d'urgence citoyens | `SOS-{incidentId}-{timestamp}` |
| `internal` | Appels inter-opérateurs | `op-{callerId8}-{calleeId8}-{ts}` |
| `field` | Appels terrain (secouristes) | `SOS-{incidentId}-{timestamp}` |
| `outbound` | Appels sortants vers citoyens | `SOS-{incidentId}-{timestamp}` |

### Cycle de vie d'une ligne

```text
ringing → connecting → active ←→ on_hold → ended
                         │
                         └→ Auto-hangup si remoteUsers.length === 0 (après 3s)
```

### Configuration audio Agora

```javascript
{
  AEC: true,   // Annulation d'écho
  AGC: true,   // Contrôle automatique du gain
  ANS: true,   // Suppression du bruit
  encoderConfig: {
    sampleRate: 48000,
    stereo: false,
    bitrate: 64
  }
}
```

**Configuration Flutter équivalente** :
```dart
await engine.setAudioProfile(
  profile: AudioProfileType.audioProfileMusicHighQualityStereom,
  scenario: AudioScenarioType.audioScenarioChatroom,
);
await engine.enableAudioVolumeIndication(
  interval: 200,
  smooth: 3,
  reportVad: true,
);
```

---

## 8. Enregistrement cloud

### Flux simplifié (recommandé pour le mobile)

```dart
// 1. Démarrer l'enregistrement
final startRes = await supabase.functions.invoke('startCloudRecording', body: {
  'channelId': channelName,
});
final resourceId = startRes.data['resourceId'];
final sid = startRes.data['sid'];

// 2. L'enregistrement tourne côté Agora Cloud...

// 3. Arrêter l'enregistrement
final stopRes = await supabase.functions.invoke('stopCloudRecording', body: {
  'channelId': channelName,
  'uid': 0,
  'resourceId': resourceId,
  'sid': sid,
});
final fileUrl = stopRes.data['fileUrl'];

// 4. Persister dans call_recordings
await supabase.from('call_recordings').insert({
  'call_id': callHistoryId,
  'file_url': fileUrl,
  'file_type': 'audio',
  'duration_seconds': durationInSeconds,
  'agora_resource_id': resourceId,
  'agora_sid': sid,
  'channel_name': channelName,
  'incident_id': incidentId,
  'recorded_by': myAuthUserId,
});
```

### Configuration de l'enregistrement

- **Mode** : `mix` (tous les participants dans un seul fichier)
- **Stream** : audio uniquement (`streamTypes: 0`)
- **Idle timeout** : 300 secondes (5 min sans activité → arrêt auto)
- **Qualité** : `audioProfile: 1` (haute qualité)
- **Stockage** : bucket Supabase `incidents`, chemin `recordings/{channelName}/{sid}`

---

## 9. Notifications push FCM

### Architecture

```text
DASHBOARD                         EDGE FUNCTION                    MOBILE
─────────                         ─────────────                    ──────
Opérateur appelle                 send-call-push
un citoyen/secouriste             │
  │                               ├→ SELECT fcm_token FROM
  │                               │   users_directory
  │                               │   WHERE auth_user_id = target
  │                               │
  │                               ├→ JWT signé (service account)
  │                               │   → OAuth2 access_token
  │                               │
  │                               └→ POST FCM v1
  │                                    {token, data: {              ──→ Data Message reçu
  │                                      type: "incoming_call",         │
  │                                      callId, channelName,           ▼
  │                                      callerName                CallKit / ConnectionService
  │                                    }}                           └→ UI d'appel natif
```

### Enregistrement du token FCM (côté mobile)

```dart
// Au démarrage et à chaque refresh du token
final fcmToken = await FirebaseMessaging.instance.getToken();
await supabase.from('users_directory').update({
  'fcm_token': fcmToken,
}).eq('auth_user_id', supabase.auth.currentUser!.id);

// Écouter les changements de token
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  await supabase.from('users_directory').update({
    'fcm_token': newToken,
  }).eq('auth_user_id', supabase.auth.currentUser!.id);
});
```

---

## 10. Sonneries et alertes audio

Le dashboard utilise des **oscillateurs Web Audio API** (pas de fichiers audio) avec des signatures différenciées par rôle :

| Rôle appelant | Pattern sonore | Fréquences | Intervalle |
|---|---|---|---|
| `citoyen` | Sirène critique (sawtooth alternée) | 880 Hz / 660 Hz | 1.2s |
| `secouriste` / `volontaire` | Bip rapide haute priorité (sine) | 740 Hz × 3 | 1.8s |
| `hopital` | Tonalité douce descendante (sine) | 800 Hz → 600 Hz | 2.5s |
| `call_center` / `admin` | Arpège Skype-style (sine) | C5-E5-G5-C6 | 2.0s |
| Appel sortant (dial tone) | Bip simple 440 Hz | 440 Hz | 3.0s |

**Côté mobile** : Utiliser les sonneries système nationales via CallKit (iOS) ou ConnectionService (Android).

---

## 11. Qualité réseau et reconnexion

### Dashboard (useMultiCall)

- **Reconnexion automatique** avec backoff exponentiel : 1s → 2s → 4s → 8s → 10s (max 5 tentatives)
- **Auto-hangup** : si `remoteUsers.length === 0` pendant 3 secondes, raccrochage automatique
- **Monitoring réseau** : événement `network-quality` toutes les 2s (uplink/downlink quality 0-5)
- **Détection déconnexion** : événement `connection-state-change` (DISCONNECTED → tentative reconnexion)

### Dashboard (useAgora — contexte global)

- 3 tentatives de reconnexion avec délais [1s, 3s, 7s]
- Republication automatique des tracks audio après reconnexion
- État `reconnecting` exposé pour l'affichage UI

### Recommandation mobile Flutter

```dart
engine.registerEventHandler(RtcEngineEventHandler(
  onConnectionStateChanged: (connection, state, reason) {
    if (state == ConnectionStateType.connectionStateDisconnected) {
      // Lancer reconnexion avec backoff
      _attemptReconnect(channelName, attempt: 0);
    }
  },
  onNetworkQuality: (connection, remoteUid, txQuality, rxQuality) {
    // Afficher indicateur de qualité réseau
    updateNetworkIndicator(txQuality, rxQuality);
  },
  onUserLeft: (connection, remoteUid, reason) {
    if (engine.remoteUsers.isEmpty) {
      // Auto-hangup après 3s si personne
      Future.delayed(Duration(seconds: 3), () {
        if (engine.remoteUsers.isEmpty) hangup();
      });
    }
  },
));
```

---

## 12. Transcription temps réel

Le dashboard utilise **ElevenLabs Scribe** pour la transcription bidirectionnelle en temps réel.

- L'Edge Function `elevenlabs-scribe-token` fournit un token d'accès WebSocket
- Deux flux capturés simultanément :
  - **Opérateur** : micro local
  - **Appelant** : audio distant Agora (via `remoteUser.audioTrack`)
- Les segments sont persistés dans `call_transcriptions` avec attribution du locuteur

**Côté mobile** : Ce service est optionnel. Si souhaité, implémenter la capture du `MediaRecorder` sur le flux Agora et envoyer à l'API ElevenLabs, ou simplement utiliser la transcription côté dashboard uniquement.

---

## 13. Contrat d'intégration mobile Flutter

### Checklist d'implémentation

| Fonctionnalité | Priorité | Méthode |
|---|---|---|
| Obtenir un token Agora | **CRITIQUE** | `supabase.functions.invoke('agora-token')` |
| Rejoindre un canal audio | **CRITIQUE** | `engine.joinChannel(token, channelName, uid: 0)` |
| Insérer dans `call_history` | **CRITIQUE** | `supabase.from('call_history').insert(...)` |
| Mettre à jour le statut | **CRITIQUE** | `supabase.from('call_history').update(...)` |
| Écouter les appels entrants | **CRITIQUE** | Realtime sur `call_history` filtré par `citizen_id` |
| Enregistrer le FCM token | **HAUTE** | `supabase.from('users_directory').update(...)` |
| Gérer le push `incoming_call` | **HAUTE** | FCM Data Message → CallKit/ConnectionService |
| Enregistrement cloud | **MOYENNE** | `startCloudRecording` + `stopCloudRecording` |
| Monitoring réseau | **MOYENNE** | `onNetworkQuality` callback |
| Reconnexion automatique | **HAUTE** | Backoff exponentiel sur `onConnectionStateChanged` |
| Auto-hangup si seul | **MOYENNE** | Timer 3s après `onUserLeft` si `remoteUsers.isEmpty` |

### INSERT call_history depuis le mobile

```dart
// Quand le secouriste appelle le centre
await supabase.from('call_history').insert({
  'channel_name': 'SOS-${incidentId}-${DateTime.now().millisecondsSinceEpoch}',
  'call_type': 'internal',
  'status': 'ringing',
  'caller_name': myProfile.fullName,
  'caller_phone': myProfile.phone,
  'citizen_id': supabase.auth.currentUser!.id,
  'role': 'secouriste',  // IMPORTANT : permet au dashboard de différencier
  'has_video': false,
  'caller_lat': currentPosition.latitude,
  'caller_lng': currentPosition.longitude,
  'started_at': DateTime.now().toUtc().toIso8601String(),
  // operator_id: NULL → broadcast à tous les opérateurs
});
```

### Répondre à un appel entrant (push ou Realtime)

```dart
// 1. Mettre à jour call_history
await supabase.from('call_history').update({
  'status': 'active',
  'answered_at': DateTime.now().toUtc().toIso8601String(),
}).eq('id', callId);

// 2. Obtenir le token Agora
final tokenRes = await supabase.functions.invoke('agora-token', body: {
  'channelName': channelName,
  'uid': 0,
  'role': 'publisher',
});
final token = tokenRes.data['token'];

// 3. Rejoindre le canal
await engine.joinChannel(
  token: token,
  channelId: channelName,
  uid: 0,
  options: ChannelMediaOptions(
    channelProfile: ChannelProfileType.channelProfileCommunication,
    clientRoleType: ClientRoleType.clientRoleBroadcaster,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  ),
);
```

### Raccrocher

```dart
// 1. Quitter Agora
await engine.leaveChannel();

// 2. Mettre à jour la base
await supabase.from('call_history').update({
  'status': 'completed',
  'ended_at': DateTime.now().toUtc().toIso8601String(),
  'ended_by': 'rescuer',
  'duration_seconds': elapsedSeconds,
}).eq('id', callId).inFilter('status', ['ringing', 'active']);
```

---

## 14. Diagrammes de séquence

### Appel complet Secouriste → Centre de Commandement

```text
Temps  SECOURISTE (Flutter)              SUPABASE                    DASHBOARD (React)
───────────────────────────────────────────────────────────────────────────────────────
  0s   Bouton "Appeler le centre"
       │
  0.1s INSERT call_history ─────────────→ Realtime INSERT ──────────→ useInternalIncomingCalls
       (status:ringing,                                               └→ Sonnerie ping
        call_type:internal,                                           └→ Overlay broadcast
        role:secouriste,
        operator_id:NULL)
       │
  0.3s invoke agora-token ──────────────→ agora-token EF
       │                                  └→ buildTokenWithUid()
  0.5s ←── token reçu
       │
  0.7s engine.joinChannel(token)
       │
       │                                                              OPÉRATEUR DÉCROCHE :
  3.0s                                  ←── UPDATE call_history ←──── answerInternalCall()
                                            (status:active,            (claiming optimiste)
                                             operator_id:opId)
                                                                      │
                                                                  3.2s invoke agora-token
                                                                  3.4s startLine(call)
                                                                       └→ client.join()
                                                                       └→ publish(audioTrack)
       │
  3.5s ══════════════ AUDIO BIDIRECTIONNEL AGORA ═══════════════════════
       │
 60.0s Secouriste raccroche
       │
 60.1s engine.leaveChannel() ───────────→ UPDATE call_history
                                          (status:completed,
                                           ended_at:now,
                                           ended_by:rescuer)
                                          │
                                          └→ Trigger on_call_history_status_change
                                              └→ UPDATE call_queue (completed)
                                                                      │
                                                                 60.3s user-left event
                                                                       └→ Auto cleanup
                                                                       └→ endLineInternal()
```

---

## Annexe : Résumé des RLS pertinentes

| Table | Rôle `secouriste` | Rôle `hopital` | Rôle `citoyen` |
|---|---|---|---|
| `call_history` | SELECT, INSERT, UPDATE (own) | SELECT, INSERT, UPDATE (own) | SELECT, INSERT, UPDATE (own) |
| `call_queue` | SELECT | SELECT | — |
| `incidents` | SELECT, INSERT, UPDATE (assigned) | SELECT | SELECT, INSERT |
| `call_recordings` | SELECT | SELECT | — |
| `call_transcriptions` | SELECT | SELECT | — |
| `active_rescuers` | SELECT, INSERT, UPDATE (own), DELETE (own) | — | — |

---

*Document généré le 2026-04-04 — Version 1.0*
*Projet Étoile Bleue · Centre de Commandement des Urgences de Kinshasa*
