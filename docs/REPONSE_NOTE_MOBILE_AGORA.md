# Réponse Backend (Dashboard / Supabase) — Note Agora Mobile Expo

> Réponse point par point à `NOTE_LOVABLE_AGORA.md` de l'équipe mobile.
> Date : 2026-04-04

---

## 1. Prérequis backend — État actuel

| Élément demandé | Statut | Détails |
|---|---|---|
| **Edge Function `agora-token`** | ✅ Déployée | Accepte `{ channelName, uid?, role?, expireTime? }`. Retourne `{ token, appId, channelName, uid, expiresAt }`. Aucune restriction de rôle sur l'appel — tout JWT Supabase valide (secouriste, citoyen, hôpital) peut invoquer. |
| **CORS / auth** | ✅ OK | Headers CORS ouverts (`*`). `supabase.functions.invoke('agora-token', { body })` fonctionne depuis tout client (web, mobile, Expo). |
| **`call_history` — Realtime** | ✅ Configuré | `REPLICA IDENTITY FULL` activé. Filtrage Realtime sur `citizen_id` côté serveur opérationnel. |
| **RLS `call_history`** | ⚠️ À valider | Les secouristes peuvent `SELECT`/`INSERT`/`UPDATE` leurs propres lignes. Le filtrage se fait sur `citizen_id` ou `operator_id` selon le flux. **Action mobile** : utiliser `auth.uid()` correspondant au `auth_user_id` du secouriste pour que les policies matchent. |
| **Valeurs `ended_by`** | ✅ Documenté ci-dessous | Voir §1.1 |
| **Appels entrants dashboard → mobile** | ✅ Implémenté | Le dashboard insère dans `call_history` avec `call_type = 'outgoing'`, `citizen_id = auth_user_id_cible`, `status = 'ringing'`. Le mobile écoute les `INSERT` filtrés sur `citizen_id`. |

### 1.1 Valeurs `ended_by` — Liste exhaustive

Le dashboard utilise les valeurs suivantes. **Le mobile DOIT utiliser exactement ces chaînes** :

| Valeur | Signification | Utilisé par |
|---|---|---|
| `operator` | L'opérateur raccroche | Dashboard |
| `remote_hangup` | L'interlocuteur distant raccroche (détecté via événement Agora `user-left`) | Dashboard |
| `timeout` | Aucune réponse dans le délai imparti (30s sonnerie) | Dashboard |
| `operator_rejected` | L'opérateur rejette l'appel entrant | Dashboard |
| `rescuer` | Le secouriste raccroche | **Mobile** (à utiliser) |
| `citizen` | Le citoyen raccroche | **Mobile** (à utiliser) |
| `transfer` | Appel transféré à un autre opérateur | Dashboard |

**Règle** : lors du `UPDATE call_history` au raccroché mobile, envoyer :
```json
{
  "status": "completed",
  "ended_at": "2026-04-04T12:00:00.000Z",
  "ended_by": "rescuer",
  "duration_seconds": 145
}
```

---

## 2. Push FCM — État actuel

| Élément demandé | Statut | Détails |
|---|---|---|
| **Edge Function `send-call-push`** | ✅ Déployée | Accepte `{ citizen_id, channel_name, caller_name?, call_id? }`. Envoie un FCM v1 Data Message haute priorité avec payload `{ type: "incoming_call", callId, channelName, callerName }`. |
| **`users_directory.fcm_token`** | ✅ Colonne existe | Type `text`, nullable. Le mobile met à jour via `supabase.from('users_directory').update({ fcm_token }).eq('auth_user_id', uid)`. |
| **RLS `fcm_token`** | ✅ OK | L'utilisateur peut mettre à jour **son propre** enregistrement (`auth_user_id = auth.uid()`). |
| **Secrets FCM** | ✅ Configuré | Secret `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON complet du service account Firebase, projet `etoilebleue2-9f074`). |

### 2.1 Payload FCM reçu côté mobile

```json
{
  "data": {
    "type": "incoming_call",
    "callId": "uuid-de-la-ligne-call-history",
    "channelName": "SOS-abc123-1712234567",
    "callerName": "Opérateur Central"
  }
}
```

**Note** : c'est un **Data Message** pur (pas de `notification`), donc le mobile reçoit toujours le payload même en arrière-plan, permettant de déclencher CallKit/ConnectionService.

### 2.2 Enregistrement du token FCM — Snippet mobile

```typescript
// Au démarrage de l'app et à chaque refresh du token
const { data: { user } } = await supabase.auth.getUser();
await supabase
  .from('users_directory')
  .update({ fcm_token: token })
  .eq('auth_user_id', user.id);
