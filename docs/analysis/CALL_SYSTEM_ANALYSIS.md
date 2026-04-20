# Analyse Complète du Système d'Appels — Étoile Bleue

> Document technique destiné aux équipes **mobile** (Flutter citoyen, **React Native secouriste** `eb-urgentiste`) et **dashboard web** pour comprendre l'architecture d'appels côté backend et dashboard.

**Voir aussi (implémentation concrète React Native / Expo secouriste)** : [`docs/APPELS_MOBILE_ET_DASHBOARD.md`](docs/APPELS_MOBILE_ET_DASHBOARD.md) — écrans, Realtime actuellement branché, écarts sur `channel_name` (`OP-` vs `INT-`), et liste des fonctionnalités non encore branchées côté RN.

---

## 1. Vue d'Ensemble — Les 5 Flux d'Appels

Le système gère **5 flux d'appels distincts**, chacun avec sa propre signalisation et ses tables DB :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX D'APPELS                                │
├──────────────────┬──────────────────────────────────────────────────┤
│ 1. SOS Citoyen   │ Mobile citoyen → Dashboard (via call_queue)      │
│ 2. Sortant       │ Dashboard → Mobile citoyen (via call_history)    │
│ 3. Inter-opérat. │ Dashboard ↔ Dashboard (via operator_calls)       │
│ 4. Interne/Mob.  │ Mobile secouriste → Dashboard (via call_history) │
│ 5. Rescuer→Cit.  │ Mobile secouriste → Mobile citoyen (call_history)│
└──────────────────┴──────────────────────────────────────────────────┘
```

**Technologie commune** : Agora RTC SDK (App ID: `e2e0e5a6ef0d4ce3b2ab9efad48d62cf`)

---

## 2. Tables DB Impliquées

### 2.1 `call_history` — Table principale de signalisation

C'est la **table pivot** pour la plupart des flux. L'app mobile doit la surveiller en priorité.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | Identifiant unique de l'appel |
| `channel_name` | text | Nom du canal Agora (format variable selon le flux) |
| `call_type` | enum | `incoming`, `outgoing`, `internal`, `audio`, `video` |
| `status` | enum | `ringing` → `active` → `completed` / `missed` / `failed` |
| `caller_name` | text | Nom de l'appelant |
| `caller_phone` | text | Téléphone de l'appelant |
| `citizen_id` | uuid | `auth.uid()` du citoyen (clé de routage mobile) |
| `operator_id` | uuid | ID du profil opérateur (users_directory.id) |
| `incident_id` | uuid | Référence à l'incident lié |
| `role` | text | Rôle de l'appelant (`secouriste`, `citoyen`, `hopital`...) |
| `has_video` | boolean | Indique si l'appel inclut la vidéo |
| `agora_token` | text | Token Agora pré-généré (pour rescuer→citizen) |
| `agora_uid` | integer | UID Agora à utiliser |
| `started_at` | timestamptz | Début de l'appel |
| `answered_at` | timestamptz | Moment du décrochage |
| `ended_at` | timestamptz | Fin de l'appel |
| `ended_by` | text | Qui a raccroché (`operator`, `citizen`, `timeout`) |
| `duration_seconds` | integer | Calculé automatiquement par trigger |
| `caller_lat/lng` | double | Position GPS de l'appelant |
| `triage_data` | jsonb | Données de triage mobile |

**Statuts possibles** : `ringing`, `active`, `completed`, `missed`, `failed`

**Formats de `channel_name`** :
- SOS citoyen : `SOS-{incident_id}-{timestamp}`
- Sortant : `OUT-{operator_id_short}-{timestamp}`
- Interne secouriste : `INT-{caller_id_short}-{timestamp}`
- Rescuer→Citizen : `RESCUER-{incident_id_short}-{timestamp}`

### 2.2 `call_queue` — File d'attente SOS

Utilisée **uniquement pour les appels SOS entrants** (citoyen → centre).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | ID de l'entrée en file |
| `incident_id` | uuid | Incident source |
| `channel_name` | text | Même channel_name que dans call_history |
| `caller_name` | text | Nom du citoyen |
| `priority` | text | `critical`, `high`, `medium`, `low` |
| `category` | text | Type d'urgence |
| `status` | text | `waiting` → `assigned` → `answered` → `completed` / `abandoned` |
| `assigned_operator_id` | uuid | Opérateur auto-assigné |
| `caller_lat/lng` | double | Position GPS |

**Auto-assignation** : Le trigger `on_incident_created()` insère dans `call_queue`, puis `auto_assign_queue()` distribue aux opérateurs disponibles.

### 2.3 `operator_calls` — Appels inter-opérateurs

Utilisée **uniquement pour les appels entre opérateurs du dashboard** (pas le mobile).

| Colonne | Type | Description |
|---------|------|-------------|
| `caller_profile_id` | uuid | Profil de l'appelant (users_directory.id) |
| `callee_profile_id` | uuid | Profil de l'appelé (users_directory.id) |
| `channel_name` | text | Format `op-{caller_short}-{callee_short}-{ts}` |
| `call_type` | text | `audio` ou `video` |
| `status` | text | `ringing` → `active` → `ended` / `rejected` / `cancelled` |

### 2.4 `call_transfers` — Transferts d'appels

| Colonne | Type | Description |
|---------|------|-------------|
| `from_operator_id` | uuid | Expéditeur |
| `to_operator_id` | uuid | Destinataire |
| `channel_name` | text | Canal Agora à rejoindre |
| `status` | text | `pending` → `accepted` / `rejected` / `cancelled` |
| `context_data` | jsonb | Métadonnées (nom appelant, priorité, type incident) |

### 2.5 `call_recordings` — Enregistrements

| Colonne | Type | Description |
|---------|------|-------------|
| `call_id` | uuid | Référence à call_history.id |
| `file_url` | text | URL dans Supabase Storage (bucket `incidents`) |
| `agora_resource_id` | text | Resource ID Agora Cloud Recording |
| `agora_sid` | text | Session ID de l'enregistrement |
| `duration_seconds` | integer | Durée de l'enregistrement |

### 2.6 `call_rejections` — Audit des refus

| Colonne | Type | Description |
|---------|------|-------------|
| `call_id` | uuid | Appel refusé |
| `operator_id` | uuid | Opérateur qui a refusé |
| `reason` | text | `manual` / autre |

---

## 3. Edge Functions liées aux appels

### 3.1 `agora-token`
**But** : Génère un token Agora RTC temporaire (1h).  
**Auth** : Aucune (ouvert, mais protégé par le JWT Supabase implicite).  
**Input** : `{ channelName, uid?, role?, expireTime? }`  
**Output** : `{ token, appId, channelName, uid, expiresAt }`

### 3.2 `rescuer-call-citizen`
**But** : Permet à un secouriste d'initier un appel vers un citoyen.  
**Auth** : Bearer token obligatoire, vérifie l'identité via `getClaims()`.  
**Input** : `{ incident_id, citizen_id, call_type? }`  
**Output** : `{ call_id, channel_name, token, app_id, uid, call_type, expires_at }`  
**Effet de bord** : Insère dans `call_history` avec `status: ringing`. Le mobile du citoyen détecte l'appel via Realtime.

### 3.3 `startCloudRecording` / `stopCloudRecording`
**But** : Démarre/arrête l'enregistrement Agora Cloud Recording.  
**Input start** : `{ channelName }`  
**Input stop** : `{ channelName, resourceId, sid }`

### 3.4 `agora-recording`
**But** : Gestion alternative des enregistrements avec persistance dans Storage.

---

## 4. Flux Détaillés — Comment chaque type d'appel fonctionne

### 4.1 Flux SOS (Citoyen → Centre d'appels)

```
MOBILE CITOYEN                    BACKEND                         DASHBOARD WEB
     │                                │                                │
     ├── INSERT incidents ────────────►│                                │
     │   (status: new,                 │                                │
     │    citizen_id: auth.uid())      │                                │
     │                                 │── trigger on_incident_created()│
     │                                 │── INSERT call_queue ──────────►│
     │                                 │── auto_assign_queue() ────────►│
     │                                 │                                │
     │                                 │                    Realtime ◄──┤
     │                                 │                    détecte     │
     │                                 │                    l'incident  │
     │                                 │                                │
     │   Agora joinChannel() ◄─────────│────── Agora joinChannel() ────┤
     │   (canal = incident.reference)  │                                │
     │                                 │                                │
     │◄──────────── AUDIO/VIDEO BIDIRECTIONNEL ────────────────────────►│