```

---

## 3. Cohérence des noms de canaux — Contrat

### 3.1 Formats utilisés par le dashboard

Le dashboard n'impose **aucun parsing strict** sur le format du `channel_name`. Il le traite comme un identifiant opaque.

Les formats actuellement générés :

| Flux | Format `channel_name` | Généré par |
|---|---|---|
| SOS citoyen → centrale | `SOS-{incidentId}-{timestamp}` | App mobile citoyen |
| Appel sortant dashboard → mobile | `OUT-{uuid}` ou identifiant libre | Dashboard (Index.tsx) |
| Inter-opérateurs | `op-call-{uuid}` | Dashboard (useMultiCall) |

### 3.2 Validation du format `OP-CALL-${Date.now()}`

Le format `OP-CALL-${Date.now()}` utilisé par le mobile secouriste pour appeler la centrale est **accepté sans problème**. Le dashboard :
1. Reçoit l'insertion dans `call_history` via Realtime
2. Lit le `channel_name` tel quel
3. L'utilise pour `agora-token` et `joinChannel`

**Aucune contrainte de nommage côté serveur.** Le seul impératif : le même `channel_name` doit être utilisé partout (insertion `call_history`, appel `agora-token`, `joinChannel` Agora).

### 3.3 Recommandation d'harmonisation

Pour la lisibilité des logs et du monitoring, nous suggérons (optionnel) :

| Flux | Format recommandé |
|---|---|
| Secouriste → Centrale | `RESCUE-{rescuerId court}-{timestamp}` |
| Citoyen → Centrale | `SOS-{incidentId}-{timestamp}` |
| Dashboard → Mobile | `OUT-{callHistoryId}` |

Mais ce n'est **pas obligatoire** — tout format unique fonctionne.

---

## 4. Enregistrement cloud & transcription

### 4.1 Cloud Recording — Piloté par le dashboard

Confirmé : en V1, **le dashboard pilote l'enregistrement**.

| Edge Function | Rôle | Appelée par |
|---|---|---|
| `startCloudRecording` | Acquire + Start Agora Cloud Recording | Dashboard uniquement |
| `stopCloudRecording` | Stop + sauvegarde metadata dans Storage | Dashboard uniquement |
| `agora-recording` | Wrapper unifié (start/stop/query) | Dashboard uniquement |

Le mobile **n'a pas besoin** d'appeler ces fonctions en V1. L'opérateur déclenche/arrête l'enregistrement depuis son interface.

### 4.2 Transcription ElevenLabs

Confirmé : **dashboard-only**. L'Edge Function `elevenlabs-scribe-token` est invoquée uniquement par le composant `TranscriptionPanel.tsx` côté web. Aucune action requise côté mobile.

---

## 5. Points d'attention dashboard — Réponses

### 5.1 Premier décroché opérateur

Le dashboard implémente déjà le passage `ringing → active` :

```
// Index.tsx — lors du pick-up opérateur
UPDATE call_history SET
  status = 'active',
  operator_id = '{operator_uuid}',
  answered_at = NOW()
WHERE channel_name = '{channel_name}'
  AND status = 'ringing'