```

**Signalisation** : La table `incidents` + trigger automatique. Le mobile n'a PAS besoin d'écrire dans `call_history` pour le SOS — c'est le dashboard qui gère.

**Canal Agora** : `incident.reference` = `SOS-{incident_id}-{timestamp}`

### 4.2 Flux Sortant (Dashboard → Citoyen)

```
DASHBOARD WEB                     BACKEND                         MOBILE CITOYEN
     │                                │                                │
     ├── INSERT call_history ─────────►│                                │
     │   (call_type: outgoing,         │                                │
     │    citizen_id: target_uid,      │                                │
     │    status: ringing)             │                                │
     │                                 │         Realtime (filtre) ────►│
     │                                 │         citizen_id = auth.uid()│
     │                                 │         status = ringing       │
     │                                 │                                │
     │   Agora joinChannel() ──────────│────── Agora joinChannel() ────►│
     │                                 │                                │
     │   ◄── UPDATE call_history ──────│◄──── status: active ──────────┤
     │       (answered_at = now)       │      (citoyen décroche)       │
     │                                 │                                │
     │◄──────────── AUDIO/VIDEO ──────────────────────────────────────►│
```

**Comment le mobile détecte l'appel** :
```dart
// Flutter — Écouter les appels entrants
supabase
  .from('call_history')
  .stream(primaryKey: ['id'])
  .eq('citizen_id', currentUserId)
  .eq('status', 'ringing')
  .listen((rows) {
    // Afficher l'écran d'appel entrant
  });
```

### 4.3 Flux Interne (Secouriste Mobile → Dashboard)

```
MOBILE SECOURISTE                 BACKEND                         DASHBOARD WEB
     │                                 │                                 │
     ├── INSERT call_history ─────────►│                                │
     │   (call_type: internal,         │                                │
     │    role: secouriste,            │                                │
     │    operator_id: null,           │                                │
     │    status: ringing)             │                                │
     │                                 │    Realtime (broadcast) ──────►│
     │                                 │    TOUS les opérateurs voient  │
     │                                 │    l'appel via                 │
     │                                 │    useInternalIncomingCalls    │
     │                                 │                                │
     │                                 │    Premier opérateur qui       │
     │                                 │    décroche :                  │
     │                                 │◄── UPDATE operator_id = self ──┤
     │                                 │◄── UPDATE status = active ─────┤
     │                                 │                                │
     │                                 │    Les AUTRES opérateurs       │
     │                                 │    voient le status changer    │
     │                                 │    et dismissent l'overlay     │
     │                                 │                                │
     │   Agora joinChannel() ◄─────────│────── Agora joinChannel() ──── ┤
     │                                 │                                │
     │◄──────────── AUDIO ────────────────────────────── ──────────────►│
```

**Mécanisme de claiming** : Le premier opérateur UPDATE avec `operator_id = self` ET `status = active` WHERE `status = ringing`. Si un autre a déjà claim, l'UPDATE ne match pas (0 rows affected).

**Timeout** : 45 secondes. Si aucun opérateur ne décroche, le client-side marque l'appel comme `missed`.

**Sonnerie différenciée par rôle** :
| Rôle | Son | Intervalle |
|------|-----|------------|
| `citoyen` | Sirène critique (sawtooth 880/660 Hz) | 1.2s |
| `secouriste/volontaire` | Bip rapide (sine 740 Hz × 3) | 1.8s |
| `hopital` | Tonalité douce (sine 800→600 Hz) | 2.5s |
| `call_center/admin` | Arpège (C5-E5-G5-C6) | 2.0s |

### 4.4 Flux Rescuer → Citizen (Secouriste Mobile → Citoyen Mobile)

```
MOBILE SECOURISTE                 EDGE FUNCTION                   MOBILE CITOYEN
     │                                │                                │
     ├── POST rescuer-call-citizen ───►│                                │
     │   { incident_id, citizen_id,   │                                │
     │     call_type: "audio"|"video"}│                                │
     │                                │── Vérifie auth (JWT)           │
     │                                │── Lookup users_directory       │
     │                                │── Génère token Agora           │
     │                                │── INSERT call_history ─────────│──►
     │                                │   (channel: RESCUER-xxx,       │
     │                                │    status: ringing,            │
     │                                │    citizen_id: target,         │
     │◄── { token, channel_name } ────│    agora_token: token)         │
     │                                │                                │
     │   Agora joinChannel(token) ────│         Realtime ─────────────►│
     │                                │         citizen_id=auth.uid()  │
     │                                │         status=ringing         │
     │                                │                                │
     │                                │         Le citoyen décroche :  │
     │                                │◄── UPDATE status=active ───────┤
     │                                │    Agora joinChannel(token     │
     │                                │    from agora_token column)    │
     │                                │                                │
     │◄────────── AUDIO/VIDEO ────────────────────────────────────────►│