```

De plus, le dashboard écoute l'événement Agora `user-joined` pour confirmer la connexion effective au canal (double-vérification).

### 5.2 Séparation `operator_calls` vs `call_history`

| Table | Usage | Acteurs |
|---|---|---|
| `call_history` | **Tous** les appels impliquant un citoyen ou secouriste | Citoyen ↔ Opérateur, Secouriste ↔ Opérateur, Dashboard → Mobile |
| `operator_calls` | Appels **inter-opérateurs** uniquement (dashboard ↔ dashboard) | Opérateur ↔ Opérateur |

**Pas d'unification prévue.** Le mobile secouriste n'a **jamais** besoin d'interagir avec `operator_calls`. Tous les flux secouriste passent par `call_history`.

---

## 6. Résumé des actions côté mobile

### 6.1 Ce qui est prêt (aucune action backend requise)

- [x] `agora-token` : déployée, accessible, retourne `appId` dans la réponse
- [x] `send-call-push` : FCM Data Message opérationnel
- [x] `call_history` Realtime : `REPLICA IDENTITY FULL` activé
- [x] `fcm_token` dans `users_directory` : colonne prête, RLS OK
- [x] Cloud Recording : piloté dashboard, transparent pour mobile
- [x] Transcription : dashboard-only
- [x] Format `channel_name` : aucune contrainte côté serveur

### 6.2 Ce que le mobile doit implémenter

| Action | Détail |
|---|---|
| **Enregistrer `fcm_token`** | `UPDATE users_directory SET fcm_token = ? WHERE auth_user_id = auth.uid()` au démarrage + refresh |
| **Écouter `call_history` INSERT** | Filtre `citizen_id = auth.uid()` + `status = 'ringing'` pour les appels entrants dashboard → secouriste |
| **Utiliser les bonnes valeurs `ended_by`** | `rescuer` ou `citizen` (voir §1.1) |
| **Utiliser `EXPO_PUBLIC_AGORA_APP_ID`** | Valeur : `e2e0e5a6ef0d4ce3b2ab9efad48d62cf` (aussi retournée par `agora-token` dans le champ `appId`) |
| **Appeler `agora-token`** | `supabase.functions.invoke('agora-token', { body: { channelName, uid: 0 } })` |

### 6.3 Séquence d'un appel secouriste → centrale

```
Mobile                          Supabase                         Dashboard
  |                                |                                |
  |-- INSERT call_history -------->|                                |
  |   { call_type: 'internal',    |-- Realtime INSERT ----------->|
  |     channel_name: 'OP-CALL-X',|                                |
  |     status: 'ringing',        |                                |
  |     citizen_id: rescuer_uid } |                                |
  |                                |                                |
  |-- invoke agora-token --------->|                                |
  |<-- { token, appId } ----------|                                |
  |                                |                                |
  |-- joinChannel(token) -------->|          Agora Cloud           |
  |                                |                                |
  |                                |<-- Opérateur pick up ---------|
  |                                |-- UPDATE status='active' ---->|
  |                                |                                |
  |<====== Audio bidirectionnel via Agora RTC ===================>|
  |                                |                                |
  |-- leaveChannel() ------------>|                                |
  |-- UPDATE call_history ------->|                                |
  |   { status: 'completed',     |-- Realtime UPDATE ----------->|
  |     ended_by: 'rescuer',     |                                |
  |     duration_seconds: 145 }  |                                |
```

### 6.4 Séquence d'un appel dashboard → secouriste (entrant)

```
Dashboard                       Supabase                         Mobile
  |                                |                                |
  |-- INSERT call_history -------->|                                |
  |   { call_type: 'outgoing',   |                                |
  |     channel_name: 'OUT-xyz', |                                |
  |     status: 'ringing',       |                                |
  |     citizen_id: rescuer_uid }|                                |
  |                                |-- Realtime INSERT ----------->|
  |-- invoke send-call-push ----->|                                |
  |                                |-- FCM Data Message ---------->|
  |                                |                   (wake app)  |
  |                                |                                |
  |                                |<-- invoke agora-token --------|
  |                                |-- { token, appId } ---------->|
  |                                |                                |
  |<====== Audio via Agora RTC =================================>|
  |                                |                                |
  |                                |<-- UPDATE status='active' ----|
  |                                |   answered_at = NOW()         |
```

---

## 7. Variables d'environnement mobile

| Variable | Valeur | Source |
|---|---|---|
| `EXPO_PUBLIC_AGORA_APP_ID` | `e2e0e5a6ef0d4ce3b2ab9efad48d62cf` | `.local.env` (aussi retournée par `agora-token.appId`) |
| `EXPO_PUBLIC_SUPABASE_URL` | Fournie par votre config Supabase | `.local.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Fournie par votre config Supabase | `.local.env` |

---

*Réponse backend Lovable — coordination Étoile Bleue — 2026-04-04*