```

**Important pour le mobile citoyen** : Le token Agora est stocké dans `call_history.agora_token`. Le citoyen n'a PAS besoin d'appeler l'Edge Function `agora-token` — il utilise directement le token de la colonne.

### 4.5 Flux Inter-Opérateurs (Dashboard ↔ Dashboard)

Ce flux utilise la table `operator_calls` (PAS `call_history`) et n'est pas pertinent pour le mobile.

---

## 5. Comment le Mobile doit Réagir — Guide d'Implémentation

### 5.1 Écouter les appels entrants (Citoyen)

Le citoyen doit surveiller **2 sources** :

```dart
// 1. Appels sortants du dashboard (opérateur → citoyen)
supabase
  .channel('incoming-calls')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'call_history',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'citizen_id',
      value: currentAuthUid,
    ),
    callback: (payload) {
      final call = payload.newRecord;
      if (call['status'] == 'ringing') {
        // Afficher l'écran d'appel entrant
        // Utiliser call['agora_token'] si disponible, sinon fetch token
        // Utiliser call['channel_name'] pour le canal Agora
      }
    },
  )
  .subscribe();
```

### 5.2 Écouter les appels entrants (Secouriste)

Le secouriste reçoit les dispatches et peut être appelé par le centre :

```dart
// Même pattern, mais le secouriste surveille aussi operator_id
supabase
  .channel('rescuer-incoming')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'call_history',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'citizen_id',
      value: currentAuthUid, // Le dashboard met citizen_id = rescuer auth_user_id
    ),
    callback: (payload) {
      // Même logique que citoyen
    },
  )
  .subscribe();
```

### 5.3 Initier un appel (Secouriste → Citoyen)

```dart
final response = await supabase.functions.invoke(
  'rescuer-call-citizen',
  body: {
    'incident_id': incidentId,
    'citizen_id': citizenAuthUid,
    'call_type': 'audio', // ou 'video'
  },
);

final data = response.data;
// data['channel_name'] → canal Agora à rejoindre
// data['token'] → token RTC pour ce canal
// data['app_id'] → App ID Agora
// data['uid'] → UID Agora (0 = auto)

await agoraEngine.joinChannel(
  token: data['token'],
  channelId: data['channel_name'],
  uid: data['uid'],
  options: ChannelMediaOptions(
    channelProfile: ChannelProfileType.channelProfileCommunication,
    clientRoleType: ClientRoleType.clientRoleBroadcaster,
  ),
);
```

### 5.4 Initier un appel interne (Secouriste → Centre)

```dart
// Le secouriste insère directement dans call_history
await supabase.from('call_history').insert({
  'channel_name': 'INT-${myProfileId.substring(0, 8)}-${DateTime.now().millisecondsSinceEpoch}',
  'call_type': 'internal',
  'status': 'ringing',
  'caller_name': '$firstName $lastName',
  'role': 'secouriste',
  'operator_id': null, // Broadcast à tous les opérateurs
  'has_video': false,
});

// Puis fetch un token Agora et joindre le canal
final tokenResponse = await supabase.functions.invoke('agora-token', body: {
  'channelName': channelName,
  'uid': 0,
  'role': 'publisher',
});
```

### 5.5 Répondre à un appel (Citoyen)

```dart
// 1. Mettre à jour le status dans call_history
await supabase.from('call_history').update({
  'status': 'active',
  'answered_at': DateTime.now().toIso8601String(),
}).eq('id', callId);

// 2. Rejoindre le canal Agora
// Si agora_token est dans la row, l'utiliser directement
// Sinon, appeler l'Edge Function agora-token
final token = callRow['agora_token'] ?? await fetchToken(channelName);

await agoraEngine.joinChannel(
  token: token,
  channelId: callRow['channel_name'],
  uid: 0,
  options: ChannelMediaOptions(...),
);
```

### 5.6 Raccrocher

```dart
// 1. Quitter le canal Agora
await agoraEngine.leaveChannel();

// 2. Mettre à jour call_history
await supabase.from('call_history').update({
  'status': 'completed',
  'ended_at': DateTime.now().toIso8601String(),
  'ended_by': 'citizen', // ou 'rescuer'
}).eq('id', callId);
```

---

## 6. Triggers et Automatismes DB

| Trigger | Table | Effet |
|---------|-------|-------|
| `on_incident_created` | incidents | Auto-enqueue dans `call_queue` + vérification blocage |
| `on_call_history_status_change` | call_history | Quand status→completed/missed : ferme la queue, met à jour l'incident, redistribue |
| `validate_call_timestamps` | call_history | Calcule `duration_seconds` automatiquement |
| `validate_operator_claim` | call_history | Vérifie que `operator_id` correspond à `auth.uid()` |
| `deduplicate_incident` | incidents | Bloque les doublons SOS <30s pour un même citoyen |
| `recalculate_incident_priority` | sos_responses | Recalcule la priorité quand les réponses SOS changent |
| `cleanup_stale_queue_entries` | call_queue | Auto-abandon après 5 min sans réponse |

---

## 7. Politiques RLS — Ce que chaque rôle peut faire

### call_history
| Action | Citoyen | Secouriste | Opérateur/Admin |
|--------|---------|------------|-----------------|
| SELECT | Ses propres appels (`citizen_id = auth.uid()`) | Tous les appels | Tous les appels |
| INSERT | ✅ | ✅ | ✅ |
| UPDATE | Ses propres (`citizen_id = auth.uid()`) | Non | ✅ |
| DELETE | ❌ | ❌ | ❌ |

### call_queue
| Action | Citoyen | Secouriste | Opérateur/Admin |
|--------|---------|------------|-----------------|
| SELECT | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ✅ |
| UPDATE | ❌ | ❌ | ✅ |

---

## 8. Système Multi-Lignes (Dashboard uniquement)

Le dashboard supporte **jusqu'à 3 appels simultanés** via `useMultiCall` :

- Chaque ligne a son propre client Agora isolé
- Un seul appel est `active` à la fois (audio non muté)
- Les autres sont en `on_hold` (audio désactivé)
- Catégories : `sos`, `internal`, `field`, `outbound`
- Auto-hangup si l'interlocuteur distant quitte le canal (3s de grâce)
- Reconnexion automatique avec backoff exponentiel (max 5 tentatives)

---

## 9. Enregistrement Cloud

Le dashboard peut enregistrer les appels via Agora Cloud Recording :

1. `startCloudRecording` (Edge Function) → retourne `{ resourceId, sid }`
2. L'enregistrement se fait côté serveurs Agora (pas côté client)
3. `stopCloudRecording` → arrête et persiste dans le bucket Storage `incidents`
4. Métadonnées sauvées dans `call_recordings`

---

## 10. Ce qui est Fonctionnel vs À Implémenter Côté Mobile

### ✅ Fonctionnel maintenant

| Fonctionnalité | Direction | Mécanisme |
|----------------|-----------|-----------|
| SOS citoyen → centre | Mobile → Web | incidents + call_queue + Agora |
| Appel sortant vers citoyen | Web → Mobile | call_history (Realtime filtre citizen_id) |
| Appel secouriste → centre | Mobile → Web | call_history (call_type=internal, broadcast) |
| Appel secouriste → citoyen | Mobile → Mobile | Edge Function rescuer-call-citizen |
| Transfert d'appel | Web → Web | call_transfers |
| Enregistrement | Web | Cloud Recording Agora |
| Sonnerie différenciée | Web | Web Audio API par rôle |

### ⚠️ Dépend de l'implémentation mobile

| Fonctionnalité | Ce que le mobile doit implémenter |
|----------------|-----------------------------------|
| Recevoir un appel | Écouter Realtime sur call_history WHERE citizen_id=auth.uid() AND status=ringing |
| Répondre | UPDATE call_history status→active + rejoindre Agora |
| Raccrocher | UPDATE call_history status→completed + quitter Agora |
| Initier appel interne | INSERT call_history (call_type=internal) + fetch token + joindre Agora |
| Initier appel rescuer→citizen | POST rescuer-call-citizen + joindre Agora |
| Push notification (réveil) | Implémenter FCM Data Message handler pour CallKit/notification |
| Enregistrement local | Optionnel, pas géré côté backend actuellement |

### ❌ Non disponible actuellement

| Fonctionnalité | Raison |
|----------------|--------|
| Appel centre → secouriste (direct) | Pas d'Edge Function dédiée. Workaround : utiliser call_history avec citizen_id = secouriste auth_user_id |
| Appel citoyen → citoyen | Pas prévu dans l'architecture |
| Conférence multi-participants | Agora le supporte, mais pas implémenté |
| SMS/push de notification d'appel manqué | Edge Function `send-call-push` existe mais doit être connectée au flow |

---

## 11. Constantes Techniques

```
AGORA_APP_ID     = "e2e0e5a6ef0d4ce3b2ab9efad48d62cf"
TOKEN_EXPIRY     = 3600 secondes (1 heure)
CALL_TIMEOUT     = 45 secondes (auto-missed)
MAX_LINES        = 3 (multi-appels dashboard)
QUEUE_ABANDON    = 5 minutes (auto-abandon file d'attente)
RECONNECT_MAX    = 5 tentatives (backoff exponentiel 1s→10s)
AUDIO_SAMPLE     = 200ms (monitoring niveau audio)
```

---

## 12. Realtime — Configuration Requise

La table `call_history` doit avoir `REPLICA IDENTITY FULL` pour permettre le filtrage côté serveur sur `citizen_id` :

```sql
ALTER TABLE public.call_history REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_history;
```

Ceci est **critique** pour que le filtre `citizen_id=eq.{uid}` fonctionne dans les subscriptions Realtime.

---

*Document généré le 6 avril 2026 — Étoile Bleue v2*

---

## 13. Application mobile React Native secouriste (`eb-urgentiste`)

L’app terrain **React Native / Expo** du dépôt `eb-urgentiste` ne couvre **pas** tous les flux de ce document : seul le flux **§4.3 (secouriste → centrale, `call_history` internal)** est implémenté dans l’écran `CallCenter` (INSERT + `agora-token` + Agora). Les **appels entrants** depuis la centrale (`INSERT` ciblant le secouriste via `citizen_id`) ne sont **pas** encore écoutés globalement côté RN.

**Détail fichier par fichier, écarts de conventions et checklist** : [`docs/APPELS_MOBILE_ET_DASHBOARD.md`](docs/APPELS_MOBILE_ET_DASHBOARD.md).
